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
            const url = new URL(request.url);
            const range = url.searchParams.get('range') || '24h'; // '24h' | '7d' | 'all'



            // 1. Fetch Profiles (Joined with Student Info)
            let query = `
                SELECT 
                    ip_profiles.ip, 
                    ip_profiles.kakaoId, 
                    ip_profiles.kakaoNickname, 
                    ip_profiles.lastAccess, 
                    ip_profiles.modificationCount, 
                    ip_profiles.userAgent,
                    ip_profiles.isBlocked,
                    ip_profiles.blockReason,
                    student_profiles.grade, 
                    student_profiles.classNum, 
                    student_profiles.studentNumber
                FROM ip_profiles
                LEFT JOIN student_profiles ON ip_profiles.student_profile_id = student_profiles.id
            `;

            if (range === '24h') {
                query += `WHERE lastAccess > datetime('now', '-1 day') `;
            } else if (range === '7d') {
                query += `WHERE lastAccess > datetime('now', '-7 days') `;
            }
            // 'all' -> no WHERE clause

            query += `ORDER BY lastAccess DESC`;

            const { results: profiles } = await env.DB.prepare(query).all();

            // 2. Fetch Blocked Users (for redundancy check or other types)
            const { results: blockedUsers } = await env.DB.prepare(
                "SELECT * FROM blocked_users ORDER BY createdAt DESC"
            ).all();

            // 3. Transform to IPProfile format
            const activeUsers = profiles.map((p: any) => ({
                ip: p.ip,
                kakaoAccounts: p.kakaoId ? [{ kakaoId: p.kakaoId, kakaoNickname: p.kakaoNickname || '(알 수 없음)' }] : [],
                isBlocked: !!p.isBlocked, // Logic in middleware/db should ideally sync this, but for now specific block table is source of truth?
                // Actually blocked_users table is the source of truth for blocking.
                // We should check against blockedUsers list.
                // The ip_profiles table has isBlocked column? No, I defined it in migration?
                // Wait, I did NOT define isBlocked in ip_profiles in migration. I defined:
                // ip, student_profile_id, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent
                // So I need to join with blocked_users or check it here.

                // Let's re-check blocked status here
                // We'll calculate isBlocked from blockedUsers list

                blockReason: null, // Will be filled below
                modificationCount: p.modificationCount || 0,
                lastAccess: p.lastAccess,
                recentUserAgents: p.userAgent ? [p.userAgent] : [],
                grade: p.grade || null,
                classNum: p.classNum || null,
                studentNumber: p.studentNumber || null,
                assessments: [],
                logs: [],
                detailsLoaded: false
            })).map((profile: any) => {
                const blockEntry = blockedUsers.find((b: any) => b.identifier === profile.ip && b.type === 'IP');
                if (blockEntry) {
                    profile.isBlocked = true;
                    profile.blockReason = blockEntry.reason;
                    profile.blockId = blockEntry.id;
                }
                return profile;
            });

            return new Response(JSON.stringify({
                activeUsers,
                blockedUsers
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
