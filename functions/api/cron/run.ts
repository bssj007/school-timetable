import { adminPassword as envAdminPassword } from "../../../server/adminPW";
import { executeCronTasks } from "../../server/cronLogic";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    
    // Parse URL and extract token parameter for authorization
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace('Bearer ', '');
    
    // Validate the token against the backend admin password
    if (token !== envAdminPassword) {
        return new Response(JSON.stringify({ error: 'Unauthorized. Invalid token provided.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Determine the scope of the cron execution ('daily' triggers notification sweep and DB cleanup) 
    const action = url.searchParams.get('action');
    const isDailyTick = (action === 'daily');

    try {
        await executeCronTasks(env, isDailyTick);
        return new Response(JSON.stringify({ success: true, message: `Cron task executed via Webhook (isDailyTick: ${isDailyTick})` }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
