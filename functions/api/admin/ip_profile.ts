
import { adminPassword } from "../../../server/adminPW";
import { parseUA } from "../../_uaDetect";

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

        // F. Detailed Logs (최근 500건으로 제한 - 무제한 조회 시 D1 응답 초과/타임아웃 방지)
        const { results: recentLogs } = await env.DB.prepare(
            "SELECT * FROM access_logs WHERE ip = ? ORDER BY accessedAt DESC LIMIT 500"
        ).bind(targetIp).all();

        // G. Recent Environments — 최신순, ua parse 컬럼 포함 (최대 15개)
        let recentEnvironments: any[] = [];
        let recentUserAgents: string[] = [];
        try {
            const { results: envRows } = await env.DB.prepare(
                `SELECT userAgent, browserKey, deviceType, os, isInApp, accessedAt
                 FROM access_logs
                 WHERE ip = ? AND userAgent IS NOT NULL
                 ORDER BY accessedAt DESC
                 LIMIT 15`
            ).bind(targetIp).all();

            recentEnvironments = (envRows || []).map((r: any) => {
                const parsed = parseUA(r.userAgent);
                return {
                    userAgent:   r.userAgent   || null,
                    browserKey:  r.browserKey  || parsed.browserKey || 'other',
                    deviceType:  r.deviceType  || parsed.deviceType || 'desktop',
                    os:          r.os          || parsed.os || null,
                    isInApp:     r.isInApp     === 1 || r.isInApp === true || parsed.isInApp,
                    isApp:       parsed.isApp,
                    accessedAt:  r.accessedAt  || null,
                };
            });

            // backward compat: distinct UAs
            const seen = new Set<string>();
            recentEnvironments.forEach(e => { if (e.userAgent) seen.add(e.userAgent); });
            recentUserAgents = Array.from(seen).slice(0, 10);
        } catch {
            // access_logs에 browserKey 컬럼 없으면 구버전 쿼리 fallback
            try {
                const { results: uas } = await env.DB.prepare(
                    "SELECT DISTINCT userAgent FROM access_logs WHERE ip = ? AND userAgent IS NOT NULL ORDER BY accessedAt DESC LIMIT 10"
                ).bind(targetIp).all();
                recentUserAgents = uas?.map((r: any) => r.userAgent) || [];
                recentEnvironments = recentUserAgents.map(ua => ({ userAgent: ua, browserKey: null, deviceType: null, os: null, isInApp: false, accessedAt: null }));
            } catch {}
        }

        // H. Grade/Class/Name Info & Electives (via student_profile_id or access_logs fallback)
        let studentName: string | null = null;
        let grade: any = null;
        let classNum: any = null;
        let studentNumber: any = null;
        let electives: any = null;

        const linkedProfile: any = await env.DB.prepare(`
            SELECT sp.name as studentName, sp.grade, sp.classNum, sp.studentNumber, sp.electives
            FROM ip_profiles ip
            JOIN student_profiles sp ON ip.student_profile_id = sp.id
            WHERE ip.ip = ?
        `).bind(targetIp).first().catch(() => null);

        if (linkedProfile) {
            studentName = linkedProfile.studentName || null;
            grade = linkedProfile.grade;
            classNum = linkedProfile.classNum;
            studentNumber = linkedProfile.studentNumber;
            if (linkedProfile.electives) {
                try {
                    electives = JSON.parse(linkedProfile.electives);
                } catch {
                    electives = linkedProfile.electives;
                }
                if (typeof electives === "string") {
                    try { electives = JSON.parse(electives); } catch {}
                }
            }
        } else {
            // Fallback to access_logs if not directly linked
            const gradeClassResult: any = await env.DB.prepare(
                "SELECT grade, classNum, studentNumber FROM access_logs WHERE ip = ? AND grade IS NOT NULL AND classNum IS NOT NULL ORDER BY accessedAt DESC LIMIT 1"
            ).bind(targetIp).first().catch(() => null);
            grade = gradeClassResult?.grade || null;
            classNum = gradeClassResult?.classNum || null;
            studentNumber = gradeClassResult?.studentNumber || null;

            if (grade && classNum && studentNumber) {
                const profileResult: any = await env.DB.prepare(
                    "SELECT name as studentName, electives FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ? ORDER BY updatedAt DESC LIMIT 1"
                ).bind(grade, classNum, studentNumber).first().catch(() => null);
                if (profileResult) {
                    studentName = profileResult.studentName || null;
                    if (profileResult.electives) {
                        try { electives = JSON.parse(profileResult.electives); } catch { electives = profileResult.electives; }
                        if (typeof electives === "string") {
                            try { electives = JSON.parse(electives); } catch {}
                        }
                    }
                }
            }
        }

        // J. Fetch Print and Download Counts + teacherName from ip_profiles
        let printCount = 0;
        let downloadCount = 0;
        let isStandalone = 0;
        let teacherName: string | null = null;
        try {
            const ipProfileRowResult: any = await env.DB.prepare(
                "SELECT printCount, downloadCount, isStandalone, teacherName FROM ip_profiles WHERE ip = ?"
            ).bind(targetIp).first();
            printCount = ipProfileRowResult?.printCount || 0;
            downloadCount = ipProfileRowResult?.downloadCount || 0;
            isStandalone = ipProfileRowResult?.isStandalone || 0;
            teacherName = ipProfileRowResult?.teacherName || null;
        } catch (e: any) {
            if (e.message && (e.message.includes("no such column") || e.message.includes("has no column named") || e.message.includes("no column named"))) {
                console.log("[Admin API] Schema mismatch for printCount/downloadCount. Running safe ALTER TABLE...");
                try {
                    await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN printCount INTEGER DEFAULT 0").run();
                } catch (_) { }
                try {
                    await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN downloadCount INTEGER DEFAULT 0").run();
                } catch (_) { }
                try {
                    await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN isStandalone INTEGER DEFAULT 0").run();
                } catch (_) { }
                try {
                    await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN teacherName TEXT").run();
                } catch (_) { }
                // Keep values as defaults for this request
            } else {
                throw e;
            }
        }

        // teacherName fallback: access_logs에서 가장 최근 teacherName 조회
        if (!teacherName) {
            try {
                const logTeacher: any = await env.DB.prepare(
                    "SELECT teacherName FROM access_logs WHERE ip = ? AND teacherName IS NOT NULL AND teacherName != '' ORDER BY accessedAt DESC LIMIT 1"
                ).bind(targetIp).first().catch(() => null);
                if (logTeacher?.teacherName) teacherName = logTeacher.teacherName;
            } catch (_) {}
        }

        // 3. Construct Response (Matching IPProfile interface)
        const latestUA = recentEnvironments?.[0]?.userAgent || recentUserAgents?.[0] || "";
        const detectServerAppType = (userAgent: string): "webview" | "pwa" | null => {
            const ua = (userAgent || "").trim();
            if (!ua) return null;

            const isKakao = /KAKAOTALK/i.test(ua);
            const isInApp = isKakao || /NAVER|Instagram|FBAN|FBAV|LINE/i.test(ua);
            if (isInApp) return null;

            const isSeongjisuhaengApp = /SeongjisuhaengApp/i.test(ua);
            const hasAndroidWvToken = !/GSA\//i.test(ua) && (/;\s*wv[;)]/i.test(ua) || /\bwv\b/i.test(ua));
            const isAndroidWebViewUA = !/GSA\//i.test(ua) && /Version\/[0-9.]+/i.test(ua) && /Chrome\/[0-9.]+/i.test(ua) && /Mobile Safari\/[0-9.]+/i.test(ua);
            const isIOSDevice = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
            const isIOSApp = isIOSDevice && !/CriOS/i.test(ua) && !/FxiOS/i.test(ua) && !/Safari\//i.test(ua);

            if (isSeongjisuhaengApp || hasAndroidWvToken || isAndroidWebViewUA || isIOSApp) {
                return "webview";
            }
            return null;
        };

        const responseData = {
            ip: targetIp,
            kakaoAccounts: kakaoAccounts || [],

            teacherName,
            studentName,
            grade,
            classNum,
            studentNumber,
            electives,

            isBlocked: !!blockEntry,
            blockReason: blockEntry?.reason || null,
            blockId: blockEntry?.id,

            modificationCount,
            printCount,
            downloadCount,
            isStandalone: Boolean(isStandalone === 1 || (recentEnvironments || []).some((e: any) => e.isApp)),
            appType: (isStandalone === 1 || (recentEnvironments || []).some((e: any) => e.isApp))
                ? ((recentEnvironments || []).some((e: any) => e.isApp) ? 'webview' : 'pwa')
                : detectServerAppType(latestUA),
            userAgent: latestUA || null,
            lastAccess,
            recentUserAgents,
            recentEnvironments,
            historicalEnvironments: (recentEnvironments || []).map((e: any) => ({
                os: e.os || '',
                deviceType: e.deviceType || '',
                browserKey: e.browserKey || 'other',
                isInApp: !!e.isInApp,
                isApp: !!e.isApp,
            })),

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
