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
        // 1. Add lastModifiedIp to performanceAssessments
        try {
            // Check if column exists first to avoid error spam? 
            // Or just try add and catch error.
            await db.execute(sql`ALTER TABLE performanceAssessments ADD COLUMN lastModifiedIp VARCHAR(45)`);
            console.log("[Migration] Added lastModifiedIp column.");
        } catch (e: any) {
            // ER_DUP_FIELDNAME code is 1060 in MySQL
            if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060 || e.message?.includes("Duplicate column name")) {
                // console.log("[Migration] lastModifiedIp column already exists.");
            } else {
                console.error("[Migration] Failed to add lastModifiedIp:", e);
            }
        }

        // 2. Add blocked_users table
        await db.execute(sql`
      CREATE TABLE IF NOT EXISTS blocked_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        identifier VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        reason TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 3. Add access_logs table
        await db.execute(sql`
      CREATE TABLE IF NOT EXISTS access_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip VARCHAR(45),
        kakaoId VARCHAR(255),
        kakaoNickname VARCHAR(255),
        endpoint VARCHAR(255),
        method VARCHAR(10),
        accessedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        console.log("[Migration] Schema check completed.");

    } catch (error) {
        console.error("[Migration] Fatal error during migration:", error);
    }
}
