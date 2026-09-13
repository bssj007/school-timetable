// functions/api/notifications/vapid-public-key.ts
import { DEFAULT_VAPID_PUBLIC_KEY } from "../../lib/webPush";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
    }

    const publicKey = env?.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

    return new Response(JSON.stringify({
        publicKey
    }), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400"
        }
    });
};
