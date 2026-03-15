
export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database configuration missing' }), { status: 500 });
    }

    try {
        const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('hide_past_assessments', 'restricted_grades', 'restriction_reason', 'ip_whitelist', 'kakao_login_restricted', 'kakao_restriction_reason', 'elective_group_overrides', 'maintenance_mode', 'elective_input_mode', 'elective_input_mode_grade2', 'elective_input_mode_grade3', 'bug_report_enabled', 'site_title', 'site_title_html', 'site_favicon_url', 'pwa_app_title', 'pwa_app_icon_url', 'allow_png_download', 'print_subject_font_size', 'allow_print_by_grade', 'samsung_install_button_visible', 'pwa_install_button_visible', 'show_target_class_main_menu', 'promotion_reset_days', 'assessment_distrust_threshold', 'assessment_positive_color', 'assessment_positive_ratio', 'assessment_negative_color', 'assessment_negative_ratio')").all();

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
            client_ip: clientIp,
            elective_input_mode: settings['elective_input_mode'] || 'auto',
            elective_input_mode_grade2: settings['elective_input_mode_grade2'] || settings['elective_input_mode'] || 'auto',
            elective_input_mode_grade3: settings['elective_input_mode_grade3'] || settings['elective_input_mode'] || 'auto',
            bug_report_enabled: settings['bug_report_enabled'] !== 'false', // default true
            site_title: settings['site_title'] || '',
            site_title_html: settings['site_title_html'] || '',
            site_favicon_url: settings['site_favicon_url'] || '',
            pwa_app_title: settings['pwa_app_title'] || '성지수행',
            pwa_app_icon_url: settings['pwa_app_icon_url'] || settings['site_favicon_url'] || '/icon.svg',
            allow_png_download: settings['allow_png_download'] !== 'false', // legacy
            allow_print_by_grade: settings['allow_print_by_grade'] ? JSON.parse(settings['allow_print_by_grade']) : [1, 2, 3],
            print_subject_font_size: settings['print_subject_font_size'] || 'large',
            samsung_install_button_visible: settings['samsung_install_button_visible'] !== 'false', // default true
            pwa_install_button_visible: settings['pwa_install_button_visible'] !== 'false', // default true
            show_target_class_main_menu: settings['show_target_class_main_menu'] !== 'false', // default true
            promotion_reset_days: settings['promotion_reset_days'] || '0',
            assessment_distrust_threshold: settings['assessment_distrust_threshold'] || '3',
            assessment_positive_color: settings['assessment_positive_color'] || '#22c55e',
            assessment_positive_ratio: settings['assessment_positive_ratio'] || '30',
            assessment_negative_color: settings['assessment_negative_color'] || '#9ca3af',
            assessment_negative_ratio: settings['assessment_negative_ratio'] || '40'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
