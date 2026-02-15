interface Env {
    DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
    }

    // GET: Check status
    if (request.method === "GET") {
        try {
            const result = await env.DB.prepare(
                "SELECT instructionDismissed FROM ip_profiles WHERE ip = ?"
            ).bind(ip).first();

            return new Response(JSON.stringify({
                dismissed: result ? !!result.instructionDismissed : false
            }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ dismissed: false, error: e.message }), { status: 200 }); // Fail safe: return false
        }
    }

    // POST: Set dismissed = true
    if (request.method === "POST") {
        try {
            // Upsert: if profile exists update, if not insert (bare minimum)
            await env.DB.prepare(`
                INSERT INTO ip_profiles (ip, instructionDismissed, lastAccess)
                VALUES (?, 1, datetime('now'))
                ON CONFLICT(ip) DO UPDATE SET instructionDismissed = 1
            `).bind(ip).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response("Method not allowed", { status: 405 });
};
