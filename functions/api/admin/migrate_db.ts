import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // Authentication Check
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    const results = [];

    try {
        // 1. users Table (Core Auth)
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    openId VARCHAR(64) NOT NULL UNIQUE,
                    name TEXT,
                    email VARCHAR(320),
                    loginMethod VARCHAR(64),
                    role TEXT NOT NULL DEFAULT 'user', -- mysqlEnum shim
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created users table");
        } catch (e: any) {
            results.push(`Error creating users: ${e.message}`);
        }

        // 2. performance_assessments Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS performance_assessments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject VARCHAR(100) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    dueDate VARCHAR(20) NOT NULL,
                    grade INTEGER NOT NULL,
                    classNum INTEGER NOT NULL,
                    classTime INTEGER,
                    isDone INTEGER DEFAULT 0,
                    lastModifiedIp VARCHAR(45),
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            // ensure lastModifiedIp exists (migration support)
            try {
                await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT").run();
            } catch (e) { }

            results.push("Checked/Created performance_assessments table");
        } catch (e: any) {
            results.push(`Error creating performance_assessments: ${e.message}`);
        }

        // 3. blocked_users Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS blocked_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    identifier VARCHAR(255) NOT NULL,
                    type TEXT NOT NULL,
                    reason TEXT,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created blocked_users table");
        } catch (e: any) {
            results.push(`Error creating blocked_users: ${e.message}`);
        }

        // 4. access_logs Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS access_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip VARCHAR(45) NOT NULL,
                    kakaoId VARCHAR(255),
                    kakaoNickname VARCHAR(255),
                    endpoint VARCHAR(255) NOT NULL,
                    method VARCHAR(10),
                    userAgent TEXT,
                    accessedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            // ensure method exists (migration support)
            try {
                await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN method TEXT").run();
            } catch (e) { }

            results.push("Checked/Created access_logs table");
        } catch (e: any) {
            results.push(`Error creating access_logs: ${e.message}`);
        }

        // 5. kakao_tokens Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS kakao_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kakaoId VARCHAR(255) NOT NULL UNIQUE,
                    accessToken TEXT NOT NULL,
                    refreshToken TEXT,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created kakao_tokens table");
        } catch (e: any) {
            results.push(`Error creating kakao_tokens: ${e.message}`);
        }

        // 6. system_settings Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created system_settings table");
        } catch (e: any) {
            results.push(`Error creating system_settings: ${e.message}`);
        }

        // 7. notification_logs Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS notification_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type VARCHAR(50) NOT NULL,
                    target_date VARCHAR(20),
                    status VARCHAR(20) NOT NULL,
                    message TEXT,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created notification_logs table");
        } catch (e: any) {
            results.push(`Error creating notification_logs: ${e.message}`);
        }

        // 8. Migration: Add grade/class to users if missing
        try {
            await env.DB.prepare("ALTER TABLE users ADD COLUMN grade INTEGER").run();
            results.push("Added grade to users");
        } catch (e) { }
        try {
            await env.DB.prepare("ALTER TABLE users ADD COLUMN class INTEGER").run();
            results.push("Added class to users");
        } catch (e) { }

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, results }), { status: 500 });
    }
}
