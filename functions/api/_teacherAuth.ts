/**
 * Helper to verify a teacher's password against system_settings in Cloudflare D1.
 */
export async function verifyTeacherPassword(
    env: any,
    teacherName: string | null | undefined,
    presentedPassword: string | null | undefined
): Promise<{ valid: boolean; trimmedName: string; expectedPassword?: string }> {
    if (!env?.DB || !teacherName || !presentedPassword) {
        return { valid: false, trimmedName: '' };
    }
    const trimmedName = teacherName.trim().replace(/선생님$/, '').trim();
    if (!trimmedName || !presentedPassword.trim()) {
        return { valid: false, trimmedName };
    }

    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        const rows = await env.DB.prepare(
            "SELECT key, value FROM system_settings WHERE key IN ('teacher_passwords', 'teacher_default_password')"
        ).all();

        let defaultPassword = "sj2026";
        let pwMap: Record<string, string> = {};

        if (rows && rows.results) {
            for (const r of rows.results as any[]) {
                if (r.key === 'teacher_default_password' && r.value) {
                    defaultPassword = r.value === '관리' ? 'sj2026' : r.value;
                    if (r.value === '관리') {
                        try {
                            await env.DB.prepare("UPDATE system_settings SET value = 'sj2026' WHERE key = 'teacher_default_password'").run();
                        } catch (_) {}
                    }
                }
                if (r.key === 'teacher_passwords' && r.value) {
                    try { pwMap = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch { pwMap = {}; }
                }
            }
        }

        const expected = pwMap[trimmedName] ?? defaultPassword;
        return {
            valid: presentedPassword.trim() === expected,
            trimmedName,
            expectedPassword: expected
        };
    } catch (e) {
        console.error("[verifyTeacherPassword] DB error:", e);
        return { valid: false, trimmedName };
    }
}
