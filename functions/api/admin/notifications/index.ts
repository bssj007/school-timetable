// functions/api/admin/notifications/index.ts
import { verifyAdminPassword } from "../../../../server/adminPW";
import { ensureNotificationTables } from "../../../db_schema_notifications";

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

    await ensureNotificationTables(env.DB);

    if (request.method === "GET") {
        try {
            const { results = [] } = await env.DB.prepare(`
                SELECT 
                    sn.*,
                    (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id = sn.id) as read_count
                FROM site_notifications sn
                ORDER BY sn.created_at DESC
                LIMIT 100
            `).all();

            return new Response(JSON.stringify({ notifications: results }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        } catch (err: any) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    if (request.method === "DELETE") {
        try {
            const url = new URL(request.url);
            const id = url.searchParams.get("id");
            if (!id) {
                return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });
            }

            await env.DB.prepare(`DELETE FROM notification_reads WHERE notification_id = ?`).bind(Number(id)).run();
            await env.DB.prepare(`DELETE FROM site_notifications WHERE id = ?`).bind(Number(id)).run();

            return new Response(JSON.stringify({ success: true, deletedId: id }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        } catch (err: any) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    return new Response("Method not allowed", { status: 405 });
};
