import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // Authentication Check
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    const results = [];

    try {
        // 1. users Table (Core Auth)
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    openId VARCHAR(64) NOT NULL UNIQUE,
                    name TEXT,
                    email VARCHAR(320),
                    loginMethod VARCHAR(64),
                    role TEXT NOT NULL DEFAULT 'user', -- mysqlEnum shim
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created users table");
        } catch (e: any) {
            results.push(`Error creating users: ${e.message}`);
        }

        // 2. performance_assessments Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS performance_assessments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject VARCHAR(100) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    dueDate VARCHAR(20) NOT NULL,
                    grade INTEGER NOT NULL,
                    classNum INTEGER NOT NULL,
                    classTime INTEGER,
                    isDone INTEGER DEFAULT 0,
                    lastModifiedIp VARCHAR(45),
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            // ensure lastModifiedIp exists (migration support)
            try {
                await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT").run();
            } catch (e) { }

            results.push("Checked/Created performance_assessments table");
        } catch (e: any) {
            results.push(`Error creating performance_assessments: ${e.message}`);
        }

        // 3. blocked_users Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS blocked_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    identifier VARCHAR(255) NOT NULL,
                    type TEXT NOT NULL,
                    reason TEXT,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created blocked_users table");
        } catch (e: any) {
            results.push(`Error creating blocked_users: ${e.message}`);
        }

        // 4. access_logs Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS access_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip VARCHAR(45) NOT NULL,
                    kakaoId VARCHAR(255),
                    kakaoNickname VARCHAR(255),
                    endpoint VARCHAR(255) NOT NULL,
                    method VARCHAR(10),
                    userAgent TEXT,
                    accessedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            // ensure method exists (migration support)
            try {
                await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN method TEXT").run();
            } catch (e) { }

            results.push("Checked/Created access_logs table");
        } catch (e: any) {
            results.push(`Error creating access_logs: ${e.message}`);
        }

        // 5. kakao_tokens Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS kakao_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kakaoId VARCHAR(255) NOT NULL UNIQUE,
                    accessToken TEXT NOT NULL,
                    refreshToken TEXT,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created kakao_tokens table");
        } catch (e: any) {
            results.push(`Error creating kakao_tokens: ${e.message}`);
        }

        // 6. system_settings Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created system_settings table");
        } catch (e: any) {
            results.push(`Error creating system_settings: ${e.message}`);
        }

        // 7. notification_logs Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS notification_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type VARCHAR(50) NOT NULL,
                    target_date VARCHAR(20),
                    status VARCHAR(20) NOT NULL,
                    message TEXT,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            `).run();
            results.push("Checked/Created notification_logs table");
        } catch (e: any) {
            results.push(`Error creating notification_logs: ${e.message}`);
        }

        // 8. Migration: Add grade/class to users if missing
        try {
            await env.DB.prepare("ALTER TABLE users ADD COLUMN grade INTEGER").run();
            results.push("Added grade to users");
        } catch (e) { }
        try {
            await env.DB.prepare("ALTER TABLE users ADD COLUMN class INTEGER").run();
            results.push("Added class to users");
        } catch (e) { }
        try {
            await env.DB.prepare("ALTER TABLE users ADD COLUMN studentNumber INTEGER").run();
            results.push("Added studentNumber to users");
        } catch (e) { }

        // 9. Migration: Add studentNumber to access_logs
        try {
            await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN studentNumber TEXT").run();
            results.push("Added studentNumber to access_logs");
        } catch (e) { }

        // 9. student_profiles Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS student_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    grade INTEGER NOT NULL,
                    classNum INTEGER NOT NULL,
                    studentNumber INTEGER,
                    electives TEXT,
                    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    UNIQUE(grade, classNum, studentNumber)
                )
            `).run();
            // Populate from access_logs
            try {
                await env.DB.prepare(`
                    INSERT OR IGNORE INTO student_profiles (grade, classNum, studentNumber)
                    SELECT DISTINCT grade, classNum, studentNumber
                    FROM access_logs
                    WHERE grade IS NOT NULL AND classNum IS NOT NULL
                `).run();
            } catch (e) { }

            results.push("Checked/Created student_profiles table");
        } catch (e: any) {
            results.push(`Error creating student_profiles: ${e.message}`);
        }

        // 10. ip_profiles Table
        try {
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS ip_profiles (
                    ip VARCHAR(45) PRIMARY KEY,
                    student_profile_id INTEGER,
                    kakaoId VARCHAR(255),
                    kakaoNickname VARCHAR(255),
                    lastAccess TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    modificationCount INTEGER DEFAULT 0,
                    userAgent TEXT,
                    FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
                )
            `).run();

            // Populate from access_logs (Basic info)
            try {
                await env.DB.prepare(`
                    INSERT OR IGNORE INTO ip_profiles (ip, lastAccess, userAgent, kakaoId, kakaoNickname)
                    SELECT ip, MAX(accessedAt), userAgent, kakaoId, kakaoNickname
                    FROM access_logs
                    GROUP BY ip
                `).run();
            } catch (e) { }

            // Link to student_profiles
            try {
                await env.DB.prepare(`
                    UPDATE ip_profiles
                    SET student_profile_id = (
                        SELECT sp.id
                        FROM student_profiles sp
                        JOIN (
                            SELECT ip, grade, classNum, studentNumber
                            FROM access_logs al
                            WHERE al.ip = ip_profiles.ip 
                            AND al.grade IS NOT NULL 
                            AND al.classNum IS NOT NULL
                            ORDER BY al.accessedAt DESC
                            LIMIT 1
                        ) recent_log ON sp.grade = recent_log.grade 
                                    AND sp.classNum = recent_log.classNum 
                                    AND (sp.studentNumber = recent_log.studentNumber OR (sp.studentNumber IS NULL AND recent_log.studentNumber IS NULL))
                    )
                 `).run();
            } catch (e) { }

            results.push("Checked/Created ip_profiles table");
        } catch (e: any) {
            results.push(`Error creating ip_profiles: ${e.message}`);
        }

        // 11. Migration: Add instructionDismissed to ip_profiles
        try {
            await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN instructionDismissed INTEGER DEFAULT 0").run();
            results.push("Added instructionDismissed to ip_profiles");
        } catch (e) { }

        // 12. cleanup users table (Optional: remove if explicitly requested, otherwise leave for safety)
        // User requested: "user 테이블이 쓰이지 않을 경우 제거한다."
        try {
            await env.DB.prepare("DROP TABLE IF EXISTS users").run();
            results.push("Dropped users table (Refactored to student/ip profiles)");
        } catch (e: any) {
            results.push(`Error dropping users table: ${e.message}`);
        }

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, results }), { status: 500 });
    }
}
