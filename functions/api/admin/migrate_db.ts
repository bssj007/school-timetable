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
        // 1. performance_assessments: Add lastModifiedIp
        try {
            await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT").run();
            results.push("Added lastModifiedIp to performance_assessments");
        } catch (e: any) {
            if (e.message.includes("duplicate column name")) {
                // results.push("lastModifiedIp already exists");
            } else {
                results.push(`Error adding lastModifiedIp: ${e.message}`);
            }
        }

        // 2. Create blocked_users table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS blocked_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    identifier TEXT NOT NULL,
                    type TEXT NOT NULL,
                    reason TEXT,
                    createdAt TEXT DEFAULT (datetime('now'))
                )
            `).run();
            results.push("Checked/Created blocked_users table");
        } catch (e: any) {
            results.push(`Error creating blocked_users: ${e.message}`);
        }

        // 3. Create access_logs table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS access_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT,
                    kakaoId TEXT,
                    kakaoNickname TEXT,
                    endpoint TEXT NOT NULL,
                    method TEXT,
                    accessedAt TEXT DEFAULT (datetime('now'))
                )
            `).run();
            results.push("Checked/Created access_logs table");
        } catch (e: any) {
            results.push(`Error creating access_logs: ${e.message}`);
        }

        // 4. Create kakao_tokens table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS kakao_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kakaoId VARCHAR(255) NOT NULL UNIQUE,
                    accessToken VARCHAR(255) NOT NULL,
                    refreshToken VARCHAR(255),
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created kakao_tokens table");
        } catch (e: any) {
            results.push(`Error creating kakao_tokens: ${e.message}`);
        }

        // 5. access_logs: Add method column (if missing from old schema)
        try {
            await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN method TEXT").run();
            results.push("Added method to access_logs");
        } catch (e: any) {
            // Ignore duplicate column error
        }

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, results }), { status: 500 });
    }
}
