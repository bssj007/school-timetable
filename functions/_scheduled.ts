/**
 * Cloudflare Workers Scheduled Event
 * 매일 아침 9시에 내일 수행평가가 있는 사용자에게 카카오톡 알림 전송
 */

interface ScheduledEvent {
    scheduledTime: number;
    cron: string;
}

export default {
    async scheduled(event: ScheduledEvent, env: any, ctx: any) {
        console.log('[Native Cron] Scheduled event triggered:', event.cron);

        const hour = new Date(event.scheduledTime).getUTCHours();
        const isDailyTick = (hour === 0); // UTC 0시 = KST 9시

        try {
            const { executeCronTasks } = await import('./server/cronLogic');
            await executeCronTasks(env, isDailyTick);
            console.log('[Native Cron] Task sequence completed successfully');
        } catch (error) {
            console.error('[Native Cron] Scheduled task failed:', error);
        }
    }
};
