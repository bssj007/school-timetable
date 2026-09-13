// server/routes/notifications.ts
import { Router } from "express";
import { getRawSqliteDb } from "../db";
import { verifyAdminPassword } from "../adminPW";

export const notificationsRouter = Router();
export const adminNotificationsRouter = Router();

// Ensure notification tables in SQLite
function ensureLocalNotificationTables(sqlite: any) {
    if (!sqlite) return;
    try {
        sqlite.exec(`
            CREATE TABLE IF NOT EXISTS notification_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL DEFAULT 'student',
                client_id TEXT NOT NULL,
                ip TEXT DEFAULT '',
                user_agent TEXT DEFAULT '',
                platform TEXT DEFAULT 'web',
                grade INTEGER DEFAULT 0,
                class_num INTEGER DEFAULT 0,
                student_number INTEGER DEFAULT 0,
                student_name TEXT DEFAULT '',
                teacher_name TEXT DEFAULT '',
                push_subscription TEXT DEFAULT '',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(client_id, role)
            );

            CREATE TABLE IF NOT EXISTS site_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_type TEXT NOT NULL DEFAULT 'all',
                target_grade INTEGER DEFAULT 0,
                target_class INTEGER DEFAULT 0,
                target_student_number INTEGER DEFAULT 0,
                target_student_name TEXT DEFAULT '',
                target_teacher_name TEXT DEFAULT '',
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                link TEXT DEFAULT '',
                category TEXT DEFAULT 'assessment',
                delivery_type TEXT DEFAULT 'all',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS notification_reads (
                notification_id INTEGER NOT NULL,
                client_id TEXT NOT NULL,
                read_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (notification_id, client_id)
            );
        `);

        // Safe alterations
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN ip TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN user_agent TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN platform TEXT DEFAULT 'web'"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN grade INTEGER DEFAULT 0"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN class_num INTEGER DEFAULT 0"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN student_number INTEGER DEFAULT 0"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN student_name TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN teacher_name TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN push_subscription TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE notification_subscriptions ADD COLUMN is_active INTEGER DEFAULT 1"); } catch (_) {}

        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN target_type TEXT DEFAULT 'all'"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN target_grade INTEGER DEFAULT 0"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN target_class INTEGER DEFAULT 0"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN target_student_number INTEGER DEFAULT 0"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN target_student_name TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN target_teacher_name TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN link TEXT DEFAULT ''"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN category TEXT DEFAULT 'assessment'"); } catch (_) {}
        try { sqlite.exec("ALTER TABLE site_notifications ADD COLUMN delivery_type TEXT DEFAULT 'all'"); } catch (_) {}
    } catch (e) {
        console.warn("[ensureLocalNotificationTables] Warning:", e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Client Notification Router (/api/notifications)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/notifications/list
notificationsRouter.get("/list", (req, res) => {
    const sqlite = getRawSqliteDb();
    if (!sqlite) return res.status(500).json({ error: "Database not available" });
    ensureLocalNotificationTables(sqlite);

    try {
        const role = String(req.query.role || "student");
        const grade = parseInt(String(req.query.grade || "0"), 10);
        const classNum = parseInt(String(req.query.classNum || "0"), 10);
        const studentNumber = parseInt(String(req.query.studentNumber || "0"), 10);
        const studentName = String(req.query.studentName || "").trim();
        const teacherName = String(req.query.teacherName || "").trim();
        const deviceId = String(req.query.deviceId || "").trim();

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

        query += ` ORDER BY sn.created_at DESC LIMIT 50`;

        const results = sqlite.prepare(query).all(...bindings);

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

        res.json({
            notifications: formatted,
            unreadCount
        });
    } catch (err: any) {
        console.error("[/api/notifications/list] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/notifications/subscribe
notificationsRouter.post("/subscribe", (req, res) => {
    const sqlite = getRawSqliteDb();
    if (!sqlite) return res.status(500).json({ error: "Database not available" });
    ensureLocalNotificationTables(sqlite);

    try {
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
        } = req.body || {};

        if (!deviceId) {
            return res.status(400).json({ error: "deviceId is required" });
        }

        const ip = req.ip || "127.0.0.1";
        const userAgent = req.headers["user-agent"] || "";
        const pushSubStr = typeof pushSubscription === "object" ? JSON.stringify(pushSubscription) : String(pushSubscription || "");
        const isActive = enabled ? 1 : 0;

        sqlite.prepare(`
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
        `).run(
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
        );

        res.setHeader("Set-Cookie", `sj_notification_enabled=${isActive}; Path=/; Max-Age=31536000; SameSite=Lax`);
        res.json({
            success: true,
            deviceId,
            role,
            enabled: isActive === 1
        });
    } catch (err: any) {
        console.error("[/api/notifications/subscribe] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/notifications/read
notificationsRouter.post("/read", (req, res) => {
    const sqlite = getRawSqliteDb();
    if (!sqlite) return res.status(500).json({ error: "Database not available" });
    ensureLocalNotificationTables(sqlite);

    try {
        const { deviceId, notificationId, notificationIds = [], all = false } = req.body || {};
        if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

        const idsToMark: number[] = [];
        if (notificationId) idsToMark.push(Number(notificationId));
        if (Array.isArray(notificationIds)) {
            for (const id of notificationIds) {
                if (!idsToMark.includes(Number(id))) idsToMark.push(Number(id));
            }
        }

        if (all) {
            const rows = sqlite.prepare(`SELECT id FROM site_notifications ORDER BY created_at DESC LIMIT 50`).all();
            for (const r of rows) {
                if (!idsToMark.includes(r.id)) idsToMark.push(r.id);
            }
        }

        const insertStmt = sqlite.prepare(`
            INSERT OR IGNORE INTO notification_reads (notification_id, client_id, read_at)
            VALUES (?, ?, datetime('now'))
        `);

        for (const id of idsToMark) {
            insertStmt.run(id, deviceId);
        }

        res.json({ success: true, markedCount: idsToMark.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Admin Notification Router (/api/admin/notifications)
// ─────────────────────────────────────────────────────────────────────────────

// Admin authentication middleware
adminNotificationsRouter.use((req, res, next) => {
    const cookieMatch = req.headers.cookie?.match(/(?:^|;\s*)(?:admin_password|sj_admin_password)=([^;]*)/);
    const cookiePassword = cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;
    const authHeader = (req.headers["x-admin-password"] as string) || cookiePassword;
    if (!verifyAdminPassword(authHeader)) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
});

// GET /api/admin/notifications/subscribers
adminNotificationsRouter.get("/subscribers", (req, res) => {
    const sqlite = getRawSqliteDb();
    if (!sqlite) return res.status(500).json({ error: "Database not available" });
    ensureLocalNotificationTables(sqlite);

    try {
        const results = sqlite.prepare(`
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

        const studentMap = new Map<string, any>();
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

        res.json({
            subscribers: results,
            students: groupedStudents,
            teachers: groupedTeachers,
            groupedStudents,
            groupedTeachers,
            rawStudents: results.filter((s: any) => s.role === "student"),
            rawTeachers: results.filter((s: any) => s.role === "teacher"),
            totalCount: groupedStudents.length + groupedTeachers.length,
            totalUserCount: groupedStudents.length + groupedTeachers.length,
            totalDeviceCount: results.length
        });
    } catch (err: any) {
        console.error("[/api/admin/notifications/subscribers] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/notifications (history)
adminNotificationsRouter.get("/", (req, res) => {
    const sqlite = getRawSqliteDb();
    if (!sqlite) return res.status(500).json({ error: "Database not available" });
    ensureLocalNotificationTables(sqlite);

    try {
        const results = sqlite.prepare(`
            SELECT 
                sn.*,
                (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id = sn.id) as read_count
            FROM site_notifications sn
            ORDER BY sn.created_at DESC
            LIMIT 100
        `).all();

        res.json({ notifications: results });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/notifications/send
adminNotificationsRouter.post("/send", (req, res) => {
    const sqlite = getRawSqliteDb();
    if (!sqlite) return res.status(500).json({ error: "Database not available" });
    ensureLocalNotificationTables(sqlite);

    try {
        const {
            targetType = "all",
            targetGrade = 0,
            targetClass = 0,
            targetStudentNumber = 0,
            targetStudentName = "",
            targetTeacherName = "",
            title = "",
            message = "",
            link = "/",
            category = "assessment",
            deliveryType = "all"
        } = req.body || {};

        if (!title.trim() || !message.trim()) {
            return res.status(400).json({ error: "Title and message are required" });
        }

        const insertRes = sqlite.prepare(`
            INSERT INTO site_notifications (
                target_type, target_grade, target_class, target_student_number,
                target_student_name, target_teacher_name, title, message, link, category, delivery_type, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
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
        );

        const notificationId = insertRes.lastInsertRowid;

        // Count matching active subscribers
        let subscriberQuery = `
            SELECT id, role, grade, class_num, student_number, student_name, teacher_name, platform
            FROM notification_subscriptions
            WHERE is_active = 1
        `;
        const bindings: any[] = [];

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

        const matched = sqlite.prepare(subscriberQuery).all(...bindings);

        res.json({
            success: true,
            notificationId,
            deliveryType,
            matchedCount: matched.length,
            matchedSubscribers: matched
        });
    } catch (err: any) {
        console.error("[/api/admin/notifications/send] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/notifications
adminNotificationsRouter.delete("/", (req, res) => {
    const sqlite = getRawSqliteDb();
    if (!sqlite) return res.status(500).json({ error: "Database not available" });
    ensureLocalNotificationTables(sqlite);

    try {
        const id = req.query.id;
        if (!id) return res.status(400).json({ error: "ID required" });

        sqlite.prepare(`DELETE FROM notification_reads WHERE notification_id = ?`).run(Number(id));
        sqlite.prepare(`DELETE FROM site_notifications WHERE id = ?`).run(Number(id));

        res.json({ success: true, deletedId: id });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
