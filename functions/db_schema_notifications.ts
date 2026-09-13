// functions/db_schema_notifications.ts
// Notification system database tables and migration helpers for Cloudflare D1

export const createNotificationSubscriptionsTable = `
CREATE TABLE IF NOT EXISTS notification_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL DEFAULT 'student', -- 'student' | 'teacher'
    client_id TEXT NOT NULL,              -- Device ID / LocalStorage UUID
    ip TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    platform TEXT DEFAULT 'web',          -- 'web' | 'pwa' | 'webview'
    grade INTEGER DEFAULT 0,
    class_num INTEGER DEFAULT 0,
    student_number INTEGER DEFAULT 0,
    student_name TEXT DEFAULT '',
    teacher_name TEXT DEFAULT '',
    push_subscription TEXT DEFAULT '',   -- JSON stringified PushSubscription if WebPush active
    is_active INTEGER DEFAULT 1,          -- 1 = ON, 0 = OFF
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(client_id, role)
);
`;

export const createSiteNotificationsTable = `
CREATE TABLE IF NOT EXISTS site_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL DEFAULT 'all', -- 'all' | 'student' | 'teacher'
    target_grade INTEGER DEFAULT 0,         -- 0 = all grades
    target_class INTEGER DEFAULT 0,         -- 0 = all classes
    target_student_number INTEGER DEFAULT 0, -- 0 = all numbers
    target_student_name TEXT DEFAULT '',
    target_teacher_name TEXT DEFAULT '',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT DEFAULT '',
    category TEXT DEFAULT 'assessment',     -- 'assessment' | 'notice' | 'test'
    delivery_type TEXT DEFAULT 'all',       -- 'all' | 'push' | 'in_app' | 'app'
    created_at TEXT DEFAULT (datetime('now'))
);
`;

export const createNotificationReadsTable = `
CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    read_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (notification_id, client_id)
);
`;

let notificationsSchemaVerified = false;

export async function ensureNotificationTables(db: any): Promise<void> {
    if (notificationsSchemaVerified) return;
    try {
        await db.prepare(createNotificationSubscriptionsTable).run();
        await db.prepare(createSiteNotificationsTable).run();
        await db.prepare(createNotificationReadsTable).run();

        // Safe column alter checks
        try { await db.prepare("ALTER TABLE ip_profiles ADD COLUMN notificationEnabled INTEGER DEFAULT 0").run(); } catch (_) {}
        try { await db.prepare("ALTER TABLE notification_subscriptions ADD COLUMN ip TEXT DEFAULT ''").run(); } catch (_) {}
        try { await db.prepare("ALTER TABLE site_notifications ADD COLUMN delivery_type TEXT DEFAULT 'all'").run(); } catch (_) {}

        notificationsSchemaVerified = true;
    } catch (err) {
        console.warn("[ensureNotificationTables] Schema init warning:", err);
    }
}
