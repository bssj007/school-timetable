
import { adminPassword } from "../../../server/adminPW";

export const onRequestPost = async (context: any) => {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { confirmation } = body;
        const TARGET_PHRASE = "햇빛이 선명하게 나뭇잎을 핥고 있었다";

        if (confirmation !== TARGET_PHRASE) {
            return new Response(JSON.stringify({ error: "Invalid confirmation phrase" }), { status: 401 });
        }

        // 1. Auth Check (Added)
        const password = request.headers.get("X-Admin-Password");
        if (password !== adminPassword) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        if (!env.DB) {
            return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
        }

        // 2. Drop Tables (Factory Reset)
        await env.DB.prepare("DROP TABLE IF EXISTS users").run();
        await env.DB.prepare("DROP TABLE IF EXISTS performance_assessments").run();
        await env.DB.prepare("DROP TABLE IF EXISTS access_logs").run();
        await env.DB.prepare("DROP TABLE IF EXISTS blocked_users").run();
        await env.DB.prepare("DROP TABLE IF EXISTS system_settings").run();
        // await env.DB.prepare("DROP TABLE IF EXISTS kakao_tokens").run(); // Preserve Kakao tokens
        await env.DB.prepare("DROP TABLE IF EXISTS timetables").run(); // Legacy cleanup

        return new Response(JSON.stringify({ success: true, message: "Database reset complete" }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
