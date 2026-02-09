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
    // 로컬 환경에서는 CF-Connecting-IP 헤더가 없을 수 있으므로 127.0.0.1로 대체
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    // 2. 카카오 사용자 정보 (쿠키에서 추출)
    const cookieHeader = request.headers.get('Cookie') || '';
    let kakaoId = null;
    let kakaoNickname = null;

    if (cookieHeader) {
        const cookies: Record<string, string> = {};
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('='); // Re-join rest of the parts
                cookies[key] = value;
            }
        });

        if (cookies['kakao_id']) {
            kakaoId = cookies['kakao_id'];
        }

        if (cookies['kakao_nickname']) {
            try {
                kakaoNickname = decodeURIComponent(cookies['kakao_nickname']);
            } catch (e) {
                kakaoNickname = cookies['kakao_nickname'];
            }
        }
    }

    // 3. User-Agent 가져오기
    const userAgent = (request.headers.get('User-Agent') || '').substring(0, 500); // Too long UA safety

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
            // Try logging with method & userAgent (New Schema)
            await env.DB.prepare(
                "INSERT INTO access_logs (ip, kakaoId, kakaoNickname, endpoint, method, userAgent) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(ip, kakaoId, kakaoNickname, url.pathname, request.method, userAgent).run();
        } catch (e: any) {
            const errorMsg = e.message || "";

            // Case 1: Table does not exist -> Create and Retry
            if (errorMsg.includes("no such table")) {
                try {
                    // Create access_logs table
                    await env.DB.prepare(`
                        CREATE TABLE IF NOT EXISTS access_logs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            ip TEXT,
                            kakaoId TEXT,
                            kakaoNickname TEXT,
                            endpoint TEXT NOT NULL,
                            method TEXT,
                            userAgent TEXT,
                            accessedAt TEXT DEFAULT (datetime('now'))
                        )
                    `).run();

                    // Create blocked_users table (just in case)
                    await env.DB.prepare(`
                        CREATE TABLE IF NOT EXISTS blocked_users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            identifier TEXT NOT NULL,
                            type TEXT NOT NULL,
                            reason TEXT,
                            createdAt TEXT DEFAULT (datetime('now'))
                        )
                    `).run();

                    // Retry Log Insert
                    await env.DB.prepare(
                        "INSERT INTO access_logs (ip, kakaoId, kakaoNickname, endpoint, method, userAgent) VALUES (?, ?, ?, ?, ?, ?)"
                    ).bind(ip, kakaoId, kakaoNickname, url.pathname, request.method, userAgent).run();

                } catch (creationErr) {
                    console.error("Failed to create tables and retry log:", creationErr);
                }
            }
            // Case 2: Column "method" or "userAgent" missing -> Fallback & Auto-Migration
            else if (errorMsg.includes("no column") || errorMsg.includes("has no column")) {
                try {
                    // Attempt to add missing columns safely
                    await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN method TEXT").run().catch(() => { });
                    await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN userAgent TEXT").run().catch(() => { });

                    // Retry Insert
                    await env.DB.prepare(
                        "INSERT INTO access_logs (ip, kakaoId, kakaoNickname, endpoint, method, userAgent) VALUES (?, ?, ?, ?, ?, ?)"
                    ).bind(ip, kakaoId, kakaoNickname, url.pathname, request.method, userAgent).run();

                } catch (fallbackErr) {
                    console.error("Failed to log access (fallback):", fallbackErr);
                }
            }
            else {
                console.error("Failed to log access:", e);
            }
        }
    };

    context.waitUntil(logRequest());

    return next();
};
