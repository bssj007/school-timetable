import { users, notificationLogs, kakaoTokens } from '../drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export async function runDailyChecks(env: any) {
    if (!env.DB) return;
    const db = drizzle(env.DB);

    const todayDate = new Date().toISOString().split('T')[0];

    // 1. Check if ran today
    const existingLog = await db.select().from(notificationLogs)
        .where(and(
            eq(notificationLogs.type, 'DAILY_REMINDER'),
            eq(notificationLogs.targetDate, todayDate),
            eq(notificationLogs.status, 'SUCCESS')
        )).get();

    if (existingLog) return; // Already ran

    console.log("[Scheduler] Running daily checks for:", todayDate);

    // 2. Find Assessments Due Tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    // Raw SQL for performance/simplicity in D1
    const { results: assessments } = await env.DB.prepare(
        "SELECT * FROM performance_assessments WHERE dueDate = ?"
    ).bind(tomorrowStr).all();

    if (!assessments || assessments.length === 0) {
        console.log("[Scheduler] No assessments due tomorrow.");
        await logRun(db, todayDate, 'SUCCESS', 'No assessments due');
        return;
    }

    // Group by Grade/Class
    const tasksByClass: Record<string, any[]> = {};
    assessments.forEach((task: any) => {
        const key = `${task.grade}-${task.classNum}`;
        if (!tasksByClass[key]) tasksByClass[key] = [];
        tasksByClass[key].push(task);
    });

    // 3. Send Notifications
    let sentCount = 0;

    for (const [classKey, tasks] of Object.entries(tasksByClass)) {
        const [grade, classNum] = classKey.split('-').map(Number);

        // Find subscribers
        // Join users with kakao_tokens to ensure we have a token
        const { results: subscribers } = await env.DB.prepare(`
            SELECT u.id, u.name, k.accessToken, k.refreshToken, k.kakaoId
            FROM users u
            JOIN kakao_tokens k ON u.openId = k.kakaoId -- Assuming openId IS kakaoId for Kakao Logins
            WHERE u.grade = ? AND u.class = ?
        `).bind(grade, classNum).all();

        if (!subscribers || subscribers.length === 0) continue;

        const message = `[내일 수행평가 알림]\n\n` + tasks.map((t: any) => `- ${t.subject}: ${t.title}`).join('\n');

        for (const sub of subscribers) {
            await sendKakaoMessage(sub, message, env);
            sentCount++;
        }
    }

    await logRun(db, todayDate, 'SUCCESS', `Sent ${sentCount} reminders`);
}

async function logRun(db: any, date: string, status: string, msg: string) {
    await db.insert(notificationLogs).values({
        type: 'DAILY_REMINDER',
        targetDate: date,
        status: status,
        message: msg
    }).run();
}

async function sendKakaoMessage(user: any, text: string, env: any) {
    // Basic send logic (same as notify.ts but simplified/shared)
    // For brevity, using the same logic. Ideally extract to shared utils.
    let token = user.accessToken;

    // Try sending
    let response = await fetchMessage(token, text);

    // If expired, refresh
    if (response.status === 401 && user.refreshToken) {
        const newToken = await refreshToken(user.refreshToken);
        if (newToken) {
            token = newToken.access_token;
            // Update DB
            await env.DB.prepare("UPDATE kakao_tokens SET accessToken = ?, refreshToken = ? WHERE kakaoId = ?")
                .bind(token, newToken.refresh_token || user.refreshToken, user.kakaoId).run();
            // Retry
            response = await fetchMessage(token, text);
        }
    }
}

async function fetchMessage(token: string, text: string) {
    return await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            template_object: JSON.stringify({
                object_type: 'text',
                text: text,
                link: {
                    web_url: 'https://school-timetable.pages.dev',
                    mobile_web_url: 'https://school-timetable.pages.dev',
                },
                button_title: '확인하기'
            })
        })
    });
}

async function refreshToken(refreshToken: string) {
    try {
        const resp = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: 'bad8ca2530fb7a47eaf2e14ba1d2bb94',
                refresh_token: refreshToken
            })
        });
        const data = await resp.json();
        return data.access_token ? data : null;
    } catch (e) { return null; }
}
