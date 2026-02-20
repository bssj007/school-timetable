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

            // 1. Fetch Profiles
            // 1. Fetch Profiles with Student Info and Dynamic Modification Count
            // 1. Fetch Profiles with Student Info and Dynamic Modification Count
            // NEW SCHEMA: Link via student_profile_id
            let query = `
                SELECT 
                    ip_profiles.ip, 
                    ip_profiles.student_profile_id as profile_id,
                    ip_profiles.kakaoId, 
                    ip_profiles.kakaoNickname, 
                    ip_profiles.lastAccess, 
                    ip_profiles.userAgent,
                    ip_profiles.instructionDismissed,
                    (SELECT COUNT(*) FROM performance_assessments WHERE lastModifiedIp = ip_profiles.ip) as modificationCount,
                    student_profiles.grade as profileGrade,
                    student_profiles.classNum as profileClassNum,
                    student_profiles.studentNumber as profileStudentNumber
                FROM ip_profiles
                LEFT JOIN student_profiles ON ip_profiles.student_profile_id = student_profiles.id
            `;

            if (range === '24h') {
                query += `WHERE ip_profiles.lastAccess > datetime('now', '-1 day') `;
            } else if (range === '7d') {
                query += `WHERE ip_profiles.lastAccess > datetime('now', '-7 days') `;
            }
            // 'all' -> no WHERE clause

            query += `ORDER BY ip_profiles.lastAccess DESC`;

            let profiles = [];
            try {
                const { results } = await env.DB.prepare(query).all();
                profiles = results;
            } catch (e: any) {
                if (e.message && e.message.includes("no such table") && e.message.includes("performance_assessments")) {
                    // Auto-create table if missing (to fix subquery error)
                    await env.DB.prepare(`
                        CREATE TABLE IF NOT EXISTS performance_assessments (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          subject TEXT NOT NULL,
                          title TEXT NOT NULL,
                          description TEXT,
                          dueDate TEXT NOT NULL,
                          grade INTEGER NOT NULL,
                          classNum INTEGER NOT NULL,
                          classTime INTEGER,
                          isDone INTEGER DEFAULT 0,
                          createdAt TEXT DEFAULT (datetime('now')),
                          lastModifiedIp TEXT
                        )
                    `).run();
                    // Retry
                    const { results } = await env.DB.prepare(query).all();
                    profiles = results;
                } else {
                    throw e;
                }
            }

            // 2. Fetch Blocked Users
            let blockedUsers: any[] = [];
            try {
                const { results } = await env.DB.prepare(
                    "SELECT * FROM blocked_users ORDER BY createdAt DESC"
                ).all();
                blockedUsers = results;
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    // Create table if missing
                    await env.DB.prepare(`
                        CREATE TABLE IF NOT EXISTS blocked_users (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          identifier TEXT NOT NULL, 
                          type TEXT NOT NULL,
                          reason TEXT,
                          createdAt TEXT DEFAULT (datetime('now'))
                        )
                    `).run();
                    // Retry (will be empty, but prevents error)
                    blockedUsers = [];
                } else {
                    throw e;
                }
            }

            // 3. Transform to Profile format
            const activeUsers = profiles.map((p: any) => {
                const profile = {
                    clientId: p.ip, // Use IP as Client ID
                    ip: p.ip,
                    kakaoAccounts: p.kakaoId ? [{ kakaoId: p.kakaoId, kakaoNickname: p.kakaoNickname || '(알 수 없음)' }] : [],
                    isBlocked: false,
                    blockReason: null,
                    modificationCount: p.modificationCount || 0,
                    lastAccess: p.lastAccess,
                    recentUserAgents: p.userAgent ? [p.userAgent] : [],
                    grade: p.profileGrade || null,
                    classNum: p.profileClassNum || null,
                    studentNumber: p.profileStudentNumber || null,
                    instructionDismissed: !!p.instructionDismissed,
                    assessments: [],
                    logs: [],
                    detailsLoaded: false,
                    blockId: null as number | null
                };

                const blockEntry = blockedUsers.find((b: any) => (b.identifier === profile.clientId || b.identifier === profile.ip) && (b.type === 'CLIENT_ID' || b.type === 'IP'));
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
