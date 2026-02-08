interface Env {
    DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // DB 바인딩 확인 (없으면 패스)
    if (!env.DB) {
        return next();
    }

    // 1. IP 가져오기
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // 2. 카카오 사용자 정보 (쿠키에서 추출 시도)
    // 간단하게 구현: 쿠키 파싱
    const cookie = request.headers.get('Cookie') || '';
    let kakaoId = null;
    let kakaoNickname = null;

    // 실제로는 세션을 검증해야 하지만, 여기서는 로그 목적이므로
    // 클라이언트가 보내는 정보나 토큰을 신뢰하지 않고, 
    // 서버 사이드 세션 로직을 재구현하기 복잡하므로
    // 쿠키에 있는 세션 ID를 통해 DB에서 조회하는 것이 정확함.
    // 하지만 미들웨어 오버헤드를 줄이기 위해, 일단 IP 위주로 차단하고
    // 카카오 ID 차단은 로그인/API 요청 시 별도로 처리하거나
    // 여기서 DB 조회를 한 번 더 수행함.

    // 차단 여부 확인 (IP)
    try {
        const blockedIp = await env.DB.prepare(
            "SELECT id FROM blocked_users WHERE identifier = ? AND type = 'IP'"
        ).bind(ip).first();

        if (blockedIp) {
            return new Response("Access Denied (IP Blocked)", { status: 403 });
        }
    } catch (err) {
        // 테이블이 없거나 DB 오류 발생 시, 사이트 마비를 막기 위해 통과시킴
        console.error("Middleware Block Check Error:", err);
    }

    // 로그 기록 (비동기로 수행하여 응답 지연 최소화 - waitUntil 사용)
    const logRequest = async () => {
        try {
            await env.DB.prepare(
                "INSERT INTO access_logs (ip, kakaoId, kakaoNickname, endpoint, method) VALUES (?, ?, ?, ?, ?)"
            ).bind(ip, null, null, url.pathname, request.method).run();
        } catch (e) {
            console.error("Failed to log access:", e);
        }
    };

    context.waitUntil(logRequest());

    return next();
};
