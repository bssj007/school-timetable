
import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // 1. Auth Check
    const password = request.headers.get("X-Admin-Password");
    if (password !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), { status: 500 });
    }

    try {
        // Ensure table exists
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        // 2. GET Settings
        if (request.method === "GET") {
            const { results } = await env.DB.prepare("SELECT key, value FROM system_settings").all();
            const settings: any = {};
            results.forEach((row: any) => {
                settings[row.key] = row.value;
            });
            return new Response(JSON.stringify(settings), { headers: { "Content-Type": "application/json" } });
        }

        // 3. POST (Update) Settings
        if (request.method === "POST") {
            const body = await request.json();

            // Upsert each key-value pair
            const stmt = env.DB.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)");
            const batch = [];

            for (const [key, value] of Object.entries(body)) {
                // Store values as strings
                batch.push(stmt.bind(key, String(value)));
            }

            if (batch.length > 0) {
                await env.DB.batch(batch);
            }

            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response("Method not allowed", { status: 405 });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
    }
}
