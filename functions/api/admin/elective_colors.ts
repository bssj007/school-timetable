export const onRequest = async (context: any) => {
    const { request, env } = context;
    const adminPassword = request.headers.get("X-Admin-Password");
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

    if (adminPassword !== ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const url = new URL(request.url);
        const grade = url.searchParams.get("grade");

        if (request.method === "GET") {
            const gradeNum = grade ? parseInt(grade) : null;
            let query = `SELECT * FROM elective_group_colors`;
            let params: any[] = [];

            if (gradeNum) {
                query += ` WHERE grade = ?`;
                params.push(gradeNum);
            }

            const { results } = await env.DB.prepare(query).bind(...params).all();

            return new Response(JSON.stringify(results), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (request.method === "POST") {
            const body = await request.json();
            const { grade, classCode, color } = body;

            if (!grade || !classCode || !color) {
                return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
            }

            await env.DB.prepare(`
                INSERT INTO elective_group_colors (grade, classCode, color)
                VALUES (?, ?, ?)
                ON CONFLICT(grade, classCode) DO UPDATE SET
                color = excluded.color,
                updatedAt = datetime('now')
            `).bind(grade, classCode, color).run();

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response("Method Not Allowed", { status: 405 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
