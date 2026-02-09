
import { adminPasswords } from "../../../server/adminPW";

export const onRequestPost = async (context: any) => {
    const { request, env } = context;

    // 1. Password Check
    const password = request.headers.get("X-Admin-Password");
    if (!adminPasswords.includes(password)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
    }

    try {
        // 2. Drop Tables
        await env.DB.prepare("DROP TABLE IF EXISTS performance_assessments").run();
        await env.DB.prepare("DROP TABLE IF EXISTS access_logs").run();
        await env.DB.prepare("DROP TABLE IF EXISTS blocked_users").run();

        // 3. (Optional) Re-create empty tables IMMEDIATELY to avoid downtime errors?
        // Actually, let's rely on _middleware.ts and assessment.ts to lazy-create them 
        // as we implemented earlier. This is a true "Factory Reset" to a clean state.

        return new Response(JSON.stringify({ success: true, message: "Database reset complete" }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
