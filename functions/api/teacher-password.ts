import { verifyTeacherPassword } from "./_teacherAuth";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    if (request.method !== "POST" && request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" }
        });
    }

    const url = new URL(request.url);

    // ── GET: 현재 비밀번호 조회 (인증 필수) ──────────────────────────
    if (request.method === "GET") {
        try {
            const teacherName = (url.searchParams.get("name") || "").trim();
            const presentedPw = request.headers.get("X-Teacher-Password") || url.searchParams.get("password") || "";

            if (!teacherName) {
                return new Response(JSON.stringify({ error: "선생님 이름을 지정해야 합니다." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const { valid, trimmedName, expectedPassword } = await verifyTeacherPassword(env, teacherName, presentedPw);
            if (!valid) {
                return new Response(JSON.stringify({
                    error: "선생님 인증이 필요하거나 비밀번호가 일치하지 않습니다.",
                    code: "TEACHER_AUTH_REQUIRED"
                }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({ success: true, teacherName: trimmedName, password: expectedPassword }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message || "오류 발생" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    // ── POST 처리: 검증 (action=verify) 또는 변경 ─────────────────────
    try {
        const body = await request.json().catch(() => ({}));
        const action = url.searchParams.get("action") || body.action;

        // 1. 비밀번호 실시간 검증 (인증 팝업 및 마운트 시 자동 검증)
        if (action === "verify") {
            const teacherName = (body.teacherName || "").trim();
            const password = typeof body.password === "string" ? body.password : "";

            if (!teacherName) {
                return new Response(JSON.stringify({ error: "선생님 이름을 지정해야 합니다." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const { valid, trimmedName } = await verifyTeacherPassword(env, teacherName, password);
            if (!valid) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "비밀번호가 올바르지 않거나 변경되었습니다.",
                    code: "INVALID_PASSWORD"
                }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({
                success: true,
                verified: true,
                teacherName: trimmedName
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 2. 비밀번호 변경
        const { teacherName, currentPassword, newPassword } = body;

        if (!teacherName || typeof teacherName !== 'string' || !teacherName.trim()) {
            return new Response(JSON.stringify({ error: "선생님 이름을 지정해야 합니다." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
            return new Response(JSON.stringify({ error: "새 비밀번호를 입력해주세요." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 현재 비밀번호 검증 필수
        const { valid, trimmedName } = await verifyTeacherPassword(env, teacherName, currentPassword);
        if (!valid) {
            return new Response(JSON.stringify({
                error: "현재 비밀번호가 일치하지 않거나 변경되었습니다.",
                code: "INVALID_PASSWORD"
            }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        const trimmedNewPw = newPassword.trim();

        // system_settings 테이블에서 pwMap 읽기
        const rows = await env.DB.prepare(
            "SELECT key, value FROM system_settings WHERE key = 'teacher_passwords'"
        ).first();

        let pwMap: Record<string, string> = {};
        if (rows && rows.value) {
            try {
                pwMap = typeof rows.value === 'string' ? JSON.parse(rows.value) : rows.value;
            } catch {
                pwMap = {};
            }
        }

        // Update password in pwMap
        pwMap[trimmedName] = trimmedNewPw;

        await env.DB.prepare(
            "INSERT INTO system_settings (key, value) VALUES ('teacher_passwords', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(JSON.stringify(pwMap)).run();

        return new Response(JSON.stringify({
            success: true,
            message: `"${trimmedName}" 선생님의 비밀번호가 성공적으로 변경되었습니다.`,
            teacherName: trimmedName
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        console.error("Teacher password update error:", e);
        return new Response(JSON.stringify({ error: e.message || "비밀번호 처리 중 오류가 발생했습니다." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
