import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // Password Check (Simple Auth Middleware for Admin Routes)
    // In a real production app, use JWT or Session Cookie.
    // Here we will rely on the client sending the password in a custom header "X-Admin-Password" 
    // or we can implement a proper login session.
    // For now, let's check the header for simplicity and security.
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        if (request.method === 'GET') {
            // Fetch ALL assessments ordered by Grade, Class, DueDate
            const { results } = await env.DB.prepare(
                "SELECT * FROM performance_assessments ORDER BY grade ASC, classNum ASC, dueDate ASC"
            ).all();

            return new Response(JSON.stringify(results), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'DELETE') {
            // Bulk Delete
            const body = await request.json();
            const { ids } = body; // Array of IDs

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return new Response("Invalid IDs", { status: 400 });
            }

            // Construct SQL for bulk delete: DELETE FROM table WHERE id IN (?, ?, ?)
            const placeholders = ids.map(() => '?').join(',');
            const query = `DELETE FROM performance_assessments WHERE id IN (${placeholders})`;

            await env.DB.prepare(query).bind(...ids).run();

            return new Response(JSON.stringify({ success: true, count: ids.length }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('Method not allowed', { status: 405 });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
