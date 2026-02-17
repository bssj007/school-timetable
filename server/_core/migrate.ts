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
                userAgent VARCHAR(500),
                grade INT,
                classNum INT,
                studentNumber INT,
                accessedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add columns if they don't exist (migrations for existing tables)
        try {
            await db.execute(sql`ALTER TABLE access_logs ADD COLUMN grade INT`);
        } catch (e) { }
        try {
            await db.execute(sql`ALTER TABLE access_logs ADD COLUMN classNum INT`);
        } catch (e) { }
        try {
            await db.execute(sql`ALTER TABLE access_logs ADD COLUMN studentNumber INT`);
        } catch (e) { }


        // 4. Student Profiles (Simplified 4-digit ID)
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS student_profiles (
                student_id INT PRIMARY KEY,
                electives TEXT,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 5. IP Profiles (DEPRECATED - Removed to prevent dynamic creation)
        /*
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ip_profiles (
                ip VARCHAR(45) PRIMARY KEY,
                ...
            )
        `);
        */

        // Drop legacy table
        // await db.execute(sql`DROP TABLE IF EXISTS users`); // Optional: keep for safety or drop

        console.log("[Migration] Schema setup completed.");

    } catch (error) {
        console.error("[Migration] Fatal error during migration:", error);
    }
}
