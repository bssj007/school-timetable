/**
 * Cloudflare Workers Scheduled Event
 * 매일 아침 9시에 내일 수행평가가 있는 사용자에게 카카오톡 알림 전송
 */

interface ScheduledEvent {
    scheduledTime: number;
    cron: string;
}

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

export default {
    async scheduled(event: ScheduledEvent, env: any, ctx: any) {
        console.log('Scheduled event triggered:', event.cron);

        if (!env.DB) {
            console.error('Database not configured');
            return;
        }

        const tomorrowDate = getTomorrowDate();
        console.log('Checking assessments for date:', tomorrowDate);

        try {
            // 내일 수행평가가 있는 모든 항목 조회
            const { results: assessments } = await env.DB.prepare(
                `SELECT 
                    pa.*,
                    u.kakaoAccessToken,
                    u.notificationEnabled
                FROM performance_assessments pa
                JOIN users u ON pa.userId = u.id
                WHERE pa.dueDate = ?
                AND pa.isDone = 0
                AND u.notificationEnabled = 1
                AND u.kakaoAccessToken IS NOT NULL`
            ).bind(tomorrowDate).all();

            console.log(`Found ${assessments.length} assessments for tomorrow`);

            // 각 수행평가에 대해 카카오톡 전송
            for (const assessment of assessments) {
                try {
                    await sendKakaoMessage(assessment.kakaoAccessToken, assessment);
                    console.log(`Notification sent for assessment ${assessment.id}`);
                } catch (error) {
                    console.error(`Failed to send notification for assessment ${assessment.id}:`, error);
                    // 토큰 만료 시 재발급 로직 필요 (추후 구현)
                }
            }

            console.log('Scheduled task completed successfully');
        } catch (error) {
            console.error('Scheduled task error:', error);
        }
    }
};
