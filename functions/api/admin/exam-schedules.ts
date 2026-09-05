import { adminPassword } from "../../../server/adminPW";
import { ensureAllTables } from "../../db_schema";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    const authHeader = request.headers.get("X-Admin-Password");
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    await ensureAllTables(env.DB);

    const method = request.method.toUpperCase();

    if (method === "GET") {
        try {
            const { results } = await env.DB.prepare(
                "SELECT * FROM exam_schedules ORDER BY display_order ASC, created_at ASC"
            ).all();
            return new Response(JSON.stringify({ success: true, exams: results || [] }), {
                headers: { "Content-Type": "application/json" },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    if (method === "POST") {
        try {
            const body = await request.json();
            const title = (body.title || "").trim();
            if (!title) {
                return new Response(JSON.stringify({ error: "title은 필수입니다." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const maxRow = await env.DB.prepare(
                "SELECT COALESCE(MAX(display_order), -1) AS maxOrder FROM exam_schedules"
            ).first();
            const nextOrder = ((maxRow?.maxOrder as number) ?? -1) + 1;

            const result = await env.DB.prepare(
                "INSERT INTO exam_schedules (title, exam_type, start_date, end_date, display_order) VALUES (?, ?, ?, ?, ?)"
            )
                .bind(title, body.exam_type || "", body.start_date || null, body.end_date || null, nextOrder)
                .run();

            return new Response(
                JSON.stringify({ success: true, id: result.meta?.last_row_id }),
                { headers: { "Content-Type": "application/json" } }
            );
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    if (method === "PUT") {
        try {
            const body = await request.json();
            const { id, title, exam_type, start_date, end_date } = body;

            if (!id) {
                return new Response(JSON.stringify({ error: "id는 필수입니다." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            await env.DB.prepare(
                UPDATE exam_schedules
                 SET title = ?, exam_type = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
                 WHERE id = ?
            )
                .bind(
                    (title || "").trim(),
                    exam_type || "",
                    start_date || null,
                    end_date || null,
                    id
                )
                .run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    if (method === "DELETE") {
        try {
            const url = new URL(request.url);
            const id = url.searchParams.get("id");
            if (!id) {
                return new Response(JSON.stringify({ error: "id 쿼리 파라미터는 필수입니다." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            await env.DB.prepare("DELETE FROM exam_schedules WHERE id = ?").bind(id).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" },
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
    });
};
