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

    return new Response(`Not found: ${path}.`, { status: 404 });
}
