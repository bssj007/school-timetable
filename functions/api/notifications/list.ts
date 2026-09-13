// functions/api/notifications/list.ts
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
        const url = new URL(request.url);
        const role = url.searchParams.get("role") || "student";
        const grade = parseInt(url.searchParams.get("grade") || "0", 10);
        const classNum = parseInt(url.searchParams.get("classNum") || "0", 10);
        const studentNumber = parseInt(url.searchParams.get("studentNumber") || "0", 10);
        const studentName = (url.searchParams.get("studentName") || "").trim();
        const teacherName = (url.searchParams.get("teacherName") || "").trim();
        const deviceId = (url.searchParams.get("deviceId") || "").trim();

        let query = `
            SELECT 
                sn.id,
                sn.target_type,
                sn.target_grade,
                sn.target_class,
                sn.target_student_number,
                sn.target_student_name,
                sn.target_teacher_name,
                sn.title,
                sn.message,
                sn.link,
                sn.category,
                COALESCE(sn.delivery_type, 'all') as delivery_type,
                sn.created_at,
                CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
            FROM site_notifications sn
            LEFT JOIN notification_reads nr 
                ON sn.id = nr.notification_id AND nr.client_id = ?
            WHERE 
        `;

        const bindings: any[] = [deviceId];

        if (role === "teacher") {
            query += `
                (sn.target_type = 'all' 
                 OR (sn.target_type = 'teacher' AND (
                     sn.target_teacher_name = '' 
                     OR sn.target_teacher_name = ? 
                     OR REPLACE(sn.target_teacher_name, '*', '') = REPLACE(?, '*', '')
                 )))
            `;
            bindings.push(teacherName, teacherName);
        } else {
            // Student
            query += `
                (
                    sn.target_type = 'all'
                    OR (
                        sn.target_type = 'student'
                        AND (sn.target_grade = 0 OR sn.target_grade = ?)
                        AND (sn.target_class = 0 OR sn.target_class = ?)
                        AND (sn.target_student_number = 0 OR sn.target_student_number = ?)
                        AND (sn.target_student_name = '' OR sn.target_student_name = ?)
                    )
                )
            `;
            bindings.push(grade, classNum, studentNumber, studentName);
        }

        // 마스터 스위치 상태 점검
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        const masterRow = await env.DB.prepare(
            "SELECT value FROM system_settings WHERE key = 'notification_system_enabled'"
        ).first();

        const systemEnabled = masterRow ? (masterRow.value !== "0" && masterRow.value !== "false") : true;

        query += ` ORDER BY sn.created_at DESC LIMIT 50`;

        const { results = [] } = await env.DB.prepare(query).bind(...bindings).all();

        const formatted = results.map((r: any) => ({
            id: r.id,
            title: r.title,
            message: r.message,
            link: r.link || "/",
            category: r.category || "assessment",
            deliveryType: r.delivery_type || "all",
            createdAt: r.created_at,
            read: r.is_read === 1
        }));

        const unreadCount = formatted.filter((n: any) => !n.read).length;

        return new Response(JSON.stringify({
            notifications: systemEnabled ? formatted : [],
            unreadCount: systemEnabled ? unreadCount : 0,
            systemEnabled
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        });

    } catch (err: any) {
        console.error("[api/notifications/list] Error:", err);
        return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
