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

        // 1. Group students by User Management composite identity (name + grade + class + studentNumber)
        const studentMap = new Map<string, any>();
        // 2. Group teachers by teacherName
        const teacherMap = new Map<string, any>();

        for (const row of results) {
            const platform = (row.platform || 'web').toLowerCase();
            const updatedAt = row.updatedAt || row.createdAt || '';

            if (row.role === 'teacher') {
                const key = row.teacherName ? `teacher|${row.teacherName.trim()}` : `client|${row.client_id}`;
                const existing = teacherMap.get(key);
                if (existing) {
                    if (!existing.platforms.includes(platform)) existing.platforms.push(platform);
                    existing.deviceCount += 1;
                    existing.subscriptionIds.push(row.id);
                    if (updatedAt > existing.updatedAt) {
                        existing.updatedAt = updatedAt;
                        existing.id = row.id;
                    }
                } else {
                    teacherMap.set(key, {
                        id: row.id,
                        role: 'teacher',
                        teacherName: (row.teacherName || '').trim(),
                        platforms: [platform],
                        deviceCount: 1,
                        subscriptionIds: [row.id],
                        createdAt: row.createdAt,
                        updatedAt: updatedAt
                    });
                }
            } else {
                // Student
                const nameStr = (row.studentName || '').trim();
                const key = (row.grade && row.classNum)
                    ? `${nameStr}|${row.grade}-${row.classNum}-${row.studentNumber || 0}`
                    : (nameStr ? `name|${nameStr}` : `client|${row.client_id}`);
                const existing = studentMap.get(key);
                if (existing) {
                    if (!existing.platforms.includes(platform)) existing.platforms.push(platform);
                    existing.deviceCount += 1;
                    existing.subscriptionIds.push(row.id);
                    if (updatedAt > existing.updatedAt) {
                        existing.updatedAt = updatedAt;
                        existing.id = row.id;
                    }
                } else {
                    studentMap.set(key, {
                        id: row.id,
                        role: 'student',
                        studentName: nameStr,
                        grade: row.grade || 0,
                        classNum: row.classNum || 0,
                        studentNumber: row.studentNumber || 0,
                        platforms: [platform],
                        deviceCount: 1,
                        subscriptionIds: [row.id],
                        createdAt: row.createdAt,
                        updatedAt: updatedAt
                    });
                }
            }
        }

        const groupedStudents = Array.from(studentMap.values()).sort((a, b) => {
            return (a.studentName || '').localeCompare(b.studentName || '', 'ko')
                || (a.grade || 0) - (b.grade || 0)
                || (a.classNum || 0) - (b.classNum || 0)
                || (a.studentNumber || 0) - (b.studentNumber || 0);
        });

        const groupedTeachers = Array.from(teacherMap.values()).sort((a, b) => {
            return (a.teacherName || '').localeCompare(b.teacherName || '', 'ko');
        });

        return new Response(JSON.stringify({
            subscribers: results,
            students: groupedStudents,       // Deduplicated unique students
            teachers: groupedTeachers,       // Deduplicated unique teachers
            groupedStudents,
            groupedTeachers,
            rawStudents: results.filter((s: any) => s.role === "student"),
            rawTeachers: results.filter((s: any) => s.role === "teacher"),
            totalCount: groupedStudents.length + groupedTeachers.length, // Unique users
            totalUserCount: groupedStudents.length + groupedTeachers.length,
            totalDeviceCount: results.length
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
