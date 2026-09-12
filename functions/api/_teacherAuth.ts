/**
 * Helper to normalize teacher name by stripping '선생님' suffix, trailing asterisks ('*'), and whitespace.
 */
export function normalizeTeacherName(name: string | null | undefined): string {
    if (!name) return '';
    return name.trim().replace(/선생님$/, '').replace(/\*+$/, '').trim();
}

/**
 * Helper to verify a teacher's password against system_settings in Cloudflare D1.
 */
export async function verifyTeacherPassword(
    env: any,
    teacherName: string | null | undefined,
    presentedPassword: string | null | undefined
): Promise<{ valid: boolean; trimmedName: string; cleanName: string; expectedPassword?: string }> {
    if (!env?.DB || !teacherName) {
        return { valid: false, trimmedName: '', cleanName: '' };
    }
    const trimmedName = teacherName.trim().replace(/선생님$/, '').trim();
    const cleanName = normalizeTeacherName(teacherName);
    if (!cleanName) {
        return { valid: false, trimmedName, cleanName };
    }

    // 개발자 교사 계정 ("김교사"): 인증 면제
    if (cleanName === '김교사') {
        return { valid: true, trimmedName, cleanName, expectedPassword: '' };
    }

    if (!presentedPassword || !presentedPassword.trim()) {
        return { valid: false, trimmedName, cleanName };
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

        // Fuzzy matching to handle differences like "김교사" vs "김교사*"
        let matchedPassword: string | undefined = pwMap[cleanName] ?? pwMap[trimmedName] ?? pwMap[cleanName + "*"];
        if (matchedPassword === undefined) {
            for (const [k, v] of Object.entries(pwMap)) {
                if (normalizeTeacherName(k) === cleanName) {
                    matchedPassword = v;
                    break;
                }
            }
        }

        const expected = matchedPassword ?? defaultPassword;
        return {
            valid: presentedPassword.trim() === expected,
            trimmedName,
            cleanName,
            expectedPassword: expected
        };
    } catch (e) {
        console.error("[verifyTeacherPassword] DB error:", e);
        return { valid: false, trimmedName, cleanName };
    }
}

