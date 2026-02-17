import { adminPassword } from "../../../../server/adminPW";

export const onRequestPost = async (context: any) => {
    try {
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
        const { kakaoId, title = "📅 수행평가 태스크", description = "관리자 알림" } = body;

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

        // 4. Create Task Function
        async function createTask(token: string) {
            try {
                // Task creation typically requires title.
                // Using v2 API if available, or finding the standard endpoint.
                // Based on standard Kakao API structure for tasks.

                // Note: If v2/create/task doesn't exist, this might fail, but we'll try the standard pattern.
                // Ref: https://kapi.kakao.com/v2/api/calendar/create/task

                const taskData = new URLSearchParams();
                taskData.append('task', JSON.stringify({
                    content: title, // 'title' in our app maps to 'content' in Kakao Task API
                }));

                const response = await fetch('https://kapi.kakao.com/v1/api/calendar/create/task', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: taskData
                });
                return response;
            } catch (e: any) {
                console.error("Kakao Task Fetch Error:", e);
                throw e;
            }
        }

        let response;
        try {
            response = await createTask(accessToken);
        } catch (e: any) {
            return new Response(JSON.stringify({ error: "Network Error sending to Kakao", details: e.message }), { status: 500 });
        }

        // 5. Handle Token Expiry
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
                    response = await createTask(accessToken);
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
            if (JSON.stringify(result).includes("scope")) {
                return new Response(JSON.stringify({ error: "Missing Scope: User needs 'talk_calendar_task' permission.", details: result }), { status: 403 });
            }
            return new Response(JSON.stringify({ error: `Kakao API Error: ${errorDetail}`, details: result }), { status: response.status });
        }

        return new Response(JSON.stringify({ success: true, result }), { status: 200 });

    } catch (globalError: any) {
        console.error("Global Error in task.ts:", globalError);
        return new Response(JSON.stringify({ error: "Internal Server Error", details: globalError.message }), { status: 500 });
    }
};
