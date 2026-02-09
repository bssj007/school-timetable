import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // Authentication
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        if (request.method === 'GET') {
            // 1. Fetch Raw Logs (Last 24h)
            // We fetch individual rows to aggregate properly in code + match IPProfile structure
            const { results: logs } = await env.DB.prepare(
                `SELECT ip, kakaoId, kakaoNickname, method, accessedAt 
                 FROM access_logs 
                 WHERE accessedAt > datetime('now', '-1 day') 
                 ORDER BY accessedAt DESC`
            ).all();

            // 2. Fetch Blocked Users
            const { results: blockedUsers } = await env.DB.prepare(
                "SELECT * FROM blocked_users ORDER BY createdAt DESC"
            ).all();

            // 3. Aggregate in Memory
            const profileMap = new Map<string, any>();

            // Helper to check block status (IP only for now in this view)
            const getBlockStatus = (ip: string) => {
                return blockedUsers.find((b: any) => b.identifier === ip && b.type === 'IP');
            };

            for (const log of (logs as any[])) {
                if (!log.ip) continue;

                if (!profileMap.has(log.ip)) {
                    const blockEntry = getBlockStatus(log.ip);
                    profileMap.set(log.ip, {
                        ip: log.ip,
                        kakaoAccounts: [],
                        isBlocked: !!blockEntry,
                        blockReason: blockEntry?.reason || null,
                        blockId: blockEntry?.id,
                        modificationCount: 0,
                        lastAccess: log.accessedAt, // First one is latest due to DESC sort
                        assessments: [], // Empty for lightweight list
                        logs: [],        // Empty for lightweight list
                        detailsLoaded: false
                    });
                }

                const profile = profileMap.get(log.ip);

                // Track Modification (Crude count based on method)
                if (['POST', 'DELETE'].includes(log.method)) {
                    profile.modificationCount++;
                }

                // Track Kakao Account (Unique)
                if (log.kakaoId && log.kakaoNickname) {
                    const exists = profile.kakaoAccounts.some((k: any) => k.kakaoId === log.kakaoId);
                    if (!exists) {
                        profile.kakaoAccounts.push({
                            kakaoId: log.kakaoId,
                            kakaoNickname: log.kakaoNickname
                        });
                    }
                }
            }

            const activeUsers = Array.from(profileMap.values());

            return new Response(JSON.stringify({
                activeUsers, // shape: IPProfile[]
                blockedUsers // shape: BlockedUser[]
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'POST') {
            // Block a user/IP
            const body = await request.json();
            const { identifier, type, reason } = body; // identifier: IP or ID, type: 'IP' or 'KAKAO_ID'

            if (!identifier || !type) {
                return new Response("Missing identifier or type", { status: 400 });
            }

            // Check if already blocked
            const existing = await env.DB.prepare(
                "SELECT id FROM blocked_users WHERE identifier = ? AND type = ?"
            ).bind(identifier, type).first();

            if (existing) {
                return new Response(JSON.stringify({ message: "Already blocked" }), { status: 200 });
            }

            await env.DB.prepare(
                "INSERT INTO blocked_users (identifier, type, reason) VALUES (?, ?, ?)"
            ).bind(identifier, type, reason || "Admin blocked").run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'DELETE') {
            // Unblock
            const body = await request.json();
            const { id } = body;

            if (!id) return new Response("Missing ID", { status: 400 });

            await env.DB.prepare(
                "DELETE FROM blocked_users WHERE id = ?"
            ).bind(id).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('Method not allowed', { status: 405 });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
