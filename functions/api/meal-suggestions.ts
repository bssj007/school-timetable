import { createMealSuggestionsTable } from "../db_schema";

interface Env {
    DB: any;
}

// GET  - 관리자: 건의 목록 조회
// POST - 사용자: 건의 제출
// DELETE - 관리자: 건의 삭제

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { env, request } = context;
    const adminPw = request.headers.get("X-Admin-Password");
    if (!adminPw) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        try { await env.DB.prepare(createMealSuggestionsTable).run(); } catch (_) {}

        const rows = await env.DB.prepare(
            "SELECT * FROM meal_suggestions ORDER BY createdAt DESC"
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
        try { await env.DB.prepare(createMealSuggestionsTable).run(); } catch (_) {}

        const body = await request.json() as any;
        const { grade, classNum, studentNumber, message } = body;

        if (!message || !message.trim()) {
            return new Response(JSON.stringify({ error: "건의 내용을 입력해주세요." }), { status: 400 });
        }

        // IP 추출
        const ip = request.headers.get("CF-Connecting-IP") ||
                   request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
                   "unknown";

        const result = await env.DB.prepare(
            "INSERT INTO meal_suggestions (grade, classNum, studentNumber, ip, message) VALUES (?, ?, ?, ?, ?)"
        ).bind(
            grade ? parseInt(grade) : null,
            classNum ? parseInt(classNum) : null,
            studentNumber ? parseInt(studentNumber) : null,
            ip,
            message.trim()
        ).run();

        return new Response(JSON.stringify({ success: true, id: result.meta?.last_row_id }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const onRequestDelete = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { request, env } = context;
    const adminPw = request.headers.get("X-Admin-Password");
    if (!adminPw) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
        }

        await env.DB.prepare("DELETE FROM meal_suggestions WHERE id = ?").bind(parseInt(id)).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
