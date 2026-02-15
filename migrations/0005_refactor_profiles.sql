-- 1. Create student_profiles table
CREATE TABLE IF NOT EXISTS student_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER NOT NULL,
    classNum INTEGER NOT NULL,
    studentNumber INTEGER,
    electives TEXT, -- JSON string for electives
    updatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(grade, classNum, studentNumber)
);

-- 2. Create ip_profiles table
CREATE TABLE IF NOT EXISTS ip_profiles (
    ip TEXT PRIMARY KEY,
    student_profile_id INTEGER,
    kakaoId TEXT,
    kakaoNickname TEXT,
    lastAccess TEXT,
    modificationCount INTEGER DEFAULT 0,
    userAgent TEXT,
    FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
);

-- 3. Populate student_profiles from access_logs
INSERT OR IGNORE INTO student_profiles (grade, classNum, studentNumber)
SELECT DISTINCT grade, classNum, studentNumber
FROM access_logs
WHERE grade IS NOT NULL AND classNum IS NOT NULL;

-- 4. Populate ip_profiles from access_logs (Basic info only)
INSERT OR IGNORE INTO ip_profiles (ip, lastAccess, userAgent, kakaoId, kakaoNickname)
SELECT ip, MAX(accessedAt), userAgent, kakaoId, kakaoNickname
FROM access_logs
GROUP BY ip;

-- 5. Link ip_profiles to student_profiles based on most recent log with student info
-- This uses a subquery to find the latest valid student info for each IP
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
);

-- 6. Calculate Modification Count (POST/DELETE on /api/assessment)
UPDATE ip_profiles
SET modificationCount = (
    SELECT COUNT(*)
    FROM access_logs
    WHERE access_logs.ip = ip_profiles.ip
      AND (method = 'POST' OR method = 'DELETE')
      AND endpoint LIKE '/api/assessment%'
);

-- 7. Drop users table as requested
DROP TABLE IF EXISTS users;
