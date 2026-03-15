export const onRequestPost: PagesFunction<any> = async (context) => {
    try {
        const env = context.env;
        
        const batchStmts = [
            // 1. Rename existing tables to _old
            env.DB.prepare("ALTER TABLE ip_profiles RENAME TO ip_profiles_old"),
            env.DB.prepare("ALTER TABLE cookie_profiles RENAME TO cookie_profiles_old"),
            env.DB.prepare("ALTER TABLE student_profiles RENAME TO student_profiles_old"),

            // 2. Create new tables with the updated schema (Dataset in UNIQUE for student_profiles)
            env.DB.prepare(`
                CREATE TABLE student_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    grade INTEGER NOT NULL,
                    classNum INTEGER NOT NULL,
                    studentNumber INTEGER,
                    electives TEXT,
                    dataset TEXT DEFAULT '',
                    instructionDismissed INTEGER DEFAULT 0,
                    updatedAt TEXT DEFAULT (datetime('now')),
                    UNIQUE(grade, classNum, studentNumber, dataset)
                )
            `),
            env.DB.prepare(`
                CREATE TABLE ip_profiles (
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
                )
            `),
            env.DB.prepare(`
                CREATE TABLE cookie_profiles (
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
                )
            `),

            // 3. Clean any orphaned foreign keys in _old tables before migration
            env.DB.prepare(`UPDATE ip_profiles_old SET student_profile_id = NULL WHERE student_profile_id IS NOT NULL AND student_profile_id NOT IN (SELECT id FROM student_profiles_old)`),
            env.DB.prepare(`UPDATE cookie_profiles_old SET student_profile_id = NULL WHERE student_profile_id IS NOT NULL AND student_profile_id NOT IN (SELECT id FROM student_profiles_old)`),

            // 4. Migrate data from _old to new tables
            env.DB.prepare(`
                INSERT OR IGNORE INTO student_profiles (id, grade, classNum, studentNumber, electives, dataset, instructionDismissed, updatedAt)
                SELECT id, grade, classNum, studentNumber, electives, COALESCE(dataset, ''), COALESCE(instructionDismissed, 0), COALESCE(updatedAt, datetime('now'))
                FROM student_profiles_old
            `),
            env.DB.prepare("INSERT OR IGNORE INTO ip_profiles SELECT * FROM ip_profiles_old"),
            env.DB.prepare("INSERT OR IGNORE INTO cookie_profiles SELECT * FROM cookie_profiles_old"),

            // 5. Safely drop _old tables (drop children first to avoid FK errors)
            env.DB.prepare("DROP TABLE cookie_profiles_old"),
            env.DB.prepare("DROP TABLE ip_profiles_old"),
            env.DB.prepare("DROP TABLE student_profiles_old")
        ];

        await env.DB.batch(batchStmts);

        return new Response(JSON.stringify({ success: true, message: "Forced schema upgrade completed. Added ON DELETE SET NULL." }));

    } catch (e: any) {
        return new Response(JSON.stringify({ error: true, message: e.message }), { status: 500 });
    }
}
