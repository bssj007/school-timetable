export const onRequest = async (context: any) => {
    const { request, env } = context;
    // Use Client ID from Middleware
    const clientId = (context.data as any).clientId;

    if (!clientId) {
        // Fallback or Error? Middleware should guarantee clientId.
        return new Response(JSON.stringify({ error: "No Client ID" }), { status: 400 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
    }

    // GET: Check status
    if (request.method === "GET") {
        try {
            const result = await env.DB.prepare(
                "SELECT instructionDismissed FROM cookie_profiles WHERE client_id = ?"
            ).bind(clientId).first();

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
            // Note: Middleware creates the profile on every request, but we might race it.
            // Better to UPSERT here too.
            // However, middleware runs asynchronously.
            // Ideally, we just update the existing row because middleware *should* have created it or will created it.
            // But to be safe, we Upsert.

            // Wait, if middleware is async, the row might not exist yet when this runs?
            // Middleware logic: `context.waitUntil(logAndUpdateProfile())`.
            // This means `logAndUpdateProfile` runs in parallel with this handler.
            // So the row might NOT exist yet.
            // We should use an UPSERT that respects other fields.

            // Actually, for simplicity and speed, let's just UPDATE if exists, or INSERT minimal.
            // Only `instructionDismissed` matters here.

            await env.DB.prepare(`
                INSERT INTO cookie_profiles (client_id, instructionDismissed, lastAccess)
                VALUES (?, 1, datetime('now'))
                ON CONFLICT(client_id) DO UPDATE SET instructionDismissed = 1
            `).bind(clientId).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response("Method not allowed", { status: 405 });
};
