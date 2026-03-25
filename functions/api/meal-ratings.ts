import { createMealRatingsTable } from "../db_schema";

interface Env {
    DB: any;
}

// GET  ?date=YYYY-MM-DD[&type=lunch/dinner][&grade=&classNum=&studentNumber=]
//   → { averages: {date, type, avg, count}[], myRating: number|null }
// POST { date, type, grade, classNum, studentNumber, rating }
//   → upsert

// Helper: Run D1 Schema Migration if needed
const ensureMealRatingsSchema = async (db: any) => {
    try { await db.prepare(createMealRatingsTable).run(); } catch (_) {}
    try {
        await db.prepare("SELECT type FROM meal_ratings LIMIT 1").run();
    } catch (e: any) {
        if (e.message && e.message.includes("no such column")) {
            console.log("Migrating meal_ratings to include 'type' column...");
            await db.batch([
                db.prepare(`CREATE TABLE meal_ratings_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    type TEXT NOT NULL,
                    grade INTEGER,
                    classNum INTEGER,
                    studentNumber INTEGER,
                    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                    createdAt TEXT,
                    UNIQUE(date, type, grade, classNum, studentNumber)
                )`),
                db.prepare(`INSERT INTO meal_ratings_new (id, date, type, grade, classNum, studentNumber, rating, createdAt) SELECT id, date, 'lunch', grade, classNum, studentNumber, rating, createdAt FROM meal_ratings`),
                db.prepare(`DROP TABLE meal_ratings`),
                db.prepare(`ALTER TABLE meal_ratings_new RENAME TO meal_ratings`)
            ]);
        } else {
            throw e;
        }
    }
};

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { request, env } = context;
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const type = url.searchParams.get("type");
    const grade = url.searchParams.get("grade");
    const classNum = url.searchParams.get("classNum");
    const studentNumber = url.searchParams.get("studentNumber");

    try {
        await ensureMealRatingsSchema(env.DB);

        if (date && type) {
            // 특정 날짜/타입의 평균 + 내 별점
            const avgRow = await env.DB.prepare(
                "SELECT AVG(rating) as avg, COUNT(*) as count FROM meal_ratings WHERE date = ? AND type = ?"
            ).bind(date, type).first();

            let myRating: number | null = null;
            if (grade && classNum && studentNumber) {
                const myRow = await env.DB.prepare(
                    "SELECT rating FROM meal_ratings WHERE date = ? AND type = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(date, type, parseInt(grade), parseInt(classNum), parseInt(studentNumber)).first();
                myRating = myRow?.rating ?? null;
            }

            return new Response(JSON.stringify({
                date,
                type,
                avg: avgRow?.avg ? Math.round(avgRow.avg * 10) / 10 : null,
                count: avgRow?.count ?? 0,
                myRating,
            }), { headers: { "Content-Type": "application/json" } });
        }

        // 모든 날짜, 타입별 평균 (관리자용)
        const rows = await env.DB.prepare(
            "SELECT date, type, AVG(rating) as avg, COUNT(*) as count FROM meal_ratings GROUP BY date, type ORDER BY date DESC"
        ).all();

        return new Response(JSON.stringify(rows.results || []), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { request, env } = context;

    try {
        await ensureMealRatingsSchema(env.DB);

        const body = await request.json() as any;
        const { date, type, grade, classNum, studentNumber, rating } = body;

        if (!date || !type || !rating || rating < 1 || rating > 5) {
            return new Response(JSON.stringify({ error: "date, type과 rating(1-5)이 필요합니다." }), { status: 400 });
        }

        const createdAt = new Date().toISOString();

        // UPSERT: 이미 있으면 rating만 업데이트
        await env.DB.prepare(`
            INSERT INTO meal_ratings (date, type, grade, classNum, studentNumber, rating, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, type, grade, classNum, studentNumber) DO UPDATE SET rating = excluded.rating, createdAt = excluded.createdAt
        `).bind(
            date,
            type,
            grade ? parseInt(grade) : null,
            classNum ? parseInt(classNum) : null,
            studentNumber ? parseInt(studentNumber) : null,
            parseInt(rating),
            createdAt
        ).run();

        // 업데이트 후 최신 평균 반환
        const avgRow = await env.DB.prepare(
            "SELECT AVG(rating) as avg, COUNT(*) as count FROM meal_ratings WHERE date = ? AND type = ?"
        ).bind(date, type).first();

        return new Response(JSON.stringify({
            success: true,
            avg: avgRow?.avg ? Math.round(avgRow.avg * 10) / 10 : null,
            count: avgRow?.count ?? 0,
            myRating: parseInt(rating),
        }), { headers: { "Content-Type": "application/json" } });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
