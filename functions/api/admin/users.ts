import { adminPassword } from "../../../server/adminPW";
import { ensureAllTables } from "../../db_schema";
import { parseUA } from "../../_uaDetect";

interface AssessmentStats {
    adds: number;
    deletes: number;
    edits: number;
    totalMods: number;
}

async function resolveRealAssessmentStats(db: any): Promise<Map<string, AssessmentStats>> {
    const statsMap = new Map<string, AssessmentStats>();

    // 1. access_logs 집계
    try {
        const { results: logResults } = await db.prepare(`
            SELECT 
                ip,
                COUNT(CASE WHEN method = 'POST' AND (endpoint = '/api/assessment' OR endpoint = '/api/assessment/') AND (status IS NULL OR (status >= 200 AND status < 300)) THEN 1 END) as logAdds,
                COUNT(CASE WHEN method = 'DELETE' AND endpoint LIKE '/api/assessment%' AND (status IS NULL OR (status >= 200 AND status < 300)) THEN 1 END) as logDels,
                COUNT(CASE WHEN method IN ('PUT', 'PATCH') AND endpoint LIKE '/api/assessment%' AND endpoint NOT LIKE '%action=vote%' AND (status IS NULL OR (status >= 200 AND status < 300)) THEN 1 END) as logEdits
            FROM access_logs
            WHERE endpoint LIKE '/api/assessment%'
            GROUP BY ip
        `).all();

        for (const row of (logResults || [])) {
            if (!row.ip) continue;
            const ip = row.ip.trim();
            statsMap.set(ip, {
                adds: Number(row.logAdds) || 0,
                deletes: Number(row.logDels) || 0,
                edits: Number(row.logEdits) || 0,
                totalMods: (Number(row.logAdds) || 0) + (Number(row.logDels) || 0) + (Number(row.logEdits) || 0),
            });
        }
    } catch (e: any) {
        console.warn('[Admin Users] Failed to aggregate assessment stats from access_logs:', e?.message);
    }

    // 2. performance_assessments 실존 데이터 집계 (보완)
    try {
        const { results: paResults } = await db.prepare(`
            SELECT 
                lastModifiedIp as ip,
                COUNT(CASE WHEN (isDeleted IS NULL OR isDeleted = 0) AND (isAutoPredicted IS NULL OR isAutoPredicted = 0) THEN 1 END) as activeCount,
                COUNT(CASE WHEN isDeleted = 1 THEN 1 END) as deletedCount
            FROM performance_assessments
            WHERE lastModifiedIp IS NOT NULL AND lastModifiedIp != ''
            GROUP BY lastModifiedIp
        `).all();

        for (const row of (paResults || [])) {
            if (!row.ip) continue;
            const ip = row.ip.trim();
            const existing = statsMap.get(ip) || { adds: 0, deletes: 0, edits: 0, totalMods: 0 };
            const effectiveAdds = Math.max(existing.adds, Number(row.activeCount) || 0);
            const effectiveDels = Math.max(existing.deletes, Number(row.deletedCount) || 0);
            const effectiveTotal = effectiveAdds + effectiveDels + existing.edits;
            statsMap.set(ip, {
                adds: effectiveAdds,
                deletes: effectiveDels,
                edits: existing.edits,
                totalMods: effectiveTotal,
            });
        }
    } catch (e: any) {
        console.warn('[Admin Users] Failed to aggregate assessment stats from performance_assessments:', e?.message);
    }

    return statsMap;
}

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

            // 어드민 경로는 _middleware에서 SKIP되므로 직접 테이블 자동 생성
            await ensureAllTables(env.DB);
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
                    COALESCE(student_profiles.instructionDismissed, ip_profiles.instructionDismissed) as instructionDismissed,
                    ip_profiles.printCount,
                    ip_profiles.downloadCount,
                    ip_profiles.isStandalone,
                    ip_profiles.modificationCount,
                    ip_profiles.addCount,
                    ip_profiles.deleteCount,
                    ip_profiles.browserKey,
                    ip_profiles.deviceType,
                    ip_profiles.os,
                    ip_profiles.isInApp,
                    ip_profiles.teacherName,
                    ip_profiles.isBetaTester,
                    ip_profiles.betaTesterSince,
                    student_profiles.name as profileName,
                    student_profiles.grade as profileGrade,
                    student_profiles.classNum as profileClassNum,
                    student_profiles.studentNumber as profileStudentNumber,
                    student_profiles.electives as rawElectives
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
                } else if (e.message && (e.message.includes("no such column") || e.message.includes("has no column named") || e.message.includes("no column named"))) {
                    console.log("[Admin API] Schema mismatch. Running safe ALTER TABLE...");
                    const alters = [
                        "ALTER TABLE ip_profiles ADD COLUMN printCount INTEGER DEFAULT 0",
                        "ALTER TABLE ip_profiles ADD COLUMN downloadCount INTEGER DEFAULT 0",
                        "ALTER TABLE ip_profiles ADD COLUMN addCount INTEGER DEFAULT 0",
                        "ALTER TABLE ip_profiles ADD COLUMN deleteCount INTEGER DEFAULT 0",
                        "ALTER TABLE ip_profiles ADD COLUMN isStandalone INTEGER DEFAULT 0",
                        "ALTER TABLE ip_profiles ADD COLUMN browserKey TEXT",
                        "ALTER TABLE ip_profiles ADD COLUMN deviceType TEXT",
                        "ALTER TABLE ip_profiles ADD COLUMN os TEXT",
                        "ALTER TABLE ip_profiles ADD COLUMN isInApp INTEGER DEFAULT 0",
                        "ALTER TABLE ip_profiles ADD COLUMN teacherName TEXT",
                        "ALTER TABLE ip_profiles ADD COLUMN isBetaTester INTEGER DEFAULT 0",
                        "ALTER TABLE ip_profiles ADD COLUMN betaTesterSince TEXT",
                        "ALTER TABLE student_profiles ADD COLUMN name TEXT NOT NULL DEFAULT ''",
                    ];
                    for (const sql of alters) {
                        try { await env.DB.prepare(sql).run(); } catch (_) {}
                    }
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
            const detectServerAppType = (userAgent: string | null | undefined): "webview" | "pwa" | null => {
                if (!userAgent) return null;
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
            // 4. IP별 과거 접속환경 조회 (access_logs에서 distinct userAgent 조회하여 파싱)
            //    - endpoint는 GROUP BY에서 제거 (endpoint 수 × ip 수만큼 행 폭발 방지)
            //    - 90일 이내 + LIMIT 5000 으로 Worker CPU 한계 초과 방지
            let envMap: Record<string, { os: string; deviceType: string; browserKey: string; isInApp: boolean; isApp: boolean; userAgent: string; lastAccess: string }[]> = {};
            let pwaIpMap = new Map<string, string>(); // PWA 엔드포인트 접속 기록이 있는 IP 및 최신 접속 시각
            try {
                const envQuery = `
                    SELECT ip, userAgent, MAX(accessedAt) as lastAccess
                    FROM access_logs
                    WHERE accessedAt > datetime('now', '-90 days')
                      AND userAgent IS NOT NULL
                      AND userAgent != ''
                    GROUP BY ip, userAgent
                    ORDER BY lastAccess DESC
                    LIMIT 5000
                `;
                const { results: envResults } = await env.DB.prepare(envQuery).all();
                for (const row of envResults as any[]) {
                    if (!row.ip) continue;
                    const parsed = parseUA(row.userAgent);
                    if (!parsed.os && !parsed.deviceType && !parsed.browserKey) continue;
                    if (!envMap[row.ip]) envMap[row.ip] = [];
                    envMap[row.ip].push({
                        os: parsed.os || '',
                        deviceType: parsed.deviceType || '',
                        browserKey: parsed.browserKey || 'other',
                        isInApp: parsed.isInApp,
                        isApp: parsed.isApp,
                        userAgent: row.userAgent,
                        lastAccess: row.lastAccess || '',
                    });
                }

                // PWA 엔드포인트 접속 기록 IP 별도 조회
                const pwaQuery = `
                    SELECT ip, MAX(accessedAt) as lastAccess
                    FROM access_logs
                    WHERE accessedAt > datetime('now', '-90 days')
                      AND (endpoint LIKE '%mode=pwa%' OR endpoint LIKE '%standalone=1%' OR endpoint LIKE '%utm_source=homescreen%')
                    GROUP BY ip
                    LIMIT 2000
                `;
                const { results: pwaResults } = await env.DB.prepare(pwaQuery).all();
                for (const row of pwaResults as any[]) {
                    if (row.ip) pwaIpMap.set(row.ip, row.lastAccess || '');
                }
            } catch (e: any) {
                console.warn('[Admin Users] Historical environments query failed:', e.message);
            }

            const realStatsMap = await resolveRealAssessmentStats(env.DB);
            const syncStatements: any[] = [];

            const activeUsers = profiles.map((p: any) => {
                const parsedLatestUA = parseUA(p.userAgent);
                const os = p.os || parsedLatestUA.os || null;
                const browserKey = p.browserKey || parsedLatestUA.browserKey || null;
                const deviceType = p.deviceType || parsedLatestUA.deviceType || null;
                const isInApp = p.isInApp === 1 || parsedLatestUA.isInApp;

                let userEnvs = [...(envMap[p.ip] || [])];

                // 최신 접속 UA 및 lastAccess가 userEnvs에 없거나 갱신 필요한 경우 보정
                if (p.userAgent) {
                    const existingIndex = userEnvs.findIndex(e => e.userAgent === p.userAgent);
                    if (existingIndex >= 0) {
                        if (p.lastAccess && (!userEnvs[existingIndex].lastAccess || p.lastAccess > userEnvs[existingIndex].lastAccess)) {
                            userEnvs[existingIndex].lastAccess = p.lastAccess;
                        }
                    } else {
                        userEnvs.unshift({
                            os: parsedLatestUA.os || '',
                            deviceType: parsedLatestUA.deviceType || '',
                            browserKey: parsedLatestUA.browserKey || 'other',
                            isInApp: parsedLatestUA.isInApp,
                            isApp: parsedLatestUA.isApp,
                            userAgent: p.userAgent,
                            lastAccess: p.lastAccess || '',
                        });
                    }
                } else if (userEnvs.length === 0 && (os || browserKey || parsedLatestUA.os || parsedLatestUA.browserKey)) {
                    userEnvs = [{
                        os: os || parsedLatestUA.os || '',
                        deviceType: deviceType || parsedLatestUA.deviceType || '',
                        browserKey: browserKey || parsedLatestUA.browserKey || 'other',
                        isInApp: isInApp,
                        isApp: p.isStandalone === 1,
                        userAgent: '',
                        lastAccess: p.lastAccess || '',
                    }];
                }

                // PWA 엔드포인트 접속 이력 반영
                const pwaLastAccess = pwaIpMap.get(p.ip);
                if (pwaLastAccess && !userEnvs.some(e => e.browserKey === 'pwa')) {
                    userEnvs.push({
                        os: parsedLatestUA.os || '',
                        deviceType: 'mobile',
                        browserKey: 'pwa',
                        isInApp: false,
                        isApp: true,
                        userAgent: '',
                        lastAccess: pwaLastAccess,
                    });
                }

                // 과거 로그 및 ip_profiles 누적값을 통틀어 앱 접속 기록 확인
                const isDbStandalone = p.isStandalone === 1;
                const hasAppInLogs = userEnvs.some(e => e.isApp);
                const hasAppEver = isDbStandalone || hasAppInLogs;

                // p.isStandalone이 1인데 userEnvs에 app 엔트리가 없다면 앱 환경 추가
                if (hasAppEver && !userEnvs.some(e => e.isApp)) {
                    userEnvs.push({
                        os: os || '',
                        deviceType: deviceType || 'mobile',
                        browserKey: 'pwa',
                        isInApp: false,
                        isApp: true,
                        userAgent: '',
                        lastAccess: p.lastAccess || '',
                    });
                }

                // 최신 접속 순 정렬
                userEnvs.sort((a, b) => (b.lastAccess || '').localeCompare(a.lastAccess || ''));

                const appType = (userEnvs.some(e => e.isApp && e.browserKey !== 'pwa') || detectServerAppType(p.userAgent))
                    ? "webview"
                    : (hasAppEver ? "pwa" : null);

                // 실데이터 기반 검증된 정확한 수행평가 통계
                const stats = realStatsMap.get(p.ip) || { adds: 0, deletes: 0, edits: 0, totalMods: 0 };
                const curAdd = Number(p.addCount) || 0;
                const curDel = Number(p.deleteCount) || 0;
                const curMod = Number(p.modificationCount) || 0;

                // 기존 오염 수치와 불일치 시 DB 자동 보정 대기열 등록
                if (curAdd !== stats.adds || curDel !== stats.deletes || curMod !== stats.totalMods) {
                    syncStatements.push(
                        env.DB.prepare(
                            "UPDATE ip_profiles SET addCount = ?, deleteCount = ?, modificationCount = ? WHERE ip = ?"
                        ).bind(stats.adds, stats.deletes, stats.totalMods, p.ip)
                    );
                }

                const profile = {
                    clientId: p.ip,
                    ip: p.ip,
                    kakaoAccounts: p.kakaoId ? [{ kakaoId: p.kakaoId, kakaoNickname: p.kakaoNickname || '(알 수 없음)' }] : [],
                    isBlocked: false,
                    blockReason: null,
                    modificationCount: stats.totalMods,
                    addCount: stats.adds,
                    deleteCount: stats.deletes,
                    printCount: p.printCount || 0,
                    downloadCount: p.downloadCount || 0,
                    isStandalone: hasAppEver,
                    lastAccess: p.lastAccess,
                    userAgent: p.userAgent || null,
                    appType,
                    recentUserAgents: p.userAgent ? [p.userAgent] : [],
                    browserKey,
                    deviceType,
                    os,
                    isInApp,
                    teacherName: p.teacherName || null,
                    studentName: p.profileName || null,
                    grade: p.profileGrade || null,
                    classNum: p.profileClassNum || null,
                    studentNumber: p.profileStudentNumber || null,
                    hasElectives: !!p.rawElectives && p.rawElectives !== '{}' && p.rawElectives !== 'null',
                    instructionDismissed: !!p.instructionDismissed,
                    isBetaTester: p.isBetaTester === 1,
                    betaTesterSince: p.betaTesterSince || null,
                    historicalEnvironments: userEnvs,
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

            // 오염된 ip_profiles 자동 보정 일괄 실행
            if (syncStatements.length > 0) {
                try {
                    for (let i = 0; i < syncStatements.length; i += 100) {
                        await env.DB.batch(syncStatements.slice(i, i + 100));
                    }
                } catch (syncErr: any) {
                    console.warn('[Admin Users] Auto-sync ip_profiles batch failed:', syncErr?.message);
                }
            }

            return new Response(JSON.stringify({
                activeUsers,
                blockedUsers
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'POST') {
            const url = new URL(request.url);
            const queryAction = url.searchParams.get('action');

            let body: any = {};
            try { body = await request.json(); } catch (_) {}

            // 전체 수행평가 횟수 재정비 (Recalibrate) 액션
            if (queryAction === 'recalibrate' || body.action === 'recalibrate') {
                const statsMap = await resolveRealAssessmentStats(env.DB);
                const { results: allIps } = await env.DB.prepare("SELECT ip, addCount, deleteCount, modificationCount FROM ip_profiles").all();

                const updateStatements = [];
                let changedCount = 0;
                for (const row of (allIps || [])) {
                    if (!row.ip) continue;
                    const s = statsMap.get(row.ip) || { adds: 0, deletes: 0, edits: 0, totalMods: 0 };
                    const curAdd = Number(row.addCount) || 0;
                    const curDel = Number(row.deleteCount) || 0;
                    const curMod = Number(row.modificationCount) || 0;

                    if (curAdd !== s.adds || curDel !== s.deletes || curMod !== s.totalMods) {
                        changedCount++;
                        updateStatements.push(
                            env.DB.prepare("UPDATE ip_profiles SET addCount = ?, deleteCount = ?, modificationCount = ? WHERE ip = ?")
                                .bind(s.adds, s.deletes, s.totalMods, row.ip)
                        );
                    }
                }

                if (updateStatements.length > 0) {
                    for (let i = 0; i < updateStatements.length; i += 100) {
                        await env.DB.batch(updateStatements.slice(i, i + 100));
                    }
                }

                return new Response(JSON.stringify({ 
                    success: true, 
                    message: `전체 ${allIps?.length || 0}개 IP 중 ${changedCount}개의 오염된 카운트가 성공적으로 재정비되었습니다.`,
                    changedCount 
                }), { headers: { 'Content-Type': 'application/json' } });
            }

            // Block a user/IP
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
            const body = await request.json();
            
            // 1. IP별 로그 삭제 요청인 경우
            const rawIps = Array.isArray(body?.ips) ? body.ips : (body?.ip ? [body.ip] : null);
            if (rawIps && rawIps.length > 0) {
                const ips: string[] = rawIps.filter(Boolean).map((ip: any) => String(ip).trim()).filter((ip: string) => ip.length > 0);
                const statements = [];
                for (const ip of ips) {
                    const cleanIpv4 = ip.replace(/^::ffff:/i, '');
                    statements.push(
                        env.DB.prepare("DELETE FROM access_logs WHERE ip = ? OR LOWER(TRIM(ip)) = ? OR LOWER(TRIM(ip)) = ?")
                            .bind(ip, ip.toLowerCase(), cleanIpv4.toLowerCase())
                    );
                    statements.push(
                        env.DB.prepare("DELETE FROM ip_profiles WHERE ip = ? OR LOWER(TRIM(ip)) = ? OR LOWER(TRIM(ip)) = ?")
                            .bind(ip, ip.toLowerCase(), cleanIpv4.toLowerCase())
                    );
                }
                for (let i = 0; i < statements.length; i += 100) {
                    await env.DB.batch(statements.slice(i, i + 100));
                }
                return new Response(JSON.stringify({ success: true, deletedIps: ips }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 2. 차단 해제 (Unblock)
            const { id } = body;
            if (!id) return new Response("Missing ID or IPs", { status: 400 });

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
