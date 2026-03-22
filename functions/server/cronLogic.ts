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

// 내일 날짜 계산
function getTomorrowDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Shared Cron execution logic for both _scheduled.ts and /api/cron/run
 * @param env Cloudflare environment bindings
 * @param isDailyTick boolean: false evaluates only cache, true evaluates entire notification sweep.
 */
export async function executeCronTasks(env: any, isDailyTick: boolean) {
    if (!env.DB) {
        console.error('Database not configured');
        throw new Error('Database not configured');
    }

    // --- 1. 시간표 캐시 갱신 (매 트리거마다 실행) ---
    try {
        const { refreshCache } = await import('../api/comcigan' as any);
        await refreshCache(env.DB, 1); // 1 = trigger global raw_data fetch
        console.log(`[Cron] Global timetable cache refreshed`);
    } catch (e) {
        console.error('[Cron] Timetable cache update failed:', e);
    }

    // --- 2. 카카오 알림 + DB 정리는 daily tick (1회/일) 에서만 실행 ---
    if (isDailyTick) {
        const tomorrowDate = getTomorrowDate();
        console.log('[Cron] Checking daily assessments for date:', tomorrowDate);

        try {
            // 2.1 RUN PREDICTION FIRST to ensure DB is accurate
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

            // 2.2 내일 수행평가가 있는 모든 항목 조회
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
            ).bind(tomorrowDate).all();

            console.log(`[Cron] Found ${assessments.length} assessments for tomorrow`);

            // 2.3 각 수행평가에 대해 카카오톡 전송
            for (const assessment of assessments) {
                try {
                    await sendKakaoMessage(assessment.kakaoAccessToken, assessment);
                    console.log(`[Cron] Notification sent for assessment ${assessment.id}`);
                } catch (error) {
                    console.error(`[Cron] Failed to send notification for assessment ${assessment.id}:`, error);
                }
            }

            // 2.4 데이터베이스 정리 (Auto Cleanup)
            try {
                const { performCleanup } = await import('../../server/performCleanup');
                const cleanupResult = await performCleanup(env.DB);
                console.log('[Cron] Database cleanup result:', cleanupResult);
            } catch (cleanupError) {
                console.error('[Cron] Database cleanup failed:', cleanupError);
            }
        } catch (error) {
            console.error('[Cron] Daily notification task error:', error);
            throw error;
        }
    }

    console.log('[Cron] Task sequence completed successfully');
}
