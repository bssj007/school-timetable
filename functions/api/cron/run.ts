import { adminPassword as envAdminPassword } from "../../../server/adminPW";
import { executeCronTasks } from "../../server/cronLogic";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    
    // Parse URL and extract token parameter for authorization
    const url = new URL(request.url);
    let bodyToken = null;
    
    if (request.method === 'POST') {
        try {
            // Attempt to parse JSON body if provided
            const body = await request.clone().json();
            if (body && body.token) bodyToken = body.token;
        } catch (e) {
            // Ignore non-JSON bodies
        }
    }

    const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace('Bearer ', '') || bodyToken;
    
    // Validate the token against the backend admin password
    if (token !== envAdminPassword) {
        return new Response(JSON.stringify({ error: 'Unauthorized. Invalid token provided.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        await executeCronTasks(env);
        return new Response(JSON.stringify({ success: true, message: `Cron task executed via Webhook` }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
