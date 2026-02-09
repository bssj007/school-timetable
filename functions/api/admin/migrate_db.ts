import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // Authentication Check
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        // Attempt to add the column
        // We use a try-catch block to handle the case where the column might already exist
        try {
            await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT").run();
            return new Response(JSON.stringify({ success: true, message: "Migration applied: Added lastModifiedIp column." }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e: any) {
            // Check for duplicate column error
            // SQLite error for duplicate column usually contains "duplicate column name"
            if (e.message.includes("duplicate column name")) {
                return new Response(JSON.stringify({ success: true, message: "Column lastModifiedIp already exists." }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            throw e;
        }

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
