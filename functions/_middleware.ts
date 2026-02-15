interface Env {
    DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 1. Log Access
    const response = await next();

    // 비동기로 로그 저장 및 프로필 업데이트 (응답 시간을 늦추지 않음)
    const logAndUpdateProfile = async () => {
        try {
            if (!env.DB) return;

            const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
            const userAgent = request.headers.get('User-Agent') || '';
            const cookies = request.headers.get('Cookie') || '';

            // Parse Cookies
            let grade = null, classNum = null, studentNumber = null;
            let kakaoId = null, kakaoNickname = null;

            if (cookies) {
                const configMatch = cookies.match(new RegExp('(^| )school_timetable_config=([^;]+)'));
                if (configMatch) {
                    try {
                        const config = JSON.parse(decodeURIComponent(configMatch[2]));
                        grade = config.grade;
                        classNum = config.classNum;
                        studentNumber = config.studentNumber;
                    } catch (e) { }
                }

                const kakaoMatch = cookies.match(new RegExp('(^| )kakao_user_data=([^;]+)'));
                if (kakaoMatch) {
                    try {
                        const kakaoData = JSON.parse(decodeURIComponent(kakaoMatch[2]));
                        kakaoId = kakaoData.id?.toString();
                        kakaoNickname = kakaoData.nickname;
                    } catch (e) { }
                }
            }

            // 1. Insert Log
            await env.DB.prepare(
                "INSERT INTO access_logs (ip, userAgent, method, endpoint, status, grade, classNum, studentNumber, kakaoId, kakaoNickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(ip, userAgent, request.method, url.pathname, response.status, grade, classNum, studentNumber, kakaoId, kakaoNickname).run();


            // 2. Dynamic Profile Creation (Simplified Schema: student_id)
            let studentId: number | null = null;
            if (grade && classNum && studentNumber) {
                try {
                    const g = parseInt(grade);
                    const c = parseInt(classNum);
                    const n = parseInt(studentNumber);

                    if (!isNaN(g) && !isNaN(c) && !isNaN(n)) {
                        /* 4-digit ID: G C NN (e.g. 1 1 02 -> 1102) */
                        const idStr = `${g}${c}${n.toString().padStart(2, '0')}`;
                        studentId = parseInt(idStr);

                        // Upsert Student Profile
                        await env.DB.prepare(`
                            INSERT INTO student_profiles (student_id, updatedAt) 
                            VALUES (?, datetime('now'))
                            ON CONFLICT(student_id) 
                            DO UPDATE SET updatedAt = datetime('now')
                        `).bind(studentId).run();
                    }
                } catch (e) {
                    // Parse error
                }
            }

            // 3. Update IP Profile
            try {
                // Upsert ip_profiles
                const existing = await env.DB.prepare("SELECT modificationCount FROM ip_profiles WHERE ip = ?").bind(ip).first();
                let modCount = existing ? (existing.modificationCount as number) : 0;

                if (['POST', 'DELETE'].includes(request.method) && url.pathname.startsWith('/api/assessment')) {
                    modCount++;
                }

                // Construct Upsert Query
                let query = `
                    INSERT INTO ip_profiles (ip, student_id, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent)
                    VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
                    ON CONFLICT(ip) DO UPDATE SET
                        lastAccess = datetime('now'),
                        userAgent = excluded.userAgent,
                        modificationCount = ?,
                        kakaoId = COALESCE(excluded.kakaoId, ip_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, ip_profiles.kakaoNickname)
                `;

                const binds: any[] = [ip, studentId, kakaoId, kakaoNickname, modCount, userAgent, modCount];

                // Only update student_id IF we identified one. If not, don't overwrite existing link with null? 
                // Wait, if user logs out or clears cookies, studentId is null. 
                // Should we unlink? Probably not. An IP is usually associated with a student.
                // Keeping history is better. So only update if studentId is truthy.
                if (studentId) {
                    query += `, student_id = ?`;
                    binds.push(studentId);
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

    return response;
};
