import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function migrate() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is missing!");
        return;
    }

    console.log("Connecting to:", process.env.DATABASE_URL);
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log('Connected to database.');

    try {
        // 1. Add lastModifiedIp to performance_assessments
        try {
            await connection.query('ALTER TABLE performanceAssessments ADD COLUMN lastModifiedIp VARCHAR(45);');
            console.log('Added lastModifiedIp column.');
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('lastModifiedIp column already exists.');
            } else {
                console.error("Failed to add column:", e.message);
            }
        }

        // 2. Add blocked_users table
        await connection.query(`
      CREATE TABLE IF NOT EXISTS blocked_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        identifier VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        reason TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('Ensured blocked_users table exists.');

        // 3. Add access_logs table
        await connection.query(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip VARCHAR(45),
        kakaoId VARCHAR(255),
        kakaoNickname VARCHAR(255),
        endpoint VARCHAR(255),
        method VARCHAR(10),
        accessedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('Ensured access_logs table exists.');

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
