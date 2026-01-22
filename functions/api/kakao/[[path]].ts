/**
 * Cloudflare Pages Function - 카카오 OAuth 인증
 */

const KAKAO_REST_API_KEY = 'bad8ca2530fb7a47eaf2e14ba1d2bb94'; // 사용자 제공 키
export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // Dynamic Redirect URI based on current origin
    const REDIRECT_URI = `${url.origin}/callback`;

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

    // 사용자 정보 조회
    if (path === '/api/kakao/me') {
        const cookieHeader = request.headers.get('Cookie') || '';
        const cookies = Object.fromEntries(
            cookieHeader.split(';')
                .map(c => c.trim().split('='))
                .filter(p => p.length === 2)
        );
        const token = cookies['kakao_token'];

        if (!token) {
            return new Response(JSON.stringify({ loggedIn: false }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        try {
            const userInfoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!userInfoResponse.ok) {
                return new Response(JSON.stringify({ loggedIn: false, error: 'Token might be expired' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const userInfo: any = await userInfoResponse.json();
            return new Response(JSON.stringify({
                loggedIn: true,
                id: userInfo.id,
                nickname: userInfo.properties?.nickname,
                profileImage: userInfo.properties?.profile_image,
                thumbnailImage: userInfo.properties?.thumbnail_image
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ loggedIn: false, error: 'Internal server error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response(`Not found: ${path}.`, { status: 404 });
}
