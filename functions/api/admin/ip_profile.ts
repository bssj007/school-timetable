
import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const targetIp = url.searchParams.get("ip");

    // 1. Auth Check
    // 1. Auth Check
    const password = request.headers.get("X-Admin-Password");
    if (password !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
    }

    if (!targetIp) {
        return new Response(JSON.stringify({ error: "Missing IP address" }), { status: 400 });
    }

    try {
        // 2. Fetch Data concurrently
        // A. Block Status
        const blockEntry = await env.DB.prepare(
            "SELECT * FROM blocked_users WHERE identifier = ? AND type = 'IP'"
        ).bind(targetIp).first();

        // B. Modification Count
        // Check if table exists first (self-healing might have created it, but good to be safe)
        // We assume tables exist because admin page loaded.
        const modCountResult = await env.DB.prepare(
            "SELECT COUNT(*) as count FROM performance_assessments WHERE lastModifiedIp = ?"
        ).bind(targetIp).first();
        const modificationCount = modCountResult?.count || 0;

        // C. Last Access
        const lastAccessResult = await env.DB.prepare(
            "SELECT MAX(accessedAt) as lastAccess FROM access_logs WHERE ip = ?"
        ).bind(targetIp).first();
        const lastAccess = lastAccessResult?.lastAccess || null;

        // D. Linked Kakao Accounts (Distinct)
        const { results: kakaoAccounts } = await env.DB.prepare(
            "SELECT DISTINCT kakaoId, kakaoNickname FROM access_logs WHERE ip = ? AND kakaoId IS NOT NULL"
        ).bind(targetIp).all();

        // E. Detailed Assessments (Top 50)
        const { results: recentAssessments } = await env.DB.prepare(
            "SELECT id, subject, title, grade, classNum, dueDate, createdAt FROM performance_assessments WHERE lastModifiedIp = ? ORDER BY id DESC LIMIT 50"
        ).bind(targetIp).all();

        // F. Detailed Logs (Top 50)
        const { results: recentLogs } = await env.DB.prepare(
            "SELECT * FROM access_logs WHERE ip = ? ORDER BY accessedAt DESC LIMIT 50"
        ).bind(targetIp).all();

        // G. Recent User Agents (Distinct)
        const { results: uas } = await env.DB.prepare(
            "SELECT DISTINCT userAgent FROM access_logs WHERE ip = ? AND userAgent IS NOT NULL ORDER BY accessedAt DESC LIMIT 10"
        ).bind(targetIp).all();
        const recentUserAgents = uas?.map((r: any) => r.userAgent) || [];

        // H. Grade/Class Info (Best Guess from Access Logs)
        const gradeClassResult = await env.DB.prepare(
            "SELECT grade, classNum FROM access_logs WHERE ip = ? AND grade IS NOT NULL AND classNum IS NOT NULL ORDER BY accessedAt DESC LIMIT 1"
        ).bind(targetIp).first();
        const grade = gradeClassResult?.grade;
        const classNum = gradeClassResult?.classNum;

        // 3. Construct Response (Matching IPProfile interface)
        const responseData = {
            ip: targetIp,
            kakaoAccounts: kakaoAccounts || [],

            grade,
            classNum,

            isBlocked: !!blockEntry,
            blockReason: blockEntry?.reason || null,
            blockId: blockEntry?.id,

            modificationCount,
            lastAccess,
            recentUserAgents,

            assessments: recentAssessments || [],
            logs: recentLogs || [],

            detailsLoaded: true // Flag to indicate full data
        };

        return new Response(JSON.stringify(responseData), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        // Handle "no such table" gracefully if needed, but Admin page usually ensures they exist via middleware.
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
