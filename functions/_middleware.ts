
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
    let clientId: string | null = null;
    let newClientDetails = false;

    if (cookies) {
        const clientMatch = cookies.match(new RegExp('(^| )school_client_id=([^;]+)'));
        if (clientMatch) {
            clientId = decodeURIComponent(clientMatch[2]);
        }
    }

    if (!clientId) {
        clientId = crypto.randomUUID();
        newClientDetails = true;
    }

    // Pass Client ID to downstream functions (if they access it via context.data)
    context.data = { ...context.data, clientId };

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

            // 1. Insert Log (with Auto-Migration for client_id and Table Creation)
            const insertLog = async () => {
                await env.DB.prepare(
                    "INSERT INTO access_logs (ip, userAgent, method, endpoint, status, grade, classNum, studentNumber, kakaoId, kakaoNickname, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(ip, userAgent, request.method, url.pathname, response.status, grade, classNum, studentNumber, kakaoId, kakaoNickname, clientId).run();
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
                                client_id TEXT,
                                accessedAt TEXT DEFAULT (datetime('now'))
                            )
                        `).run();
                        await insertLog();
                    } catch (createError) {
                        console.error("[Middleware] Create access_logs Failed:", createError);
                    }
                } else if (e.message && (e.message.includes("no such column") || e.message.includes("client_id"))) {
                    console.log("[Middleware] Adding client_id column to access_logs");
                    try {
                        await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN client_id TEXT").run();
                        await insertLog();
                    } catch (migrationError) {
                        console.error("[Middleware] Migration Failed for access_logs:", migrationError);
                    }
                } else {
                    console.error("[Middleware] Log Insert Failed:", e);
                }
            }


            // 2. Dynamic Profile Creation (student_profiles)
            let studentId: number | null = null;
            if (grade && classNum && studentNumber) {
                try {
                    const g = parseInt(grade);
                    const c = parseInt(classNum);
                    const n = parseInt(studentNumber);

                    if (!isNaN(g) && !isNaN(c) && !isNaN(n)) {
                        const idStr = `${g}${c}${n.toString().padStart(2, '0')}`;
                        studentId = parseInt(idStr);

                        await env.DB.prepare(`
                            INSERT INTO student_profiles (id, updatedAt, grade, classNum, studentNumber) 
                            VALUES (?, datetime('now'), ?, ?, ?)
                            ON CONFLICT(id) 
                            DO UPDATE SET updatedAt = datetime('now')
                        `).bind(studentId, g, c, n).run();
                    }
                } catch (e: any) {
                    if (e.message && e.message.includes("no such table")) {
                        console.log("[Middleware] Creating student_profiles table");
                        try {
                            await env.DB.prepare(`
                                CREATE TABLE IF NOT EXISTS student_profiles (
                                    id INTEGER PRIMARY KEY,
                                    grade INTEGER NOT NULL,
                                    classNum INTEGER NOT NULL,
                                    studentNumber INTEGER,
                                    electives TEXT,
                                    updatedAt TEXT DEFAULT (datetime('now')),
                                    UNIQUE(grade, classNum, studentNumber)
                                )
                            `).run();
                            // Retry Insert
                            if (studentId) {
                                const g = parseInt(grade);
                                const c = parseInt(classNum);
                                const n = parseInt(studentNumber);
                                await env.DB.prepare(`
                                    INSERT INTO student_profiles (id, updatedAt, grade, classNum, studentNumber) 
                                    VALUES (?, datetime('now'), ?, ?, ?)
                                    ON CONFLICT(id) 
                                    DO UPDATE SET updatedAt = datetime('now')
                                `).bind(studentId, g, c, n).run();
                            }
                        } catch (createError) {
                            console.error("[Middleware] Create student_profiles Failed:", createError);
                        }
                    }
                }
            }

            // 3. Update Cookie Profile (with Auto-Creation)
            const updateCookieProfile = async () => {
                const existing = await env.DB.prepare("SELECT modificationCount FROM cookie_profiles WHERE client_id = ?").bind(clientId).first();
                let modCount = existing ? (existing.modificationCount as number) : 0;

                if (['POST', 'DELETE'].includes(request.method) && url.pathname.startsWith('/api/assessment')) {
                    modCount++;
                }

                let query = `
                    INSERT INTO cookie_profiles (client_id, ip, student_profile_id, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent, grade, classNum, studentNumber)
                    VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
                    ON CONFLICT(client_id) DO UPDATE SET
                        lastAccess = datetime('now'),
                        ip = excluded.ip,
                        userAgent = excluded.userAgent,
                        modificationCount = ?,
                        kakaoId = COALESCE(excluded.kakaoId, cookie_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, cookie_profiles.kakaoNickname),
                        grade = COALESCE(excluded.grade, cookie_profiles.grade),
                        classNum = COALESCE(excluded.classNum, cookie_profiles.classNum),
                        studentNumber = COALESCE(excluded.studentNumber, cookie_profiles.studentNumber)
                `;

                const binds: any[] = [clientId, ip, studentId, kakaoId, kakaoNickname, modCount, userAgent, grade, classNum, studentNumber, modCount];

                if (studentId) {
                    query += `, student_profile_id = ?`;
                    binds.push(studentId);
                }

                await env.DB.prepare(query).bind(...binds).run();
            };

            try {
                await updateCookieProfile();
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    console.log("[Middleware] Creating cookie_profiles table");
                    try {
                        await env.DB.prepare(`
                            CREATE TABLE IF NOT EXISTS cookie_profiles (
                                client_id TEXT PRIMARY KEY,
                                student_profile_id INTEGER,
                                kakaoId TEXT,
                                kakaoNickname TEXT,
                                lastAccess TEXT,
                                modificationCount INTEGER DEFAULT 0,
                                userAgent TEXT,
                                instructionDismissed INTEGER DEFAULT 0,
                                ip TEXT,
                                grade INTEGER,
                                classNum INTEGER,
                                studentNumber INTEGER,
                                FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
                            )
                        `).run();
                        // Retry update
                        await updateCookieProfile();
                    } catch (migrationError) {
                        console.error("[Middleware] Migration Failed for cookie_profiles:", migrationError);
                    }
                } else {
                    console.error("Cookie Profile Update Error", e);
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
    if (newClientDetails) {
        response.headers.append('Set-Cookie', `school_client_id=${clientId}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`);
    }

    return response;
};
