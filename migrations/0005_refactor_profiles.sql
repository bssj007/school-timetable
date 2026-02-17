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

-- 3. Populate student_profiles (REMOVED for Dynamic Creation)
-- INSERT OR IGNORE INTO student_profiles ...

-- 4. Populate ip_profiles (REMOVED for Dynamic Creation)
-- INSERT OR IGNORE INTO ip_profiles ...

-- 5. Link ip_profiles (REMOVED)
-- UPDATE ip_profiles ...

-- 6. Calculate Modification Count (REMOVED)
-- UPDATE ip_profiles ...

-- 7. Drop users table as requested
DROP TABLE IF EXISTS users;
