export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const body = await request.json().catch(() => ({}));
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

        const trimmedName = teacherName.trim().replace(/선생님$/, '').trim();
        const trimmedNewPw = newPassword.trim();
        const trimmedCurrentPw = typeof currentPassword === 'string' ? currentPassword.trim() : '';

        // Read system_settings table
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        const rows = await env.DB.prepare(
            "SELECT key, value FROM system_settings WHERE key IN ('teacher_passwords', 'teacher_default_password')"
        ).all();

        let defaultPassword = "관리";
        let pwMap: Record<string, string> = {};

        if (rows && rows.results) {
            for (const r of rows.results as any[]) {
                if (r.key === 'teacher_default_password' && r.value) {
                    defaultPassword = r.value;
                }
                if (r.key === 'teacher_passwords' && r.value) {
                    try {
                        pwMap = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
                    } catch {
                        pwMap = {};
                    }
                }
            }
        }

        // Check current password if provided
        const correctCurrent = pwMap[trimmedName] || defaultPassword;
        if (trimmedCurrentPw && trimmedCurrentPw !== correctCurrent) {
            return new Response(JSON.stringify({ error: "현재 비밀번호가 일치하지 않습니다." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Update password in pwMap
        pwMap[trimmedName] = trimmedNewPw;

        await env.DB.prepare(
            "INSERT INTO system_settings (key, value) VALUES ('teacher_passwords', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(JSON.stringify(pwMap)).run();

        return new Response(JSON.stringify({
            success: true,
            message: `"${trimmedName}" 선생님의 비밀번호가 성공적으로 변경되었습니다.`
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        console.error("Teacher password update error:", e);
        return new Response(JSON.stringify({ error: e.message || "비밀번호 변경 처리 중 오류가 발생했습니다." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
