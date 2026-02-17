
import { adminPassword } from "../../../server/adminPW";

export const onRequestPost = async (context: any) => {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { confirmation } = body;
        const TARGET_PHRASE = "햇빛이 선명하게 나뭇잎을 핥고 있었다";

        if (confirmation !== TARGET_PHRASE) {
            return new Response(JSON.stringify({ error: "Invalid confirmation phrase" }), { status: 401 });
        }

        // 1. Auth Check (Added)
        const password = request.headers.get("X-Admin-Password");
        if (password !== adminPassword) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        if (!env.DB) {
            return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
        }

        // 2. Drop Tables (Dynamic Factory Reset)
        // Fetch all table names
        const { results } = await env.DB.prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_cf_KV'"
        ).all();

        // Drop each table
        for (const row of results) {
            const tableName = row.name;
            await env.DB.prepare(`DROP TABLE IF EXISTS "${tableName}"`).run();
        }

        return new Response(JSON.stringify({ success: true, message: "Database reset complete" }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
