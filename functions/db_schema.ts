
export const ALL_TABLES = [
    "cookie_profiles",
    "ip_profiles",
    "student_profiles",
    "elective_config",
    "elective_presets",
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

// 학번별 선택과목 사전지정 — 이름과 무관, 새 사용자 첫 접속 시 1회 적용
export const createElectivePresetsTable = `
CREATE TABLE IF NOT EXISTS elective_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade INTEGER NOT NULL,
    classNum INTEGER NOT NULL,
    studentNumber INTEGER NOT NULL,
    electives TEXT,
    dataset TEXT DEFAULT '',
    updatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(grade, classNum, studentNumber)
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
        // ── system_settings 테이블 먼저 (마이그레이션 버전 추적용) ──────────────
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        // ── student_profiles 스키마 마이그레이션 (데이터 보존, 1회만 실행) ────────
        // system_settings.db_migration_v2 = 'done' 이면 절대 재실행하지 않음
        // sqlite_master 파싱에 의존하지 않아 오판 위험 없음
        try {
            const migRow = await db.prepare(
                "SELECT value FROM system_settings WHERE key='db_migration_v2'"
            ).first();

            if (migRow?.value !== 'done') {
                // student_profiles가 존재하는지 확인
                const tableExists = await db.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='student_profiles'"
                ).first();

                if (tableExists) {
                    // name 컬럼이 있는지 확인 (PRAGMA 방식 — sqlite_master SQL 파싱 불필요)
                    const columns = await db.prepare(
                        "PRAGMA table_info(student_profiles)"
                    ).all();
                    const colNames: string[] = (columns?.results || []).map((c: any) => c.name);
                    const hasNameCol = colNames.includes('name');

                    if (!hasNameCol) {
                        // 구 스키마 → 데이터 보존 마이그레이션
                        console.log('[Migration v2] No name column. Migrating student_profiles with data preservation...');
                        await db.prepare(`
                            CREATE TABLE IF NOT EXISTS student_profiles_new (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                name TEXT NOT NULL DEFAULT '',
                                grade INTEGER NOT NULL,
                                classNum INTEGER NOT NULL,
                                studentNumber INTEGER,
                                electives TEXT,
                                dataset TEXT DEFAULT '',
                                instructionDismissed INTEGER DEFAULT 0,
                                updatedAt TEXT DEFAULT (datetime('now')),
                                UNIQUE(name, grade, classNum, studentNumber)
                            )
                        `).run();
                        await db.prepare(`
                            INSERT OR IGNORE INTO student_profiles_new
                                (id, name, grade, classNum, studentNumber, electives, dataset, instructionDismissed, updatedAt)
                            SELECT id, '', grade, classNum, studentNumber, electives,
                                COALESCE(dataset, ''), COALESCE(instructionDismissed, 0), COALESCE(updatedAt, datetime('now'))
                            FROM student_profiles
                        `).run().catch((e: any) => console.log('[Migration v2] Copy skipped:', e.message));
                        await db.prepare("DROP TABLE IF EXISTS student_profiles").run();
                        await db.prepare("ALTER TABLE student_profiles_new RENAME TO student_profiles").run();
                        console.log('[Migration v2] Migration complete. Data preserved.');
                    } else {
                        console.log('[Migration v2] name column already exists. No migration needed.');
                    }
                }
                // 완료 기록 — 이후 이 블록은 절대 재실행 안 됨
                await db.prepare(
                    "INSERT OR REPLACE INTO system_settings (key, value) VALUES ('db_migration_v2', 'done')"
                ).run();
                console.log('[Migration v2] Marked as done in system_settings.');
            }
        } catch (e: any) {
            console.log('[Migration v2] Skipped (non-fatal):', e.message);
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
        await db.prepare(createElectivePresetsTable).run();
        await db.prepare(createDatasetBridgesTable).run();
        await db.prepare(createBugReportsTable).run();
        await db.prepare(createTimetableCacheTable).run();
        await db.prepare(createMealCacheTable).run();
        await db.prepare(createMealSuggestionsTable).run();
        await db.prepare(createMealRatingsTable).run();

        // ── 컬럼 마이그레이션 ──────────────────────────────────────────────────
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

