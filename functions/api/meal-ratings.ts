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
    // studentName 컬럼 추가 마이그레이션
    try {
        await db.prepare("ALTER TABLE meal_ratings ADD COLUMN studentName TEXT NOT NULL DEFAULT ''").run();
    } catch (_) {} // 이미 존재하면 무시
    // UNIQUE 제약 변경: (date, type, grade, classNum, studentNumber) → (date, type, studentName, grade, classNum, studentNumber)
    // SQLite 특성상 컬럼 추가 후 기존 UNIQUE 제약 변경 불가 — 신규 레코드부터 새 기준 적용
    // type 컬럼 추가 마이그레이션 (기존 호환)
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
                    studentName TEXT NOT NULL DEFAULT '',
                    grade INTEGER,
                    classNum INTEGER,
                    studentNumber INTEGER,
                    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                    createdAt TEXT,
                    UNIQUE(date, type, studentName, grade, classNum, studentNumber)
                )`),
                db.prepare(`INSERT INTO meal_ratings_new (id, date, type, studentName, grade, classNum, studentNumber, rating, createdAt) SELECT id, date, 'lunch', '', grade, classNum, studentNumber, rating, createdAt FROM meal_ratings`),
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
        if (date && type) {
            // 특정 날짜/타입의 평균 + 내 별점
            let avgRow: any;
            try {
                avgRow = await env.DB.prepare(
                    "SELECT AVG(rating) as avg, COUNT(*) as count FROM meal_ratings WHERE date = ? AND type = ?"
                ).bind(date, type).first();
            } catch (e: any) {
                if (e.message && (e.message.includes("no such table") || e.message.includes("no such column"))) {
                    await ensureMealRatingsSchema(env.DB);
                    avgRow = await env.DB.prepare(
                        "SELECT AVG(rating) as avg, COUNT(*) as count FROM meal_ratings WHERE date = ? AND type = ?"
                    ).bind(date, type).first();
                } else {
                    throw e;
                }
            }

            // 내 평점: studentName + 학번 모두 있어야 조회 (없으면 null 반환)
            const studentName = url.searchParams.get("studentName")?.trim() ?? '';
            let myRating: number | null = null;
            if (studentName && grade && classNum && studentNumber) {
                const myRow = await env.DB.prepare(
                    "SELECT rating FROM meal_ratings WHERE date = ? AND type = ? AND studentName = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(date, type, studentName, parseInt(grade), parseInt(classNum), parseInt(studentNumber)).first();
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
        let rows: any;
        try {
            rows = await env.DB.prepare(
                "SELECT date, type, AVG(rating) as avg, COUNT(*) as count FROM meal_ratings GROUP BY date, type ORDER BY date DESC"
            ).all();
        } catch (e: any) {
            if (e.message && (e.message.includes("no such table") || e.message.includes("no such column"))) {
                console.log("[Meal Ratings API] Schema missing in Admin get, running auto-heal.");
                await ensureMealRatingsSchema(env.DB);
                rows = await env.DB.prepare(
                    "SELECT date, type, AVG(rating) as avg, COUNT(*) as count FROM meal_ratings GROUP BY date, type ORDER BY date DESC"
                ).all();
            } else {
                throw e;
            }
        }

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
        const { date, type, grade, classNum, studentNumber, studentName, rating } = body;

        // studentName 필수
        const name = typeof studentName === 'string' ? studentName.trim() : '';
        if (!date || !type || !name) {
            return new Response(JSON.stringify({ error: "date, type, studentName이 필요합니다." }), { status: 400 });
        }
        if (!rating || rating < 1 || rating > 5) {
            return new Response(JSON.stringify({ error: "rating(1-5)이 필요합니다." }), { status: 400 });
        }

        const createdAt = new Date().toISOString();

        // UPSERT: studentName + 학번 기준
        await env.DB.prepare(`
            INSERT INTO meal_ratings (date, type, studentName, grade, classNum, studentNumber, rating, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, type, studentName, grade, classNum, studentNumber) DO UPDATE SET rating = excluded.rating, createdAt = excluded.createdAt
        `).bind(
            date,
            type,
            name,
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
