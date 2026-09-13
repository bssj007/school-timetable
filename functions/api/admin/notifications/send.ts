// functions/api/admin/notifications/send.ts
import { verifyAdminPassword } from "../../../../server/adminPW";
import { ensureNotificationTables } from "../../../db_schema_notifications";
import { sendWebPushNotification } from "../../../lib/webPush";

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

        // 0. Check Notification System Master Switch
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        const masterRow = await env.DB.prepare(
            "SELECT value FROM system_settings WHERE key = 'notification_system_enabled'"
        ).first();

        const isMasterEnabled = masterRow ? (masterRow.value !== "0" && masterRow.value !== "false") : true;

        if (!isMasterEnabled) {
            return new Response(JSON.stringify({ 
                error: "알림 기능 마스터 스위치가 OFF 상태입니다. 알림을 발송할 수 없습니다." 
            }), {
                status: 403,
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
            SELECT id, role, grade, class_num, student_number, student_name, teacher_name, platform, push_subscription
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

        // 3. Dispatch Web Push if deliveryType is not 'in_app'
        let pushedCount = 0;
        let pushFailedCount = 0;

        if (deliveryType !== "in_app" && matched.length > 0) {
            const pushPayload = JSON.stringify({
                id: notificationId,
                title: title.trim(),
                body: message.trim(),
                message: message.trim(),
                url: link.trim() || "/",
                link: link.trim() || "/",
                category: category || "assessment",
                timestamp: Date.now()
            });

            const pushPromises = matched
                .filter((sub: any) => Boolean(sub.push_subscription && String(sub.push_subscription).trim()))
                .map(async (sub: any) => {
                    try {
                        let subObj: any = sub.push_subscription;
                        if (typeof subObj === "string") {
                            try {
                                subObj = JSON.parse(subObj);
                            } catch (_) {
                                return { id: sub.id, success: false, statusCode: 0, statusText: "Invalid JSON format" };
                            }
                        }

                        if (!subObj || !subObj.endpoint) {
                            return { id: sub.id, success: false, statusCode: 0, statusText: "Missing endpoint" };
                        }

                        const pushRes = await sendWebPushNotification(subObj, pushPayload, {
                            publicKey: env.VAPID_PUBLIC_KEY,
                            privateKey: env.VAPID_PRIVATE_KEY,
                            subject: env.VAPID_SUBJECT
                        });

                        // 오직 푸시 게이트웨이가 404/410을 반환했을 때만 구독 비활성화 (일시 네트워크 오류 시에는 유지)
                        if (pushRes.shouldDeactivate && (pushRes.status === 404 || pushRes.status === 410)) {
                            try {
                                await env.DB.prepare("UPDATE notification_subscriptions SET is_active = 0 WHERE id = ?").bind(sub.id).run();
                            } catch (_) {}
                        }
                        return { id: sub.id, ...pushRes };
                    } catch (err: any) {
                        return { id: sub.id, success: false, statusCode: 0, statusText: err.message || "Failed" };
                    }
                });

            if (pushPromises.length > 0) {
                const pushResults = await Promise.allSettled(pushPromises);
                pushedCount = pushResults.filter(r => r.status === "fulfilled" && (r as any).value.success).length;
                pushFailedCount = pushResults.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !(r as any).value.success)).length;
            }
        }

        return new Response(JSON.stringify({
            success: true,
            notificationId,
            deliveryType,
            matchedCount: matched.length,
            pushedCount,
            pushFailedCount,
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
