// 카카오톡 메시지 전송 함수
async function sendKakaoMessage(accessToken: string, assessment: any) {
    const message = {
        object_type: 'text',
        text: `📝 내일 수행평가 알림!\n\n과목: ${assessment.subject}\n내용: ${assessment.title}\n날짜: ${assessment.dueDate}\n교시: ${assessment.classTime}교시\n\n열심히 준비하세요! 화이팅 💪`,
        link: {
            web_url: 'https://school-timetable.pages.dev',
            mobile_web_url: 'https://school-timetable.pages.dev'
        }
    };

    try {
        const response = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${accessToken}`
            },
            body: new URLSearchParams({
                template_object: JSON.stringify(message)
            })
        });

        const result = await response.json();
        console.log('Kakao message sent:', result);
        return result;
    } catch (error) {
        console.error('Failed to send Kakao message:', error);
        throw error;
    }
}

/**
 * Shared Cron execution logic for both _scheduled.ts and /api/cron/run
 * @param env Cloudflare environment bindings
 */
export async function executeCronTasks(env: any) {
    if (!env.DB) {
        console.error('Database not configured');
        throw new Error('Database not configured');
    }

    // --- 1. 시간표 캐시 갱신 (매 5분 트리거마다 항상 실행) ---
    try {
        const { refreshCache } = await import('../api/comcigan' as any);
        await refreshCache(env.DB, 1); // 1 = trigger global raw_data fetch
        console.log(`[Cron] Global timetable cache refreshed`);
    } catch (e) {
        console.error('[Cron] Timetable cache update failed:', e);
    }

    // --- 2. 자동 예측(Auto Predict) 갱신 (매 5분 트리거마다 항상 실행) ---
    try {
        const { applyAutoPredictions } = await import('./autoPredict' as any);
        const { results: allActive } = await env.DB.prepare("SELECT * FROM performance_assessments WHERE isDone = 0 AND isDeleted = 0").all();
        if (allActive && allActive.length > 0) {
            await applyAutoPredictions(allActive, env.DB);
            console.log(`[Cron] Auto-predictions checked for ${allActive.length} active assessments.`);
        }
    } catch (predErr) {
        console.error("[Cron] Failed to apply auto-predictions:", predErr);
    }

    // --- 3. 카카오 알림 + DB 정리 (하루 1번 조건부 실행) ---
    try {
        // 시간에 구애받지 않고 KST 기준으로 작동하도록 Date 연산
        const now = new Date();
        const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC to KST
        const kstHour = kstNow.getUTCHours(); // getUTCHours on a +9 offset Date yields KST hour
        const kstDateString = kstNow.toISOString().split('T')[0];
        
        // KST 기준 내일 날짜 (24시간 뒤)
        const kstTomorrow = new Date(kstNow.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowDateString = kstTomorrow.toISOString().split('T')[0];

        // system_settings 테이블에서 마지막으로 데일리 알림을 보낸 날짜 조회
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT)").run();
        const lastRunRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'last_daily_cron_date'").first();
        const lastDailyCronDate = lastRunRow ? lastRunRow.value : '';

        // 만약 아침 9시가 넘었고(>= 9) 오늘치 데일리 스윕을 안했다면 실행!
        if (kstHour >= 9 && lastDailyCronDate !== kstDateString) {
            console.log(`[Cron] Initiating daily sweep (Kakao + Cleanup) targeting tomorrow: ${tomorrowDateString}`);

            // DB 업데이트: 오늘치 스윕을 한다고 즉시 도장찍어 중복실행(Race condition 등) 방지
            await env.DB.prepare(
                "INSERT INTO system_settings (key, value) VALUES ('last_daily_cron_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            ).bind(kstDateString).run();

            // 3.1 내일 수행평가가 있는 모든 항목 조회
            const { results: assessments } = await env.DB.prepare(
                `SELECT 
                    pa.*,
                    u.kakaoAccessToken,
                    u.notificationEnabled
                FROM performance_assessments pa
                JOIN users u ON pa.userId = u.id
                WHERE COALESCE(pa.tempDueDate, pa.dueDate) = ?
                AND pa.isDone = 0
                AND pa.isDeleted = 0
                AND u.notificationEnabled = 1
                AND u.kakaoAccessToken IS NOT NULL`
            ).bind(tomorrowDateString).all();

            console.log(`[Cron] Found ${assessments.length} assessments for tomorrow`);

            // 3.2 각 수행평가에 대해 카카오톡 전송
            for (const assessment of assessments) {
                try {
                    await sendKakaoMessage(assessment.kakaoAccessToken, assessment);
                    console.log(`[Cron] Notification sent for assessment ${assessment.id}`);
                } catch (error) {
                    console.error(`[Cron] Failed to send notification for assessment ${assessment.id}:`, error);
                }
            }
        } else {
            // 조건 미달 시 그냥 넘어감
            console.log(`[Cron] Daily sweep skipped. (KST Hour: ${kstHour}, last sent: ${lastDailyCronDate})`);
        }

        // --- 4. 데이터베이스 정리 (매 1시간마다 조건부 실행) ---
        // system_settings 에서 'auto_db_cleanup_hourly_enabled' 값이 'true'일 때만 작동
        const cleanupOptionRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'auto_db_cleanup_hourly_enabled'").first();
        const isHourlyCleanupEnabled = cleanupOptionRow?.value === 'true';

        if (isHourlyCleanupEnabled) {
            const kstYMDH = kstNow.toISOString().substring(0, 13); // 예: '2026-03-23T09'
            const lastCleanupRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'last_hourly_cleanup_date'").first();
            const lastHourlyCleanup = lastCleanupRow ? lastCleanupRow.value : '';

            if (lastHourlyCleanup !== kstYMDH) {
                console.log(`[Cron] Initiating hourly DB cleanup for hour: ${kstYMDH}`);
                
                await env.DB.prepare(
                    "INSERT INTO system_settings (key, value) VALUES ('last_hourly_cleanup_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                ).bind(kstYMDH).run();

                try {
                    const { performCleanup } = await import('../../server/performCleanup');
                    const cleanupResult = await performCleanup(env.DB);
                    console.log('[Cron] Database cleanup result:', cleanupResult);
                } catch (cleanupError) {
                    console.error('[Cron] Database cleanup failed:', cleanupError);
                }
            }
        }
    } catch (error) {
        console.error('[Cron] Daily/Hourly notification block error:', error);
        throw error;
    }

    console.log('[Cron] Task sequence completed successfully');
}
