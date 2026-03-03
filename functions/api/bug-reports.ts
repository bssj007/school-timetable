import { createBugReportsTable } from "../db_schema";

interface Env {
    DB: any;
}

// GET: Fetch all bug reports (admin)
// POST: Submit a new bug report (student)
// DELETE: Delete a bug report (admin)

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env } = context;

    try {
        // Ensure table exists
        try { await env.DB.prepare(createBugReportsTable).run(); } catch (_) { }

        const reports = await env.DB.prepare(
            "SELECT * FROM bug_reports ORDER BY createdAt DESC"
        ).all();

        return new Response(JSON.stringify(reports.results || []), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    try {
        // Ensure table exists
        try { await env.DB.prepare(createBugReportsTable).run(); } catch (_) { }

        const body = await request.json() as any;
        const { grade, classNum, studentNumber, message } = body;

        if (!message || !message.trim()) {
            return new Response(JSON.stringify({ error: "메시지를 입력해주세요." }), { status: 400 });
        }

        await env.DB.prepare(
            "INSERT INTO bug_reports (grade, classNum, studentNumber, message) VALUES (?, ?, ?, ?)"
        ).bind(
            grade ? parseInt(grade) : null,
            classNum ? parseInt(classNum) : null,
            studentNumber ? parseInt(studentNumber) : null,
            message.trim()
        ).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
        }

        await env.DB.prepare("DELETE FROM bug_reports WHERE id = ?").bind(parseInt(id)).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
