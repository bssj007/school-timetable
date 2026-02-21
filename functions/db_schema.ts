
export const ALL_TABLES = [
    "cookie_profiles",
    "ip_profiles",
    "student_profiles",
    "elective_config"
];

export const createStudentProfilesTable = `
CREATE TABLE IF NOT EXISTS student_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER NOT NULL,
    classNum INTEGER NOT NULL,
    studentNumber INTEGER,
    electives TEXT, -- JSON string for electives
    updatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(grade, classNum, studentNumber)
);
`;

export const createIpProfilesTable = `
CREATE TABLE IF NOT EXISTS ip_profiles (
    ip TEXT PRIMARY KEY,
    student_profile_id INTEGER,
    kakaoId TEXT,
    kakaoNickname TEXT,
    lastAccess TEXT,
    modificationCount INTEGER DEFAULT 0,
    userAgent TEXT,
    instructionDismissed INTEGER DEFAULT 0,
    FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
);
`;

export const createCookieProfilesTable = `
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
`;

export const createElectiveConfigTable = `
CREATE TABLE IF NOT EXISTS elective_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER NOT NULL,
    subject TEXT NOT NULL,
    originalTeacher TEXT NOT NULL,
    classCode TEXT,
    fullTeacherName TEXT,
    className TEXT,
    isMovingClass INTEGER DEFAULT 0,
    isCombinedClass INTEGER DEFAULT 0,
    updatedAt TEXT DEFAULT (datetime('now'))
);
`;

export async function ensureAllTables(db: any) {
    try {
        await db.prepare(createStudentProfilesTable).run();
        await db.prepare(createIpProfilesTable).run();
        await db.prepare(createCookieProfilesTable).run();
        await db.prepare(createElectiveConfigTable).run();
        console.log("All tables ensured.");
    } catch (e) {
        console.error("Error ensuring tables:", e);
        throw e;
    }
}

export async function dropAllTables(db: any) {
    for (const table of ALL_TABLES) {
        await db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
}

