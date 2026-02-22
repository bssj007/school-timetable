export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const grade = url.searchParams.get("grade");

    try {
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

        return new Response("Method Not Allowed", { status: 405 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
