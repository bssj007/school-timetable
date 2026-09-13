// functions/api/admin/notifications/master-switch.ts
import { verifyAdminPassword } from "../../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    const password = request.headers.get("X-Admin-Password");
    if (!verifyAdminPassword(password, env)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        if (request.method === "GET") {
            const row = await env.DB.prepare(
                "SELECT value FROM system_settings WHERE key = 'notification_system_enabled'"
            ).first();

            // Default is ON (true)
            const enabled = row ? (row.value !== "0" && row.value !== "false") : true;

            return new Response(JSON.stringify({ enabled }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method === "POST") {
            const body = await request.json().catch(() => ({}));
            const enabled = Boolean(body.enabled);
            const valStr = enabled ? "1" : "0";

            await env.DB.prepare(`
                INSERT INTO system_settings (key, value)
                VALUES ('notification_system_enabled', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).bind(valStr).run();

            return new Response(JSON.stringify({ success: true, enabled }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response("Method not allowed", { status: 405 });
    } catch (err: any) {
        console.error("[api/admin/notifications/master-switch] Error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
