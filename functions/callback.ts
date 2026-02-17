/**
 * Cloudflare Pages Function - Kakao Auth Callback
 * Handles the redirect from Kakao Login
 */

const KAKAO_REST_API_KEY = 'bad8ca2530fb7a47eaf2e14ba1d2bb94'; // 사용자 제공 키

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);

    // Dynamic Redirect URI based on the current request origin
    // This allows it to work on both production and preview deployments (e.g. *-8ln)
    const REDIRECT_URI = `${url.origin}/callback`;

    const code = url.searchParams.get('code');

    if (!code) {
        return new Response('Authorization code not found', { status: 400 });
    }

    try {
        // 토큰 요청
        const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: KAKAO_REST_API_KEY,
                redirect_uri: REDIRECT_URI,
                code: code
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error('Token error:', tokenData);
            return new Response(`Failed to get access token: ${JSON.stringify(tokenData)}`, { status: 500 });
        }

        // 사용자 정보 조회
        const userInfoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });

        const userInfo = await userInfoResponse.json();
        console.log('User info:', userInfo);

        // DB에 토큰 저장 (Upsert)
        try {
            await env.DB.prepare(
                `INSERT INTO kakao_tokens (kakaoId, accessToken, refreshToken, updatedAt) 
                 VALUES (?, ?, ?, datetime('now'))
                 ON CONFLICT(kakaoId) DO UPDATE SET 
                 accessToken = excluded.accessToken,
                 refreshToken = COALESCE(excluded.refreshToken, kakao_tokens.refreshToken),
                 updatedAt = datetime('now')`
            ).bind(
                userInfo.id.toString(),
                tokenData.access_token,
                tokenData.refresh_token || null
            ).run();
        } catch (dbError) {
            console.error('Failed to store Kakao token:', dbError);
            // Continue even if DB save fails, to allow login to proceed
        }

        const nickname = userInfo.properties?.nickname || userInfo.kakao_account?.profile?.nickname || '사용자';

        // Prepare headers with multiple cookies
        // Prepare headers with multiple cookies
        const headers = new Headers();
        headers.set('Location', `/?kakao=success&kakaoId=${userInfo.id}`);
        headers.append('Set-Cookie', `kakao_token=${tokenData.access_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600`);

        // _middleware.ts에서 사용하는 kakao_user_data 쿠키 설정 (JSON string)
        const userData = {
            id: userInfo.id,
            nickname: nickname,
            profileImage: userInfo.properties?.profile_image || userInfo.kakao_account?.profile?.profile_image_url,
            thumbnailImage: userInfo.properties?.thumbnail_image || userInfo.kakao_account?.profile?.thumbnail_image_url
        };
        headers.append('Set-Cookie', `kakao_user_data=${encodeURIComponent(JSON.stringify(userData))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600`);

        // 클라이언트로 리다이렉트 (토큰 전달)
        return new Response(null, {
            status: 302,
            headers: headers
        });

    } catch (error: any) {
        console.error('Kakao auth error:', error);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}
