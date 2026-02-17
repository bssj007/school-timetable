
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


            // 2. Dynamic Profile Creation (student_profiles)
            // NEW SCHEMA: Use 4-digit studentNumber as PK (e.g. 1101, 3524)
            // This replaces the old auto-increment ID and separates grade/class logic
            let targetStudentNumber: number | null = null;

            if (grade && classNum && studentNumber) {
                try {
                    const g = parseInt(grade);
                    const c = parseInt(classNum);
                    const n = parseInt(studentNumber);

                    if (!isNaN(g) && !isNaN(c) && !isNaN(n)) {
                        // Construct 4-digit ID: G C NN (e.g. 1 1 01 -> 1101)
                        // Note: ClassNum can be 2 digits (10~15), so we need 1-2-05 format?
                        // User request: "1st digit is grade, second digit is classrum 3rd and 4th digit is personal number"
                        // Wait, if class is 10, 11, 12, this format (G C NN) might break if C is single digit in concept but double in reality.
                        // However, assuming standard Korean high school:
                        // Grade: 1-3
                        // Class: 1-15 (usually)
                        // If class is 2 digits, "second digit is classrum" breaks. 
                        // Let's assume the user implies a standard 4 digit format like: G C NN is NOT enough for class > 9.
                        // Standard format is usually G CC NN (5 digits) or just sequential.
                        // BUT User said: "1st digit is grade, second digit is classrum 3rd and 4th digit is personal number"
                        // This implies class is 1-9 only? Or maybe hex? 
                        // Let's look at the user request again: "1st digit is grade, second digit is classrum 3rd and 4th digit is personal number"
                        // Use existing logic: `const idStr = ${g}${c}${n.toString().padStart(2, '0')}` was used before.
                        // If class is 12, it becomes 11201 (5 digits).
                        // If the user insists on 4 digits, class must be < 10.
                        // "Abolish ID, grade, classnum... 4 digit studentNumber contains both grade, classrum and student profile"

                        // Let's stick to the generated ID logic but treat it as the "studentNumber" PK.
                        // If it goes above 4 digits (e.g. Class 12), so be it. It's an Integer.

                        const idStr = `${g}${c}${n.toString().padStart(2, '0')}`;
                        targetStudentNumber = parseInt(idStr);

                        // Upsert Student Profile
                        // We do NOT store grade/class anymore. catch-all content column remains.
                        await env.DB.prepare(`
                            INSERT INTO student_profiles (studentNumber, lastModified) 
                            VALUES (?, datetime('now'))
                            ON CONFLICT(studentNumber) 
                            DO UPDATE SET lastModified = datetime('now')
                        `).bind(targetStudentNumber).run();
                    }
                } catch (e: any) {
                    console.error("[Middleware] Student Profile Upsert Failed:", e);

                    if (e.message && e.message.includes("no such table")) {
                        console.log("[Middleware] Creating student_profiles table (New Schema)");
                        try {
                            // NEW SCHEMA
                            await env.DB.prepare(`
                                CREATE TABLE IF NOT EXISTS student_profiles (
                                    studentNumber INTEGER PRIMARY KEY,
                                    content TEXT,
                                    lastModified TEXT
                                )
                            `).run();

                            // Retry Insert
                            if (targetStudentNumber) {
                                await env.DB.prepare(`
                                    INSERT INTO student_profiles (studentNumber, lastModified) 
                                    VALUES (?, datetime('now'))
                                    ON CONFLICT(studentNumber) 
                                    DO UPDATE SET lastModified = datetime('now')
                                `).bind(targetStudentNumber).run();
                            }
                        } catch (createError) {
                            console.error("[Middleware] Create student_profiles Failed:", createError);
                            targetStudentNumber = null;
                        }
                    } else {
                        targetStudentNumber = null;
                    }
                }
            }

            // 3. Update IP Profile (Link to studentNumber)
            const updateIpProfile = async () => {
                // Check if IP profile exists
                // We want to update: studentNumber (link), kakaoInfo, userAgent, lastAccess

                let query = `
                    INSERT INTO ip_profiles (ip, studentNumber, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent)
                    VALUES (?, ?, ?, ?, datetime('now'), 0, ?)
                    ON CONFLICT(ip) DO UPDATE SET
                        lastAccess = datetime('now'),
                        userAgent = excluded.userAgent,
                        studentNumber = excluded.studentNumber,
                        kakaoId = COALESCE(excluded.kakaoId, ip_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, ip_profiles.kakaoNickname)
                `;

                // If existing, we might want to increment editCount only on specific actions, 
                // but simpler to just upsert for linking.
                // Note: editCount logic was:
                // if (['POST', 'DELETE'].includes(request.method) && url.pathname.startsWith('/api/assessment'))

                // Let's preserve editCount increment logic
                // But we can't easily do "value + 1" in upsert if we are binding a specific value for other fields.
                // Actually we can: modificationCount = ip_profiles.modificationCount + (CASE WHEN ? THEN 1 ELSE 0 END)

                const isEditAction = (['POST', 'DELETE', 'PATCH', 'PUT'].includes(request.method) && url.pathname.startsWith('/api/assessment'));

                query = `
                    INSERT INTO ip_profiles (ip, studentNumber, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent)
                    VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
                    ON CONFLICT(ip) DO UPDATE SET
                        lastAccess = datetime('now'),
                        userAgent = excluded.userAgent,
                        studentNumber = excluded.studentNumber,
                        kakaoId = COALESCE(excluded.kakaoId, ip_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, ip_profiles.kakaoNickname),
                        modificationCount = ip_profiles.modificationCount + ?
                `;

                const increment = isEditAction ? 1 : 0;
                // Initial insert modificationCount is increment if it's an edit, else 0.

                await env.DB.prepare(query).bind(
                    ip,
                    targetStudentNumber,
                    kakaoId,
                    kakaoNickname,
                    increment, // Initial value
                    userAgent,
                    increment // Increment value for update
                ).run();
            };

            try {
                await updateIpProfile();
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    console.log("[Middleware] Creating ip_profiles table (New Schema)");
                    try {
                        await env.DB.prepare(`
                            CREATE TABLE IF NOT EXISTS ip_profiles (
                                ip TEXT PRIMARY KEY,
                                studentNumber INTEGER,
                                kakaoId TEXT,
                                kakaoNickname TEXT,
                                lastAccess TEXT,
                                modificationCount INTEGER DEFAULT 0,
                                userAgent TEXT,
                                instructionDismissed INTEGER DEFAULT 0,
                                FOREIGN KEY (studentNumber) REFERENCES student_profiles(studentNumber)
                            )
                        `).run();
                        // Retry update
                        await updateIpProfile();
                    } catch (migrationError) {
                        console.error("[Middleware] Migration Failed for ip_profiles:", migrationError);
                    }
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
