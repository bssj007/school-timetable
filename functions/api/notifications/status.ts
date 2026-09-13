// functions/api/notifications/status.ts
import { ensureNotificationTables } from "../../db_schema_notifications";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    await ensureNotificationTables(env.DB);

    if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        const row = await env.DB.prepare(
            "SELECT value FROM system_settings WHERE key = 'notification_system_enabled'"
        ).first();

        const systemEnabled = row ? (row.value !== "0" && row.value !== "false") : true;

        return new Response(JSON.stringify({ systemEnabled }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            }
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, systemEnabled: true }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
