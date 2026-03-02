
export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database configuration missing' }), { status: 500 });
    }

    try {
        const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('hide_past_assessments', 'restricted_grades', 'restriction_reason', 'ip_whitelist', 'kakao_login_restricted', 'kakao_restriction_reason', 'elective_group_overrides', 'maintenance_mode')").all();

        const settings: any = {};
        if (rows && rows.results) {
            rows.results.forEach((row: any) => {
                settings[row.key] = row.value;
            });
        }

        const hidePastValue = settings['hide_past_assessments'];
        const restrictedGrades = settings['restricted_grades'] ? JSON.parse(settings['restricted_grades']) : [];
        const restrictionReason = settings['restriction_reason'] || "현재 해당 학년은 서비스 이용이 제한되어 있습니다.";
        const ipWhitelist = settings['ip_whitelist'] ? JSON.parse(settings['ip_whitelist']) : [];
        const kakaoLoginRestricted = settings['kakao_login_restricted'] === 'true';
        const kakaoRestrictionReason = settings['kakao_restriction_reason'] || "현재 카카오 연동이 제한되어 있습니다.";
        const electiveGroupOverrides = settings['elective_group_overrides'] ? JSON.parse(settings['elective_group_overrides']) : {};
        const maintenanceMode = settings['maintenance_mode'] ? JSON.parse(settings['maintenance_mode']) : { active: false, endTime: null, message: "서버 안정화 작업" };

        // Check IP whitelist
        const clientIp = context.request.headers.get('CF-Connecting-IP') || 'unknown';
        const isWhitelisted = ipWhitelist.includes(clientIp);

        return new Response(JSON.stringify({
            hide_past_assessments: hidePastValue === 'true',
            restricted_grades: restrictedGrades,
            restriction_reason: restrictionReason,
            kakao_login_restricted: kakaoLoginRestricted,
            kakao_restriction_reason: kakaoRestrictionReason,
            elective_group_overrides: electiveGroupOverrides,
            maintenance_mode: maintenanceMode,
            is_whitelisted: isWhitelisted,
            client_ip: clientIp
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
