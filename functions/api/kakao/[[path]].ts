/**
 * Cloudflare Pages Function - 카카오 OAuth 인증
 */

const KAKAO_REST_API_KEY = 'bad8ca2530fb7a47eaf2e14ba1d2bb94'; // 사용자 제공 키
const REDIRECT_URI = 'https://school-timetable.pages.dev/api/kakao/callback';

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // 로그인 시작
    if (path === '/api/kakao/login') {
        const redirectUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${REDIRECT_URI}&response_type=code`;

        return new Response(null, {
            status: 302,
            headers: {
                'Location': redirectUrl
            }
        });
    }

    // 콜백 처리
    if (path === '/api/kakao/callback') {
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
                return new Response('Failed to get access token', { status: 500 });
            }

            // 사용자 정보 조회
            const userInfoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`
                }
            });

            const userInfo = await userInfoResponse.json();
            console.log('User info:', userInfo);

            // DB에 저장 (간단히 세션 쿠키로 전달)
            const userData = {
                kakaoId: userInfo.id,
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                nickname: userInfo.properties?.nickname || '사용자'
            };

            // 클라이언트로 리다이렉트 (토큰 전달)
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': `/?kakao=success&kakaoId=${userInfo.id}`,
                    'Set-Cookie': `kakao_token=${tokenData.access_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=21600`
                }
            });

        } catch (error: any) {
            console.error('Kakao auth error:', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    }

    return new Response('Not found', { status: 404 });
}
