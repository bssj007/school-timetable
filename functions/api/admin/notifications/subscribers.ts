// functions/api/admin/notifications/subscribers.ts
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

    if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        // Only return subscribers who have enabled notifications (is_active = 1)
        const { results = [] } = await env.DB.prepare(`
            SELECT 
                id,
                role,
                client_id,
                grade,
                class_num as classNum,
                student_number as studentNumber,
                student_name as studentName,
                teacher_name as teacherName,
                platform,
                user_agent as userAgent,
                ip,
                created_at as createdAt,
                updated_at as updatedAt
            FROM notification_subscriptions
            WHERE is_active = 1
            ORDER BY updated_at DESC
        `).all();

        const students = results.filter((s: any) => s.role === "student");
        const teachers = results.filter((s: any) => s.role === "teacher");

        return new Response(JSON.stringify({
            subscribers: results,
            students,
            teachers,
            totalCount: results.length
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err: any) {
        console.error("[api/admin/notifications/subscribers] Error:", err);
        return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
