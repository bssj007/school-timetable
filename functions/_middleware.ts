import { createStudentProfilesTable, createIpProfilesTable } from "./db_schema";

interface Env {
    DB: D1Database;
}

export const onRequest = async (context: any) => {
    const { request, env, next } = context;
    const url = new URL(request.url);


    // 1. Log Access (Response)
    const response = await next();

    // 5. Client ID Management (Cookie)
    // Structure: We need to handle this BEFORE response ideally, but since we are in middleware,
    // we can append to response headers if it's new.

    const cookies = request.headers.get('Cookie') || '';

    // Pass Context
    context.data = { ...context.data };

    // Async task for Logging & Profile Update
    const logTrace = async () => {
        // SKIP for Admin APIs to verify race conditions during DB Reset
        if (url.pathname.startsWith('/api/admin')) return;

        if (!env.DB) return;

        try {
            const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
            const userAgent = request.headers.get('User-Agent') || '';

            // Parse Other Cookies
            let grade = null, classNum = null, studentNumber = null;
            let kakaoId = null, kakaoNickname = null;

            if (cookies) {
                const configMatch = cookies.match(new RegExp('(^| )school_timetable_config=([^;]+)'));
                if (configMatch) {
                    try {
                        const config = JSON.parse(decodeURIComponent(configMatch[2]));
                        grade = config.grade;
                        classNum = config.classNum;
                        studentNumber = config.studentNumber;
                    } catch (e) { }
                }

                const kakaoMatch = cookies.match(new RegExp('(^| )kakao_user_data=([^;]+)'));
                if (kakaoMatch) {
                    try {
                        const kakaoData = JSON.parse(decodeURIComponent(kakaoMatch[2]));
                        kakaoId = kakaoData.id?.toString();
                        kakaoNickname = kakaoData.nickname;
                    } catch (e) { }
                }
            }

            // 1. Insert Log (with Auto-Migration for Table Creation)
            const insertLog = async () => {
                await env.DB.prepare(
                    "INSERT INTO access_logs (ip, userAgent, method, endpoint, status, grade, classNum, studentNumber, kakaoId, kakaoNickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(ip, userAgent, request.method, url.pathname, response.status, grade, classNum, studentNumber, kakaoId, kakaoNickname).run();
            };

            try {
                await insertLog();
            } catch (e: any) {
                // Auto-Migration: Table missing or Column missing
                if (e.message && e.message.includes("no such table")) {
                    console.log("[Middleware] Creating access_logs table");
                    try {
                        // Create table with ALL current columns
                        await env.DB.prepare(`
                            CREATE TABLE IF NOT EXISTS access_logs (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                ip TEXT NOT NULL,
                                userAgent TEXT,
                                method TEXT,
                                endpoint TEXT,
                                status INTEGER,
                                grade INTEGER,
                                classNum INTEGER,
                                studentNumber INTEGER,
                                kakaoId TEXT,
                                kakaoNickname TEXT,
                                accessedAt TEXT DEFAULT (datetime('now'))
                            )
                        `).run();
                        await insertLog();
                    } catch (createError) {
                        console.error("[Middleware] Create access_logs Failed:", createError);
                    }
                } else if (e.message && e.message.includes("no such column")) {
                    // Ignore column errors for now or handle specific migrations if needed
                    console.warn("[Middleware] Column mismatch in access_logs", e);
                } else {
                    console.error("[Middleware] Log Insert Failed:", e);
                }
            }


            // 2. Dynamic Profile Creation Helper (Using Correct DB Schema)
            const ensureStudentProfileAndGetId = async (g: number, c: number, s: number) => {
                try {
                    const res = await env.DB.prepare(`
                        INSERT INTO student_profiles (grade, classNum, studentNumber, updatedAt) 
                        VALUES (?, ?, ?, datetime('now'))
                        ON CONFLICT(grade, classNum, studentNumber) 
                        DO UPDATE SET updatedAt = datetime('now')
                        RETURNING id
                    `).bind(g, c, s).first();
                    return res?.id as number | null;
                } catch (e: any) {
                    console.error("[Middleware] Student Profile Upsert Failed:", e);
                    if (e.message && e.message.includes("no such table")) {
                        console.log("[Middleware] Creating student_profiles table (New Schema from db_schema.ts)");
                        try {
                            await env.DB.prepare(createStudentProfilesTable).run();
                            // Retry Insert
                            const res = await env.DB.prepare(`
                                INSERT INTO student_profiles (grade, classNum, studentNumber, updatedAt) 
                                VALUES (?, ?, ?, datetime('now'))
                                ON CONFLICT(grade, classNum, studentNumber) 
                                DO UPDATE SET updatedAt = datetime('now')
                                RETURNING id
                            `).bind(g, c, s).first();
                            return res?.id as number | null;
                        } catch (createError) {
                            console.error("[Middleware] Create student_profiles Failed:", createError);
                        }
                    } else if (e.message && e.message.includes("has no column named")) {
                        console.warn("[Middleware] student_profiles schema mismatch:", e.message);
                    }
                    return null;
                }
            };

            // Calculate Target ID
            let resolvedStudentProfileId: number | null = null;
            if (grade && classNum && studentNumber) {
                const g = parseInt(grade);
                const c = parseInt(classNum);
                const n = parseInt(studentNumber);
                if (!isNaN(g) && !isNaN(c) && !isNaN(n)) {
                    resolvedStudentProfileId = await ensureStudentProfileAndGetId(g, c, n);
                }
            }

            // Helper: Retry Operation with Backoff
            const retryOperation = async (fn: () => Promise<void>, retries = 3, delay = 50) => {
                for (let i = 0; i < retries; i++) {
                    try {
                        await fn();
                        return true;
                    } catch (e: any) {
                        if (i === retries - 1) throw e; // Final attempt failed
                        // Check if error is worth retrying (Lock or FK)
                        if (e.message && (e.message.includes("database is locked") || e.message.includes("FOREIGN KEY"))) {
                            console.warn(`[Middleware] Retry ${i + 1}/${retries} failed: ${e.message}. Retrying in ${delay}ms...`);
                            await new Promise(res => setTimeout(res, delay));
                            delay *= 2; // Exponential backoff
                        } else {
                            throw e; // Non-retryable error
                        }
                    }
                }
                return false;
            };

            // 3. Update IP Profile (Link to student_profile_id)
            const updateIpProfile = async () => {
                const isEditAction = (['POST', 'DELETE', 'PATCH', 'PUT'].includes(request.method) && url.pathname.startsWith('/api/assessment'));

                const query = `
                    INSERT INTO ip_profiles (ip, student_profile_id, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent)
                    VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
                    ON CONFLICT(ip) DO UPDATE SET
                        lastAccess = datetime('now'),
                        userAgent = excluded.userAgent,
                        student_profile_id = excluded.student_profile_id,
                        kakaoId = COALESCE(excluded.kakaoId, ip_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, ip_profiles.kakaoNickname),
                        modificationCount = ip_profiles.modificationCount + ?
                `;

                const increment = isEditAction ? 1 : 0;

                const executeLink = async (profileId: number | null) => {
                    await env.DB.prepare(query).bind(
                        ip,
                        profileId,
                        kakaoId,
                        kakaoNickname,
                        increment, // Initial value
                        userAgent,
                        increment // Increment value for update
                    ).run();
                };

                // Logic with Retry
                try {
                    await retryOperation(async () => {
                        await executeLink(resolvedStudentProfileId);
                    });
                } catch (e: any) {
                    if (resolvedStudentProfileId !== null && (e.message && (e.message.includes("FOREIGN KEY") || e.message.includes("constraint")))) {
                        console.warn(`[Middleware] FK Violation for profile ${resolvedStudentProfileId} after retries.`);
                        console.warn(`[Middleware] Fallback to NULL link.`);
                        await executeLink(null);
                    } else if (e.message && e.message.includes("database is locked")) {
                        console.error("[Middleware] Database Locked. Skipping profile update to prevent blocking.");
                    } else {
                        throw e;
                    }
                }
            };

            try {
                await updateIpProfile();
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    console.log("[Middleware] Creating ip_profiles table (New Schema)");
                    try {
                        await env.DB.prepare(createIpProfilesTable).run();
                        // Retry update
                        await updateIpProfile();
                    } catch (migrationError) {
                        console.error("[Middleware] Migration Failed for ip_profiles:", migrationError);
                    }
                } else if (e.message && e.message.includes("has no column named")) {
                    console.warn("[Middleware] ip_profiles schema mismatch:", e.message);
                } else {
                    console.error("IP Profile Update Error", e);
                }
            }

        } catch (e) {
            console.error("Log/Profile Update Failed:", e);
        }
    };

    // Placeholder for background tasks if it was missing
    const runBackgroundTasks = async () => {
        // Implement any daily cleanup or checks here
    };

    context.waitUntil(Promise.all([logTrace(), runBackgroundTasks()]));

    // Set Cookie if new
    // Cookie setting removed as per user request
    // if (newClientDetails) ...

    return response;
};
