
export const ALL_TABLES = [
    "cookie_profiles",
    "ip_profiles",
    "student_profiles",
    "elective_config",
    "dataset_bridges",
    "bug_reports"
];

export const createStudentProfilesTable = `
CREATE TABLE IF NOT EXISTS student_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER NOT NULL,
    classNum INTEGER NOT NULL,
    studentNumber INTEGER,
    electives TEXT, -- JSON string for electives
    dataset TEXT DEFAULT '',
    instructionDismissed INTEGER DEFAULT 0,
    updatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(grade, classNum, studentNumber, dataset)
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
    addCount INTEGER DEFAULT 0,
    deleteCount INTEGER DEFAULT 0,
    userAgent TEXT,
    instructionDismissed INTEGER DEFAULT 0,
    printCount INTEGER DEFAULT 0,
    downloadCount INTEGER DEFAULT 0,
    isStandalone INTEGER DEFAULT 0,
    FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id) ON DELETE SET NULL
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
    addCount INTEGER DEFAULT 0,
    deleteCount INTEGER DEFAULT 0,
    userAgent TEXT,
    instructionDismissed INTEGER DEFAULT 0,
    ip TEXT,
    grade INTEGER,
    classNum INTEGER,
    studentNumber INTEGER,
    printCount INTEGER DEFAULT 0,
    downloadCount INTEGER DEFAULT 0,
    FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id) ON DELETE SET NULL
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
    fullSubjectName TEXT,
    isMovingClass INTEGER DEFAULT 0,
    isCombinedClass INTEGER DEFAULT 0,
    dataset TEXT DEFAULT '',
    updatedAt TEXT DEFAULT (datetime('now'))
);
`;

export const createDatasetBridgesTable = `
CREATE TABLE IF NOT EXISTS dataset_bridges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    fromDataset TEXT NOT NULL,
    toDataset TEXT NOT NULL,
    targetGrade INTEGER,
    mappingData TEXT NOT NULL, -- JSON string representing mapping rules
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);
`;

export const createBugReportsTable = `
CREATE TABLE IF NOT EXISTS bug_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER,
    classNum INTEGER,
    studentNumber INTEGER,
    message TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now'))
);
`;

export async function ensureAllTables(db: any) {
    try {
        await db.prepare(createStudentProfilesTable).run();
        await db.prepare(createIpProfilesTable).run();
        await db.prepare(createCookieProfilesTable).run();
        await db.prepare(createElectiveConfigTable).run();
        await db.prepare(createDatasetBridgesTable).run();
        await db.prepare(createBugReportsTable).run();
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

