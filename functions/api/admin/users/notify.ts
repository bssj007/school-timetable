import { adminPassword } from "../../../../server/adminPW";

export const onRequestPost = async (context: any) => {
    const { request, env } = context;

    // 1. Auth Check
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // 2. Parse Body
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }
    const { kakaoId, message } = body;

    if (!kakaoId || !message) {
        return new Response(JSON.stringify({ error: "Missing kakaoId or message" }), { status: 400 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "DB not configured" }), { status: 500 });
    }

    // 3. Get Token
    const tokenRecord = await env.DB.prepare("SELECT * FROM kakao_tokens WHERE kakaoId = ?").bind(kakaoId).first();

    if (!tokenRecord) {
        return new Response(JSON.stringify({ error: "User has not logged in with Kakao recently (No token found)" }), { status: 404 });
    }

    let accessToken = tokenRecord.accessToken;
    const refreshToken = tokenRecord.refreshToken;

    // 4. Send Message (Function to retry)
    async function sendKakaoMessage(token: string) {
        try {
            const response = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    template_object: JSON.stringify({
                        object_type: 'feed',
                        content: {
                            title: '📢 관리자 알림',
                            description: message,
                            image_url: 'https://school-timetable.pages.dev/android-chrome-192x192.png',
                            image_width: 640,
                            image_height: 640,
                            link: {
                                web_url: 'https://school-timetable.pages.dev',
                                mobile_web_url: 'https://school-timetable.pages.dev',
                            },
                        },
                        buttons: [
                            {
                                title: '바로가기',
                                link: {
                                    web_url: 'https://school-timetable.pages.dev',
                                    mobile_web_url: 'https://school-timetable.pages.dev',
                                },
                            },
                        ],
                    })
                })
            });
            return response;
        } catch (e: any) {
            console.error("Kakao Fetch Error:", e);
            throw e;
        }
    }

    let response;
    try {
        response = await sendKakaoMessage(accessToken);
    } catch (e: any) {
        return new Response(JSON.stringify({ error: "Network Error sending to Kakao", details: e.message }), { status: 500 });
    }

    // 5. Handle Token Expiry (401)
    if (response.status === 401 && refreshToken) {
        console.log("Access token expired, refreshing...");
        // Refresh Token
        try {
            const refreshResp = await fetch('https://kauth.kakao.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: 'bad8ca2530fb7a47eaf2e14ba1d2bb94', // REST API KEY
                    refresh_token: refreshToken
                })
            });

            const refreshData = await refreshResp.json();
            if (refreshData.access_token) {
                accessToken = refreshData.access_token;
                // Update DB
                const newRefreshToken = refreshData.refresh_token || refreshToken;
                await env.DB.prepare("UPDATE kakao_tokens SET accessToken = ?, refreshToken = ?, updatedAt = datetime('now') WHERE kakaoId = ?")
                    .bind(accessToken, newRefreshToken, kakaoId).run();

                // Retry sending
                response = await sendKakaoMessage(accessToken);
            } else {
                console.error("Failed to refresh token:", refreshData);
                // Return original error if refresh failed
            }
        } catch (refreshError) {
            console.error("Error during token refresh:", refreshError);
        }
    }

    const resultText = await response.text();
    let result;
    try {
        result = JSON.parse(resultText);
    } catch (e) {
        result = resultText;
    }

    if (!response.ok) {
        const errorDetail = result.msg || result.error_description || JSON.stringify(result);
        return new Response(JSON.stringify({ error: `Kakao API Error: ${errorDetail}`, details: result }), { status: response.status });
    }

    return new Response(JSON.stringify({ success: true, result }), { status: 200 });
}
