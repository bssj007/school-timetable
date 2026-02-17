-- 1. Create cookie_profiles table
CREATE TABLE IF NOT EXISTS cookie_profiles (
    client_id TEXT PRIMARY KEY,
    student_profile_id INTEGER,
    kakaoId TEXT,
    kakaoNickname TEXT,
    lastAccess TEXT,
    modificationCount INTEGER DEFAULT 0,
    userAgent TEXT,
    instructionDismissed INTEGER DEFAULT 0,
    ip TEXT,
    grade INTEGER,
    classNum INTEGER,
    studentNumber INTEGER,
    FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
);

-- 2. Add client_id to access_logs
ALTER TABLE access_logs ADD COLUMN client_id TEXT;
