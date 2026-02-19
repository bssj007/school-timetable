export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { env } = context;

    try {
        // 1. Drop existing tables
        await env.DB.prepare("DROP TABLE IF EXISTS cookie_profiles").run();
        await env.DB.prepare("DROP TABLE IF EXISTS ip_profiles").run();
        await env.DB.prepare("DROP TABLE IF EXISTS student_profiles").run();

        // 2. Create student_profiles
        await env.DB.prepare(`
      CREATE TABLE student_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade INTEGER NOT NULL,
        classNum INTEGER NOT NULL,
        studentNumber INTEGER,
        electives TEXT,
        updatedAt TEXT DEFAULT (datetime('now')),
        UNIQUE(grade, classNum, studentNumber)
      )
    `).run();

        // 3. Create ip_profiles
        await env.DB.prepare(`
      CREATE TABLE ip_profiles (
        ip TEXT PRIMARY KEY,
        student_profile_id INTEGER,
        kakaoId TEXT,
        kakaoNickname TEXT,
        lastAccess TEXT,
        modificationCount INTEGER DEFAULT 0,
        userAgent TEXT,
        instructionDismissed INTEGER DEFAULT 0,
        FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
      )
    `).run();

        // 4. Create cookie_profiles
        await env.DB.prepare(`
      CREATE TABLE cookie_profiles (
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
      )
    `).run();

        return new Response("DB Initialized Successfully", { status: 200 });
    } catch (e: any) {
        return new Response(`DB Init Failed: ${e.message}`, { status: 500 });
    }
};
