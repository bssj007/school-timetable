import { sql } from "drizzle-orm";
import { getDb } from "../db";

export async function runMigrations() {
    console.log("[Migration] Checking database schema...");
    const db = await getDb();

    if (!db) {
        console.warn("[Migration] Database not available, skipping.");
        return;
    }

    try {
        // 1. assessments table (if not exists)
        await (db as any).run(sql`
            CREATE TABLE IF NOT EXISTS performance_assessments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grade INTEGER NOT NULL,
                classNum INTEGER NOT NULL,
                subject TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                dueDate TEXT NOT NULL,
                isDeleted INTEGER DEFAULT 0,
                lastModifiedIp TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. meals table
        await (db as any).run(sql`
            CREATE TABLE IF NOT EXISTS meals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                content TEXT NOT NULL,
                calories TEXT,
                origins TEXT,
                type TEXT NOT NULL,
                sysId TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date, type)
            )
        `);

        // 3. blocked_users
        await (db as any).run(sql`
            CREATE TABLE IF NOT EXISTS blocked_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identifier TEXT NOT NULL,
                type TEXT NOT NULL,
                reason TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. access_logs
        await (db as any).run(sql`
            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT,
                kakaoId TEXT,
                kakaoNickname TEXT,
                endpoint TEXT,
                method TEXT,
                userAgent TEXT,
                grade INTEGER,
                classNum INTEGER,
                studentNumber INTEGER,
                accessedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 5. student_profiles
        await (db as any).run(sql`
            CREATE TABLE IF NOT EXISTS student_profiles (
                student_id INTEGER PRIMARY KEY,
                electives TEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 6. ip_profiles
        await (db as any).run(sql`
            CREATE TABLE IF NOT EXISTS ip_profiles (
                ip TEXT PRIMARY KEY,
                student_id INTEGER,
                kakaoId TEXT,
                kakaoNickname TEXT,
                lastAccess DATETIME DEFAULT CURRENT_TIMESTAMP,
                modificationCount INTEGER DEFAULT 0,
                userAgent TEXT
            )
        `);

        console.log("[Migration] Schema setup completed.");

    } catch (error) {
        console.error("[Migration] Fatal error during migration:", error);
    }
}
