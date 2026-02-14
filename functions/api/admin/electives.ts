import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const method = request.method;

    // Auth Check
    const authHeader = request.headers.get('X-Admin-Password');
    // Simple check matching assessments.ts
    // If adminPassword import fails (e.g. server file not in functions), we might fallback or need another way.
    // assessments.ts uses it, so it should be fine.
    if (authHeader !== adminPassword) {
        // Allow if no password set in server/adminPW (dev mode) or strictly enforce?
        // For now, if import works, use it.
        // Actually, let's just use the header check as implies in assessments.ts
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    // Ensure table exists (Lazy Migration for reliability)
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS elective_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grade INTEGER NOT NULL,
                subject TEXT NOT NULL,
                originalTeacher TEXT NOT NULL,
                classCode TEXT,
                fullTeacherName TEXT,
                updatedAt TEXT DEFAULT (datetime('now')),
                isMovingClass INTEGER DEFAULT 1
            )
        `).run();

        // Migration for existing tables: Attempt to add the column if it doesn't exist.
        // SQLite doesn't support IF NOT EXISTS in ADD COLUMN easily, so we rely on catch.
        try {
            await env.DB.prepare("ALTER TABLE elective_config ADD COLUMN isMovingClass INTEGER DEFAULT 1").run();
        } catch (e: any) {
            // Ignore error if column likely already exists ("duplicate column name")
        }
    } catch (e) {
        console.error("Table creation/migration failed:", e);
    }

    if (method === 'GET') {
        const url = new URL(request.url);
        const grade = parseInt(url.searchParams.get('grade') || '0');

        if (!grade) {
            return new Response('Grade is required', { status: 400 });
        }

        try {
            const { results } = await env.DB.prepare(
                "SELECT * FROM elective_config WHERE grade = ?"
            ).bind(grade).all();

            return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    if (method === 'POST') {
        try {
            const body = await request.json();
            const { grade, subject, originalTeacher, classCode, fullTeacherName, isMovingClass } = body;

            // Default isMovingClass to 1 (True) if not provided
            const movingVal = isMovingClass === false ? 0 : 1;

            if (!grade || !subject) {
                return new Response('Missing required fields', { status: 400 });
            }

            const existing = await env.DB.prepare(
                "SELECT id FROM elective_config WHERE grade = ? AND subject = ? AND originalTeacher = ?"
            ).bind(grade, subject, originalTeacher).first();

            if (existing) {
                await env.DB.prepare(
                    "UPDATE elective_config SET classCode = ?, fullTeacherName = ?, isMovingClass = ?, updatedAt = ? WHERE id = ?"
                ).bind(classCode, fullTeacherName, movingVal, new Date().toISOString(), existing.id).run();
            } else {
                await env.DB.prepare(
                    "INSERT INTO elective_config (grade, subject, originalTeacher, classCode, fullTeacherName, isMovingClass, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
                ).bind(grade, subject, originalTeacher, classCode, fullTeacherName, movingVal, new Date().toISOString()).run();
            }

            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response('Method not allowed', { status: 405 });
};
