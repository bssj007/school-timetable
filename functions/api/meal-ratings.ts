import { createMealRatingsTable } from "../db_schema";

interface Env {
    DB: any;
}

// GET  ?date=YYYY-MM-DD[&grade=&classNum=&studentNumber=]
//   → { averages: {date, avg, count}[], myRating: number|null }
// POST { date, grade, classNum, studentNumber, rating }
//   → upsert

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { request, env } = context;
    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const grade = url.searchParams.get("grade");
    const classNum = url.searchParams.get("classNum");
    const studentNumber = url.searchParams.get("studentNumber");

    try {
        try { await env.DB.prepare(createMealRatingsTable).run(); } catch (_) {}

        if (date) {
            // 특정 날짜의 평균 + 내 별점
            const avgRow = await env.DB.prepare(
                "SELECT AVG(rating) as avg, COUNT(*) as count FROM meal_ratings WHERE date = ?"
            ).bind(date).first();

            let myRating: number | null = null;
            if (grade && classNum && studentNumber) {
                const myRow = await env.DB.prepare(
                    "SELECT rating FROM meal_ratings WHERE date = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(date, parseInt(grade), parseInt(classNum), parseInt(studentNumber)).first();
                myRating = myRow?.rating ?? null;
            }

            return new Response(JSON.stringify({
                date,
                avg: avgRow?.avg ? Math.round(avgRow.avg * 10) / 10 : null,
                count: avgRow?.count ?? 0,
                myRating,
            }), { headers: { "Content-Type": "application/json" } });
        }

        // 모든 날짜 평균 (관리자용)
        const rows = await env.DB.prepare(
            "SELECT date, AVG(rating) as avg, COUNT(*) as count FROM meal_ratings GROUP BY date ORDER BY date DESC"
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
        try { await env.DB.prepare(createMealRatingsTable).run(); } catch (_) {}

        const body = await request.json() as any;
        const { date, grade, classNum, studentNumber, rating } = body;

        if (!date || !rating || rating < 1 || rating > 5) {
            return new Response(JSON.stringify({ error: "date와 rating(1-5)이 필요합니다." }), { status: 400 });
        }

        const createdAt = new Date().toISOString();

        // UPSERT: 이미 있으면 rating만 업데이트
        await env.DB.prepare(`
            INSERT INTO meal_ratings (date, grade, classNum, studentNumber, rating, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, grade, classNum, studentNumber) DO UPDATE SET rating = excluded.rating, createdAt = excluded.createdAt
        `).bind(
            date,
            grade ? parseInt(grade) : null,
            classNum ? parseInt(classNum) : null,
            studentNumber ? parseInt(studentNumber) : null,
            parseInt(rating),
            createdAt
        ).run();

        // 업데이트 후 최신 평균 반환
        const avgRow = await env.DB.prepare(
            "SELECT AVG(rating) as avg, COUNT(*) as count FROM meal_ratings WHERE date = ?"
        ).bind(date).first();

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
