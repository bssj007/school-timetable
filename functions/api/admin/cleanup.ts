import { adminPassword } from "../../../server/adminPW";
import { performCleanup } from "../../../server/performCleanup";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // 1. Auth Check
    const password = request.headers.get("X-Admin-Password");
    if (password !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), { status: 500 });
    }

    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    const result = await performCleanup(env.DB);

    if (result.success) {
        return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    } else {
        return new Response(JSON.stringify(result), { status: result.error ? 500 : 200, headers: { "Content-Type": "application/json" } });
    }
}
