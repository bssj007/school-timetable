// functions/api/notifications/subscribe.ts
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
        const {
            deviceId,
            role = "student",
            grade = 0,
            classNum = 0,
            studentNumber = 0,
            studentName = "",
            teacherName = "",
            platform = "web",
            pushSubscription = "",
            enabled = 1
        } = body;

        if (!deviceId || typeof deviceId !== "string") {
            return new Response(JSON.stringify({ error: "deviceId is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "127.0.0.1";
        const userAgent = request.headers.get("User-Agent") || "";
        const pushSubStr = typeof pushSubscription === "object" ? JSON.stringify(pushSubscription) : String(pushSubscription || "");
        const isActive = enabled ? 1 : 0;

        // 1. Upsert notification_subscriptions
        await env.DB.prepare(`
            INSERT INTO notification_subscriptions (
                role, client_id, ip, user_agent, platform,
                grade, class_num, student_number, student_name,
                teacher_name, push_subscription, is_active, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(client_id, role) DO UPDATE SET
                ip = excluded.ip,
                user_agent = excluded.user_agent,
                platform = excluded.platform,
                grade = CASE WHEN excluded.grade > 0 THEN excluded.grade ELSE notification_subscriptions.grade END,
                class_num = CASE WHEN excluded.class_num > 0 THEN excluded.class_num ELSE notification_subscriptions.class_num END,
                student_number = CASE WHEN excluded.student_number > 0 THEN excluded.student_number ELSE notification_subscriptions.student_number END,
                student_name = CASE WHEN excluded.student_name != '' THEN excluded.student_name ELSE notification_subscriptions.student_name END,
                teacher_name = CASE WHEN excluded.teacher_name != '' THEN excluded.teacher_name ELSE notification_subscriptions.teacher_name END,
                push_subscription = CASE WHEN excluded.push_subscription != '' THEN excluded.push_subscription ELSE notification_subscriptions.push_subscription END,
                is_active = excluded.is_active,
                updated_at = datetime('now')
        `).bind(
            role,
            deviceId,
            ip,
            userAgent,
            platform,
            Number(grade) || 0,
            Number(classNum) || 0,
            Number(studentNumber) || 0,
            String(studentName || "").trim(),
            String(teacherName || "").trim(),
            pushSubStr,
            isActive
        ).run();

        // 2. Proactively update ip_profiles for real-time reflection in Admin User Management
        try {
            await env.DB.prepare(`
                UPDATE ip_profiles 
                SET notificationEnabled = ? 
                WHERE ip = ?
            `).bind(isActive, ip).run();
        } catch (_) {}

        // 3. Return response with cookie
        const cookieHeader = `sj_notification_enabled=${isActive}; Path=/; Max-Age=31536000; SameSite=Lax`;
        return new Response(JSON.stringify({
            success: true,
            deviceId,
            role,
            enabled: isActive === 1
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie": cookieHeader
            }
        });

    } catch (err: any) {
        console.error("[api/notifications/subscribe] Error:", err);
        return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
