import { adminPassword } from "../../../server/adminPW";
import { ensureAllTables } from "../../db_schema";

/**
 * 학번별 선택과목 사전지정 API
 * GET    ?grade=2&classNum=3        → 해당 반 전체 프리셋 목록
 * POST   { grade, classNum, studentNumber, electives, dataset }  → upsert
 * DELETE { grade, classNum, studentNumber }  → 삭제
 */
export const onRequest = async (context: any) => {
    const { request, env } = context;
    const auth = request.headers.get("X-Admin-Password");
    if (auth !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (!env.DB) {
        return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500 });
    }

    try {
        await ensureAllTables(env.DB);

        if (request.method === "GET") {
            const url = new URL(request.url);
            const grade = parseInt(url.searchParams.get("grade") || "0");
            const classNum = parseInt(url.searchParams.get("classNum") || "0");

            if (!grade || !classNum) {
                return new Response(JSON.stringify({ error: "grade and classNum required" }), { status: 400 });
            }

            const { results } = await env.DB.prepare(
                "SELECT * FROM elective_presets WHERE grade = ? AND classNum = ? ORDER BY studentNumber"
            ).bind(grade, classNum).all();

            return new Response(JSON.stringify(results), {
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method === "POST") {
            const body = await request.json();
            const { grade, classNum, studentNumber, electives, dataset } = body;

            if (!grade || !classNum || !studentNumber) {
                return new Response(JSON.stringify({ error: "grade, classNum, studentNumber required" }), { status: 400 });
            }

            await env.DB.prepare(`
                INSERT INTO elective_presets (grade, classNum, studentNumber, electives, dataset, updatedAt)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(grade, classNum, studentNumber)
                DO UPDATE SET
                    electives = excluded.electives,
                    dataset   = excluded.dataset,
                    updatedAt = datetime('now')
            `).bind(grade, classNum, studentNumber, electives ?? null, dataset ?? "").run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method === "DELETE") {
            const body = await request.json();
            const { grade, classNum, studentNumber } = body;

            if (!grade || !classNum || !studentNumber) {
                return new Response(JSON.stringify({ error: "grade, classNum, studentNumber required" }), { status: 400 });
            }

            await env.DB.prepare(
                "DELETE FROM elective_presets WHERE grade = ? AND classNum = ? AND studentNumber = ?"
            ).bind(grade, classNum, studentNumber).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response("Method not allowed", { status: 405 });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
