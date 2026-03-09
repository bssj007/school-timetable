import { adminPassword } from "../../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response("Method not allowed", { status: 405 });
    }

    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        const body = await request.json();
        const { ip } = body;

        if (!ip) {
            return new Response(JSON.stringify({ error: "Missing IP address" }), { status: 400 });
        }

        // 1. Find the student_profile_id associated with this IP
        const ipRecord = await env.DB.prepare(
            `SELECT student_profile_id FROM ip_profiles WHERE ip = ?`
        ).bind(ip).first();

        // 2. Clear flags
        const statements = [];

        if (ipRecord && ipRecord.student_profile_id) {
            // Identified user: Reset the main status in student_profiles
            statements.push(
                env.DB.prepare(`UPDATE student_profiles SET instructionDismissed = 0 WHERE id = ?`)
                    .bind(ipRecord.student_profile_id)
            );

            // Also reset fallback in ip_profiles for all IPs sharing this student profile
            statements.push(
                env.DB.prepare(`UPDATE ip_profiles SET instructionDismissed = 0 WHERE student_profile_id = ?`)
                    .bind(ipRecord.student_profile_id)
            );
        } else {
            // Anonymous user: Reset purely in ip_profiles
            statements.push(
                env.DB.prepare(`UPDATE ip_profiles SET instructionDismissed = 0 WHERE ip = ?`)
                    .bind(ip)
            );
        }

        // Execute batch update
        if (statements.length > 0) {
            await env.DB.batch(statements);
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        console.error("Reset Dismiss Error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
