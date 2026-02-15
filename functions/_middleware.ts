interface Env {
    DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // DB 바인딩 확인 (없으면 패스)
    if (!env.DB) {
        return next();
    }

    // 1. IP 가져오기
    // 로컬 환경에서는 CF-Connecting-IP 헤더가 없을 수 있으므로 127.0.0.1로 대체
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    // 2. 카카오 사용자 정보 (쿠키에서 추출)
    const cookieHeader = request.headers.get('Cookie') || '';
    let kakaoId = null;
    let kakaoNickname = null;

    if (cookieHeader) {
        const cookies: Record<string, string> = {};
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('='); // Re-join rest of the parts
                cookies[key] = value;
            }
        });

        if (cookies['kakao_id']) {
            kakaoId = cookies['kakao_id'];
        }

        if (cookies['kakao_nickname']) {
            try {
                kakaoNickname = decodeURIComponent(cookies['kakao_nickname']);
            } catch (e) {
                kakaoNickname = cookies['kakao_nickname'];
            }
        }
    }

    // 3. User-Agent 가져오기
    const userAgent = (request.headers.get('User-Agent') || '').substring(0, 500); // Too long UA safety

    // 차단 여부 확인 (IP)
    try {
        const blockedIp = await env.DB.prepare(
            "SELECT id FROM blocked_users WHERE identifier = ? AND type = 'IP'"
        ).bind(ip).first();

        if (blockedIp) {
            return new Response("Access Denied (IP Blocked)", { status: 403 });
        }
    } catch (err) {
        // 테이블이 없거나 DB 오류 발생 시, 사이트 마비를 막기 위해 통과시킴
        console.error("Middleware Block Check Error:", err);
    }

    // 4. Grade & Class info (from school_timetable_config cookie)
    let grade = null;
    let classNum = null;
    let studentNumber = null;
    if (cookieHeader) {
        const match = cookieHeader.match(/school_timetable_config=([^;]+)/);
        if (match) {
            try {
                const config = JSON.parse(decodeURIComponent(match[1]));
                if (config.grade) grade = config.grade;
                if (config.classNum) classNum = config.classNum;
                if (config.studentNumber) studentNumber = config.studentNumber;
            } catch (e) {
                // Ignore parse error
            }
        }
    }

    // 로그 기록 및 프로필 업데이트 (비동기로 수행)
    const logAndUpdateProfile = async () => {
        try {
            // 1. Log Access (Keep for history)
            try {
                await env.DB.prepare(
                    "INSERT INTO access_logs (ip, kakaoId, kakaoNickname, endpoint, method, userAgent, grade, classNum, studentNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(ip, kakaoId, kakaoNickname, url.pathname, request.method, userAgent, grade, classNum, studentNumber).run();
            } catch (e) {
                // Table might not exist yet, ignore or handle
            }

            // 2. Update Student Profile (if info exists)
            let studentProfileId = null;
            if (grade && classNum) {
                try {
                    // Start with basic insert
                    const stmt = `
                        INSERT INTO student_profiles (grade, classNum, studentNumber, updatedAt) 
                        VALUES (?, ?, ?, datetime('now'))
                        ON CONFLICT(grade, classNum, studentNumber) 
                        DO UPDATE SET updatedAt = datetime('now')
                        RETURNING id
                    `;
                    // D1 might not support RETURNING with ON CONFLICT DO UPDATE perfectly in all versions or via prepare wrapper depending on client,
                    // but let's try. If not, we select.
                    // Note: SQLite supports RETURNING since 3.35.0. Cloudflare D1 should support it.
                    let result = await env.DB.prepare(stmt).bind(grade, classNum, studentNumber).first();

                    if (!result) {
                        // If it existed and nothing changed? No, UPDATE happens so RETURNING should work.
                        // But if sqlite version is old or binding issue.
                        // Fallback: Select ID
                        result = await env.DB.prepare(
                            "SELECT id FROM student_profiles WHERE grade = ? AND classNum = ? AND (studentNumber = ? OR studentNumber IS NULL)"
                        ).bind(grade, classNum, studentNumber).first();
                    }
                    if (result) studentProfileId = result.id;

                } catch (e: any) {
                    // Use Fallback if INSERT...RETURNING fails or table missing
                    if (e.message?.includes("no such table")) {
                        // Table missing, skip profile update
                    }
                }
            }

            // 3. Update IP Profile
            try {
                // We need to upsert.
                // If studentProfileId is available, update it. If not, keep existing or null.
                // We also maintain modification count.

                // First check if exists
                const existing = await env.DB.prepare("SELECT modificationCount FROM ip_profiles WHERE ip = ?").bind(ip).first();

                let modCount = existing ? (existing.modificationCount as number) : 0;
                if (['POST', 'DELETE'].includes(request.method) && url.pathname.startsWith('/api/assessment')) {
                    modCount++;
                }

                // Construct Upsert Query
                let query = `
                    INSERT INTO ip_profiles (ip, student_profile_id, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent)
                    VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
                    ON CONFLICT(ip) DO UPDATE SET
                        lastAccess = datetime('now'),
                        userAgent = excluded.userAgent,
                        modificationCount = ?,
                        kakaoId = COALESCE(excluded.kakaoId, ip_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, ip_profiles.kakaoNickname)
                `;

                const binds: any[] = [ip, studentProfileId, kakaoId, kakaoNickname, modCount, userAgent, modCount];

                // If we found a new student profile, update the link.
                if (studentProfileId) {
                    query += `, student_profile_id = ?`;
                    binds.push(studentProfileId);
                }

                await env.DB.prepare(query).bind(...binds).run();

            } catch (e) {
                // Ignore if table missing
            }

        } catch (e) {
            console.error("Log/Profile Update Failed:", e);
        }
    };

    // 6. Hourly Auto-Cleanup & Daily Scheduler (Lazy Cron)
    const runBackgroundTasks = async () => {
        try {
            // A. Auto-Cleanup (Hourly)
            const lastCleanup = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'last_cleanup'").first('value');
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;

            if (!lastCleanup || (now - parseInt(lastCleanup as string)) > oneHour) {
                const { performCleanup } = await import('../server/performCleanup');
                const result = await performCleanup(env.DB);
                if (result.success) {
                    await env.DB.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('last_cleanup', ?)").bind(String(now)).run();
                    console.log("Auto-Cleanup executed");
                }
            }

            // B. Daily Scheduler (Notifications)
            const { runDailyChecks } = await import('../server/scheduler');
            await runDailyChecks(env);

        } catch (e) {
            console.error("Background Tasks Failed:", e);
        }
    };

    context.waitUntil(Promise.all([logAndUpdateProfile(), runBackgroundTasks()]));

    return next();
};
