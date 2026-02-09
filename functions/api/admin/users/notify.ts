import { adminPassword } from "../../../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // 1. Auth Check
    const password = request.headers.get("X-Admin-Password");
    if (password !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const { ip, kakaoId, message } = await request.json();

        if (!kakaoId || !message) {
            return new Response(JSON.stringify({ error: "Missing kakaoId or message" }), { status: 400 });
        }

        // 2. Get Access Token from DB
        const tokenEntry = await env.DB.prepare(
            "SELECT accessToken FROM kakao_tokens WHERE kakaoId = ?"
        ).bind(kakaoId).first();

        if (!tokenEntry || !tokenEntry.accessToken) {
            return new Response(JSON.stringify({ error: "No access token found for this user. The user must log in again." }), { status: 404 });
        }

        // 3. Send Message via Kakao API
        // "나에게 보내기" API (Memo) - Sends message to the user's own KakaoTalk
        // Template: Default Text
        const response = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${tokenEntry.accessToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                template_object: JSON.stringify({
                    object_type: "text",
                    text: `[관리자 알림]\n${message}`,
                    link: {
                        web_url: "https://school-timetable.pages.dev",
                        mobile_web_url: "https://school-timetable.pages.dev",
                    },
                    button_title: "바로가기"
                })
            })
        });

        const result: any = await response.json();

        if (!response.ok || result.result_code !== 0) {
            console.error("Kakao API Error:", result);
            return new Response(JSON.stringify({
                error: "Failed to send message to Kakao API",
                details: result
            }), { status: 500 });
        }

        return new Response(JSON.stringify({ success: true, result }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
