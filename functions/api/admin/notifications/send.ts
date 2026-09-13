// functions/api/admin/notifications/send.ts
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

    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const {
            targetType = "all", // 'all' | 'student' | 'teacher'
            targetGrade = 0,
            targetClass = 0,
            targetStudentNumber = 0,
            targetStudentName = "",
            targetTeacherName = "",
            title = "",
            message = "",
            link = "/",
            category = "assessment",
            deliveryType = "all" // 'all' | 'push' | 'in_app' | 'app'
        } = body;

        if (!title.trim() || !message.trim()) {
            return new Response(JSON.stringify({ error: "Title and message are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 1. Insert into site_notifications
        const insertRes = await env.DB.prepare(`
            INSERT INTO site_notifications (
                target_type, target_grade, target_class, target_student_number,
                target_student_name, target_teacher_name, title, message, link, category, delivery_type, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            targetType,
            Number(targetGrade) || 0,
            Number(targetClass) || 0,
            Number(targetStudentNumber) || 0,
            String(targetStudentName || "").trim(),
            String(targetTeacherName || "").trim(),
            title.trim(),
            message.trim(),
            link.trim() || "/",
            category,
            deliveryType
        ).run();

        const notificationId = insertRes.meta?.last_row_id;

        // 2. Count matching active subscribers based on target and delivery technology
        let subscriberQuery = `
            SELECT id, role, grade, class_num, student_number, student_name, teacher_name, platform
            FROM notification_subscriptions
            WHERE is_active = 1
        `;
        const bindings: any[] = [];

        // Filter by delivery technology if applicable
        if (deliveryType === "app") {
            subscriberQuery += ` AND platform IN ('pwa', 'webview')`;
        } else if (deliveryType === "push") {
            subscriberQuery += ` AND (COALESCE(push_subscription, '') != '' OR COALESCE(platform, 'web') IN ('pwa', 'web', 'webview'))`;
        }

        if (targetType === "teacher") {
            subscriberQuery += ` AND role = 'teacher'`;
            if (targetTeacherName) {
                subscriberQuery += ` AND (teacher_name = ? OR REPLACE(teacher_name, '*', '') = REPLACE(?, '*', ''))`;
                bindings.push(targetTeacherName, targetTeacherName);
            }
        } else if (targetType === "student") {
            subscriberQuery += ` AND role = 'student'`;
            if (targetGrade > 0) {
                subscriberQuery += ` AND grade = ?`;
                bindings.push(Number(targetGrade));
            }
            if (targetClass > 0) {
                subscriberQuery += ` AND class_num = ?`;
                bindings.push(Number(targetClass));
            }
            if (targetStudentNumber > 0) {
                subscriberQuery += ` AND student_number = ?`;
                bindings.push(Number(targetStudentNumber));
            }
            if (targetStudentName) {
                subscriberQuery += ` AND student_name = ?`;
                bindings.push(targetStudentName);
            }
        }

        const { results: matched = [] } = await env.DB.prepare(subscriberQuery).bind(...bindings).all();

        return new Response(JSON.stringify({
            success: true,
            notificationId,
            deliveryType,
            matchedCount: matched.length,
            matchedSubscribers: matched
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err: any) {
        console.error("[api/admin/notifications/send] Error:", err);
        return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
