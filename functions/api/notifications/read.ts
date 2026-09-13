// functions/api/notifications/read.ts
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

    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const { deviceId, notificationId, notificationIds = [], all = false } = body;

        if (!deviceId) {
            return new Response(JSON.stringify({ error: "deviceId is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const idsToMark: number[] = [];
        if (notificationId) {
            idsToMark.push(Number(notificationId));
        }
        if (Array.isArray(notificationIds) && notificationIds.length > 0) {
            for (const id of notificationIds) {
                if (!idsToMark.includes(Number(id))) idsToMark.push(Number(id));
            }
        }

        if (all) {
            // Mark all recent notifications as read for this device
            const { results = [] } = await env.DB.prepare(`SELECT id FROM site_notifications ORDER BY created_at DESC LIMIT 50`).all();
            for (const r of results) {
                if (!idsToMark.includes(r.id)) idsToMark.push(r.id);
            }
        }

        if (idsToMark.length > 0) {
            const stmts = idsToMark.map(id => 
                env.DB.prepare(`
                    INSERT OR IGNORE INTO notification_reads (notification_id, client_id, read_at)
                    VALUES (?, ?, datetime('now'))
                `).bind(id, deviceId)
            );
            await env.DB.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, markedCount: idsToMark.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err: any) {
        console.error("[api/notifications/read] Error:", err);
        return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
