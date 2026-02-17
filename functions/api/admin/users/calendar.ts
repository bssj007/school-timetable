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
    const { kakaoId, title = "📅 수행평가 알림", description = "관리자가 보낸 알림입니다." } = body;

    if (!kakaoId) {
        return new Response(JSON.stringify({ error: "Missing kakaoId" }), { status: 400 });
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

    // 4. Create Event Function
    async function createCalendarEvent(token: string) {
        try {
            // Start 1 minute from now to ensure it's "future" but immediate
            const now = new Date();
            const start = new Date(now.getTime() + 60 * 1000); // +1 min
            const end = new Date(now.getTime() + 11 * 60 * 1000); // +11 mins (10 min duration)

            // Format to ISO string (UTC) is standard, Kakao usually accepts it or requires 'YYYY-MM-DDTHH:mm:ss' in Access Token User's timezone
            // Best to use simple ISO string and hope API handles it, or use `start_at`

            // NOTE: Kakao API params based on documentation
            // title, start_at, end_at, reminders, etc.

            const eventData = new URLSearchParams();
            eventData.append('event', JSON.stringify({
                title: title,
                time: {
                    start_at: start.toISOString(),
                    end_at: end.toISOString(),
                    time_zone: "Asia/Seoul",
                    all_day: false,
                },
                description: description,
                reminders: [1], // 1 minute before start (which is basically now)
                color: "RED"
            }));

            const response = await fetch('https://kapi.kakao.com/v2/api/calendar/create/event', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: eventData
            });
            return response;
        } catch (e: any) {
            console.error("Kakao Calendar Fetch Error:", e);
            throw e;
        }
    }

    let response;
    try {
        response = await createCalendarEvent(accessToken);
    } catch (e: any) {
        return new Response(JSON.stringify({ error: "Network Error sending to Kakao", details: e.message }), { status: 500 });
    }

    // 5. Handle Token Expiry (401) - Similar to notify.ts
    if (response.status === 401 && refreshToken) {
        console.log("Access token expired, refreshing...");
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
                const newRefreshToken = refreshData.refresh_token || refreshToken;
                await env.DB.prepare("UPDATE kakao_tokens SET accessToken = ?, refreshToken = ?, updatedAt = datetime('now') WHERE kakaoId = ?")
                    .bind(accessToken, newRefreshToken, kakaoId).run();

                // Retry
                response = await createCalendarEvent(accessToken);
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
        // Special handling for missing scope
        if (JSON.stringify(result).includes("scope")) {
            return new Response(JSON.stringify({ error: "Missing Scope: User needs 'talk_calendar' permission.", details: result }), { status: 403 });
        }
        return new Response(JSON.stringify({ error: `Kakao API Error: ${errorDetail}`, details: result }), { status: response.status });
    }

    return new Response(JSON.stringify({ success: true, result }), { status: 200 });
}
