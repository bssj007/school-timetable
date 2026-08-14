
export const ALL_TABLES = [
    "cookie_profiles",
    "ip_profiles",
    "student_profiles",
    "elective_config",
    "dataset_bridges",
    "bug_reports",
    "timetable_cache",
    "meal_cache",
    "meal_suggestions",
    "meal_ratings"
];

export const createStudentProfilesTable = `
CREATE TABLE IF NOT EXISTS student_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    grade INTEGER NOT NULL,
    classNum INTEGER NOT NULL,
    studentNumber INTEGER,
    electives TEXT, -- JSON string for electives
    dataset TEXT DEFAULT '',
    instructionDismissed INTEGER DEFAULT 0,
    updatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(name, grade, classNum, studentNumber)
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

export const createTimetableCacheTable = `
CREATE TABLE IF NOT EXISTS timetable_cache (
    cache_key TEXT PRIMARY KEY,
    response_json TEXT NOT NULL,
    dataset_id TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    is_frozen INTEGER DEFAULT 0
);
`;

export const createMealCacheTable = `
CREATE TABLE IF NOT EXISTS meal_cache (
    date TEXT PRIMARY KEY,
    menu_json TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);
`;

export const createMealSuggestionsTable = `
CREATE TABLE IF NOT EXISTS meal_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER,
    classNum INTEGER,
    studentNumber INTEGER,
    ip TEXT,
    message TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now'))
);
`;

export const createMealRatingsTable = `
CREATE TABLE IF NOT EXISTS meal_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    studentName TEXT NOT NULL DEFAULT '',
    grade INTEGER,
    classNum INTEGER,
    studentNumber INTEGER,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    createdAt TEXT,
    UNIQUE(date, type, studentName, grade, classNum, studentNumber)
);
`;

export async function ensureAllTables(db: any) {
    try {
        // ── student_profiles: UNIQUE 제약 자동 마이그레이션 ──────────────────
        // 구 제약 UNIQUE(grade, classNum, studentNumber)가 남아있으면 DROP+재생성
        try {
            const schemaRow = await db.prepare(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='student_profiles'"
            ).first();
            if (schemaRow) {
                const sql: string = schemaRow.sql || '';
                const hasOldUniqueConstraint =
                    sql.includes('UNIQUE(grade, classNum, studentNumber)') ||
                    sql.includes('UNIQUE(grade,classNum,studentNumber)') ||
                    (!sql.includes('name') && sql.includes('UNIQUE'));
                if (hasOldUniqueConstraint) {
                    console.log('[Migration] Detected old UNIQUE constraint on student_profiles. Rebuilding table...');
                    await db.prepare("UPDATE ip_profiles SET student_profile_id = NULL").run().catch(() => {});
                    await db.prepare("DROP TABLE IF EXISTS student_profiles").run();
                    console.log('[Migration] student_profiles dropped. Will be recreated with new schema.');
                }
            }
        } catch (e: any) {
            // ip_profiles 등이 아직 없으면 실패해도 엄수롭지
            console.log('[Migration] Pre-check skipped:', e.message);
        }

        // ── meal_ratings: UNIQUE 제약 자동 마이그레이션 ─────────────────────
        try {
            const mealSchemaRow = await db.prepare(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='meal_ratings'"
            ).first();
            if (mealSchemaRow) {
                const mealSql: string = mealSchemaRow.sql || '';
                const hasOldMealConstraint =
                    mealSql.includes('UNIQUE(date, type, grade, classNum, studentNumber)') ||
                    !mealSql.includes('studentName');
                if (hasOldMealConstraint) {
                    console.log('[Migration] Detected old meal_ratings schema. Rebuilding...');
                    await db.prepare("DROP TABLE IF EXISTS meal_ratings").run();
                }
            }
        } catch (_) {}

        // ── 테이블 생성 (없으면 생성, 있으면 무시) ──────────────────────────────
        await db.prepare(createStudentProfilesTable).run();
        await db.prepare(createIpProfilesTable).run();
        await db.prepare(createCookieProfilesTable).run();
        await db.prepare(createElectiveConfigTable).run();
        await db.prepare(createDatasetBridgesTable).run();
        await db.prepare(createBugReportsTable).run();
        await db.prepare(createTimetableCacheTable).run();
        await db.prepare(createMealCacheTable).run();
        await db.prepare(createMealSuggestionsTable).run();
        await db.prepare(createMealRatingsTable).run();

        // ── 쿨럼 마이그레이션 (쿨럼만 추가, 제약 변경은 위의 DROP+재생성으로 처리) ──────
        try {
            await db.prepare("ALTER TABLE bug_reports ADD COLUMN studentName TEXT").run();
        } catch (_) {}

        console.log('[DB] All tables ensured.');
    } catch (e) {
        console.error('Error ensuring tables:', e);
        throw e;
    }
}

export async function dropAllTables(db: any) {
    for (const table of ALL_TABLES) {
        await db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
}

