
import { adminPassword } from "../../../server/adminPW";
import { parseUA } from "../../_uaDetect";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const rawTargetIp = url.searchParams.get("ip") || "";
    const targetIp = rawTargetIp.trim();
    const lowerTargetIp = targetIp.toLowerCase();
    const cleanIpv4 = targetIp.replace(/^::ffff:/i, '').toLowerCase();

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

    // IP 매칭 SQL 조건문 & 바인드 파라미터
    // 원본 IP, 소문자화 IP, IPv6-mapped IPv4 제거 IP, TRIM된 IP 등 모든 형태 커버
    const ipMatchSql = "(ip = ? OR LOWER(TRIM(ip)) = ? OR LOWER(TRIM(ip)) = ?)";
    const ipMatchBinds = [targetIp, lowerTargetIp, cleanIpv4];

    const queryErrors: Record<string, string> = {};

    try {
        // 2. Fetch Data — each query independently fail-safe
        // A. Block Status
        let blockEntry: any = null;
        try {
            blockEntry = await env.DB.prepare(
                `SELECT * FROM blocked_users WHERE (identifier = ? OR LOWER(TRIM(identifier)) = ?) AND type = 'IP'`
            ).bind(targetIp, lowerTargetIp).first();
        } catch (e: any) { queryErrors.blockStatus = e?.message; }

        // B. Modification Count
        let modificationCount = 0;
        try {
            const r: any = await env.DB.prepare(
                `SELECT COUNT(*) as count FROM performance_assessments WHERE (lastModifiedIp = ? OR LOWER(TRIM(lastModifiedIp)) = ? OR LOWER(TRIM(lastModifiedIp)) = ?)`
            ).bind(targetIp, lowerTargetIp, cleanIpv4).first();
            modificationCount = r?.count || 0;
        } catch (e: any) { queryErrors.modCount = e?.message; }

        // C. Last Access (MAX — cheap, indexed by value comparator)
        let lastAccess: string | null = null;
        try {
            const r: any = await env.DB.prepare(
                `SELECT MAX(accessedAt) as lastAccess FROM access_logs WHERE ${ipMatchSql}`
            ).bind(...ipMatchBinds).first();
            lastAccess = r?.lastAccess || null;
        } catch (e: any) { queryErrors.lastAccess = e?.message; }

        // D. Linked Kakao Accounts (Distinct)
        let kakaoAccounts: any[] = [];
        try {
            const { results } = await env.DB.prepare(
                `SELECT DISTINCT kakaoId, kakaoNickname FROM access_logs WHERE ${ipMatchSql} AND kakaoId IS NOT NULL`
            ).bind(...ipMatchBinds).all();
            kakaoAccounts = results || [];
        } catch (e: any) { queryErrors.kakaoAccounts = e?.message; }

        // E. Detailed Assessments (Top 50)
        let recentAssessments: any[] = [];
        try {
            const { results } = await env.DB.prepare(
                `SELECT id, subject, title, grade, classNum, dueDate, createdAt FROM performance_assessments WHERE (lastModifiedIp = ? OR LOWER(TRIM(lastModifiedIp)) = ? OR LOWER(TRIM(lastModifiedIp)) = ?) ORDER BY id DESC LIMIT 50`
            ).bind(targetIp, lowerTargetIp, cleanIpv4).all();
            recentAssessments = results || [];
        } catch (e: any) { queryErrors.assessments = e?.message; }

        // F. Detailed Logs (최근 500건으로 제한)
        let recentLogs: any[] = [];
        let totalLogCount = 0;
        try {
            const countResult: any = await env.DB.prepare(
                `SELECT COUNT(*) as cnt FROM access_logs WHERE ${ipMatchSql}`
            ).bind(...ipMatchBinds).first();
            totalLogCount = countResult?.cnt || 0;
        } catch (e: any) {
            queryErrors.logCount = e?.message;
            console.warn('[ip_profile] log count query failed:', e?.message);
        }

        try {
            const { results } = await env.DB.prepare(
                `SELECT * FROM access_logs WHERE ${ipMatchSql} ORDER BY accessedAt DESC LIMIT 500`
            ).bind(...ipMatchBinds).all();
            recentLogs = results || [];
        } catch (e: any) {
            queryErrors.recentLogs = e?.message;
            console.warn('[ip_profile] recentLogs query failed:', e?.message);
        }

        // G. Recent Environments — 최신순, ua parse 컬럼 포함 (최대 15개)
        let recentEnvironments: any[] = [];
        let recentUserAgents: string[] = [];
        try {
            const { results: envRows } = await env.DB.prepare(
                `SELECT userAgent, browserKey, deviceType, os, isInApp, accessedAt
                 FROM access_logs
                 WHERE ${ipMatchSql} AND userAgent IS NOT NULL
                 ORDER BY accessedAt DESC
                 LIMIT 15`
            ).bind(...ipMatchBinds).all();

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
                    `SELECT DISTINCT userAgent FROM access_logs WHERE ${ipMatchSql} AND userAgent IS NOT NULL ORDER BY accessedAt DESC LIMIT 10`
                ).bind(...ipMatchBinds).all();
                recentUserAgents = uas?.map((r: any) => r.userAgent) || [];
                recentEnvironments = recentUserAgents.map(ua => ({ userAgent: ua, browserKey: null, deviceType: null, os: null, isInApp: false, accessedAt: null }));
            } catch (e: any) { queryErrors.environments = e?.message; }
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
            WHERE (ip.ip = ? OR LOWER(TRIM(ip.ip)) = ? OR LOWER(TRIM(ip.ip)) = ?)
        `).bind(targetIp, lowerTargetIp, cleanIpv4).first().catch(() => null);

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
                `SELECT grade, classNum, studentNumber FROM access_logs WHERE ${ipMatchSql} AND grade IS NOT NULL AND classNum IS NOT NULL ORDER BY accessedAt DESC LIMIT 1`
            ).bind(...ipMatchBinds).first().catch(() => null);
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
                `SELECT printCount, downloadCount, isStandalone, teacherName FROM ip_profiles WHERE (ip = ? OR LOWER(TRIM(ip)) = ? OR LOWER(TRIM(ip)) = ?)`
            ).bind(targetIp, lowerTargetIp, cleanIpv4).first();
            printCount = ipProfileRowResult?.printCount || 0;
            downloadCount = ipProfileRowResult?.downloadCount || 0;
            isStandalone = ipProfileRowResult?.isStandalone || 0;
            teacherName = ipProfileRowResult?.teacherName || null;
        } catch (e: any) {
            if (e.message && (e.message.includes("no such column") || e.message.includes("has no column named") || e.message.includes("no column named"))) {
                console.log("[Admin API] Schema mismatch for printCount/downloadCount. Running safe ALTER TABLE...");
                try { await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN printCount INTEGER DEFAULT 0").run(); } catch (_) { }
                try { await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN downloadCount INTEGER DEFAULT 0").run(); } catch (_) { }
                try { await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN isStandalone INTEGER DEFAULT 0").run(); } catch (_) { }
                try { await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN teacherName TEXT").run(); } catch (_) { }
            } else {
                queryErrors.ipProfiles = e?.message;
            }
        }

        // teacherName fallback: access_logs에서 가장 최근 teacherName 조회
        if (!teacherName) {
            try {
                const logTeacher: any = await env.DB.prepare(
                    `SELECT teacherName FROM access_logs WHERE ${ipMatchSql} AND teacherName IS NOT NULL AND teacherName != '' ORDER BY accessedAt DESC LIMIT 1`
                ).bind(...ipMatchBinds).first().catch(() => null);
                if (logTeacher?.teacherName) teacherName = logTeacher.teacherName;
            } catch (_) {}
        }

        // K. 연관 학생/선생님의 다른 IP 및 로그 현황 조회 (다중 기기 접속 지원)
        let relatedStudentLogsCount = 0;
        let relatedOtherIps: string[] = [];
        try {
            if (grade && classNum && studentNumber) {
                // 동일 학번의 전체 로그 수
                const relCnt: any = await env.DB.prepare(
                    "SELECT COUNT(*) as cnt FROM access_logs WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(String(grade), String(classNum), String(studentNumber)).first();
                relatedStudentLogsCount = relCnt?.cnt || 0;

                // 동일 학번으로 접속한 다른 IP 목록
                const { results: relIps } = await env.DB.prepare(
                    `SELECT DISTINCT ip FROM access_logs WHERE grade = ? AND classNum = ? AND studentNumber = ? AND NOT ${ipMatchSql} LIMIT 5`
                ).bind(String(grade), String(classNum), String(studentNumber), ...ipMatchBinds).all();
                relatedOtherIps = (relIps || []).map((r: any) => r.ip);
            } else if (teacherName) {
                const relCnt: any = await env.DB.prepare(
                    "SELECT COUNT(*) as cnt FROM access_logs WHERE teacherName = ?"
                ).bind(teacherName).first();
                relatedStudentLogsCount = relCnt?.cnt || 0;

                const { results: relIps } = await env.DB.prepare(
                    `SELECT DISTINCT ip FROM access_logs WHERE teacherName = ? AND NOT ${ipMatchSql} LIMIT 5`
                ).bind(teacherName, ...ipMatchBinds).all();
                relatedOtherIps = (relIps || []).map((r: any) => r.ip);
            }
        } catch (e: any) {
            queryErrors.relatedLogs = e?.message;
        }

        // L. 진단 정보 (전체 DB 내 access_logs 상태 확인)
        let _totalAccessLogsCount = 0;
        let _sampleIps: string[] = [];
        let _recentLogSamples: any[] = [];
        try {
            const totalResult: any = await env.DB.prepare("SELECT COUNT(*) as cnt FROM access_logs").first();
            _totalAccessLogsCount = totalResult?.cnt || 0;
        } catch (e: any) { queryErrors.totalAccessLogs = e?.message; }

        try {
            const { results: sampleRows } = await env.DB.prepare(
                "SELECT DISTINCT ip FROM access_logs ORDER BY id DESC LIMIT 10"
            ).all();
            _sampleIps = (sampleRows || []).map((r: any) => r.ip);
        } catch (_) {}

        try {
            const { results: recentRows } = await env.DB.prepare(
                "SELECT id, ip, endpoint, method, accessedAt FROM access_logs ORDER BY id DESC LIMIT 3"
            ).all();
            _recentLogSamples = recentRows || [];
        } catch (_) {}

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
            const isAndroidWebViewUA = !/GSA\//i.test(ua) &&
                !/SamsungBrowser|Whale|OPR|OPT|Opera|EdgA|Firefox|FxiOS/i.test(ua) &&
                /Version\/[0-9.]+/i.test(ua) && /Chrome\/[0-9.]+/i.test(ua) && /Mobile Safari\/[0-9.]+/i.test(ua);
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
            totalLogCount, // total logs for this IP (may exceed the 500-record limit above)

            // 연관 학생/선생님 접속 정보
            relatedStudentLogsCount,
            relatedOtherIps,

            // 진단 필드 — 프론트엔드 및 디버깅용
            _debug: {
                queriedIp: targetIp,
                normalizedIp: lowerTargetIp,
                totalAccessLogsInDb: _totalAccessLogsCount,
                sampleIpsInAccessLogs: _sampleIps,
                recentLogSamples: _recentLogSamples,
                matchedLogCount: totalLogCount,
                relatedStudentLogsCount,
                queryErrors: Object.keys(queryErrors).length > 0 ? queryErrors : undefined,
            },

            detailsLoaded: true // Flag to indicate full data
        };

        return new Response(JSON.stringify(responseData), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message, queryErrors }), { status: 500 });
    }
}

