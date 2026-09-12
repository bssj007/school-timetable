
import { resolveEnvBindingInfo } from "../../_testEnv";

export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database configuration missing' }), { status: 500 });
    }

    try {
        const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('hide_past_assessments', 'restricted_grades', 'restriction_reason', 'ip_whitelist', 'kakao_login_restricted', 'kakao_restriction_reason', 'elective_group_overrides', 'maintenance_mode', 'elective_input_mode', 'elective_input_mode_grade2', 'elective_input_mode_grade3', 'bug_report_enabled', 'site_title', 'site_title_html', 'site_favicon_url', 'pwa_app_title', 'pwa_app_icon_url', 'allow_png_download', 'print_subject_font_size', 'allow_print_by_grade', 'samsung_install_button_visible', 'pwa_install_button_visible', 'chrome_install_button_visible', 'safari_install_button_visible', 'other_install_button_visible', 'play_store_url', 'app_store_url', 'show_target_class_main_menu', 'promotion_popup_enabled', 'promotion_reset_days', 'assessment_distrust_threshold', 'assessment_positive_color', 'assessment_positive_ratio', 'assessment_negative_color', 'assessment_negative_ratio', 'assessment_timetable_color', 'changed_class_tint_color', 'changed_class_tint_opacity', 'comcigan_debug_overlay_enabled', 'comcigan_debug_whitelist', 'access_debug_mode_enabled', 'access_debug_ip_list', 'special_schedules', 'special_schedules_enabled', 'meal_lunch_cutoff_hour', 'meal_rating_enabled', 'meal_emphasis_enabled', 'teacher_ignore_keywords', 'semester_key', 'assessment_allow_student_grade1', 'assessment_allow_student_grade2', 'assessment_allow_student_grade3', 'assessment_allow_teacher_grade1', 'assessment_allow_teacher_grade2', 'assessment_allow_teacher_grade3', 'assessment_disallow_msg_student', 'assessment_disallow_msg_teacher', 'teacher_default_password', 'teacher_auth_expire_days', 'teacher_passwords', 'active_teachers', 'maintenance_bypass_chrome', 'maintenance_bypass_samsung', 'maintenance_bypass_safari', 'maintenance_bypass_other', 'maintenance_bypass_pwa_app', 'maintenance_bypass_webview_app', 'beta_testing_enabled', 'beta_pumasi_button_visible', 'beta_tester_force_ips', 'dev_account_enabled', 'dev_student_grade', 'dev_student_class', 'dev_student_electives', 'dev_teacher_source', 'test_db_agent_query_enabled')").all();

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

        // Check IP whitelist (general)
        const clientIp = context.request.headers.get('CF-Connecting-IP') || 
                         context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                         'unknown';
        const isWhitelisted = ipWhitelist.includes(clientIp);

        // Check debug overlay whitelist (separate from general ip_whitelist)
        const debugWhitelist = settings['comcigan_debug_whitelist'] ? JSON.parse(settings['comcigan_debug_whitelist']) : [];
        // Empty list = allow all; non-empty list = only whitelisted IPs
        const comciganDebugWhitelistHit = debugWhitelist.length === 0 || debugWhitelist.includes(clientIp);

        // Check access debug mode (IP list for iOS guide debug)
        const accessDebugEnabled = settings['access_debug_mode_enabled'] === 'true';
        let accessDebugIpList: any[] = [];
        if (settings['access_debug_ip_list']) {
            try {
                accessDebugIpList = JSON.parse(settings['access_debug_ip_list']);
            } catch (e) {
                accessDebugIpList = [];
            }
        }

        const matchedDebugItem = accessDebugEnabled
            ? accessDebugIpList.find((item: any) => {
                const targetIp = typeof item === 'string' ? item : item?.ip;
                if (!targetIp) return false;
                return targetIp === clientIp || targetIp === '*' || (clientIp !== 'unknown' && clientIp.startsWith(targetIp));
            })
            : null;

        const accessDebugModeHit = !!matchedDebugItem;
        const accessDebugDefaultMode = (typeof matchedDebugItem === 'object' && matchedDebugItem?.mode) ? matchedDebugItem.mode : 'manual';

        // Check beta tester force IP list
        let betaTesterForceIps: string[] = [];
        if (settings['beta_tester_force_ips']) {
            try {
                const parsed = JSON.parse(settings['beta_tester_force_ips']);
                betaTesterForceIps = Array.isArray(parsed) ? parsed : [];
            } catch {
                betaTesterForceIps = settings['beta_tester_force_ips'].split('\n').map((s: string) => s.trim()).filter(Boolean);
            }
        }
        const isForceBetaTester = betaTesterForceIps.some((ip: string) => {
            const trimmed = String(ip).trim();
            if (!trimmed) return false;
            return trimmed === '*' || trimmed === clientIp || (clientIp !== 'unknown' && clientIp.startsWith(trimmed));
        });

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
            comcigan_debug_whitelist_hit: comciganDebugWhitelistHit,
            access_debug_mode_hit: accessDebugModeHit,
            access_debug_default_mode: accessDebugDefaultMode,
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
            pwa_install_button_visible: settings['pwa_install_button_visible'] !== 'false', // default true (global circuit breaker)
            chrome_install_button_visible: settings['chrome_install_button_visible'] !== 'false', // default true
            safari_install_button_visible: settings['safari_install_button_visible'] !== 'false', // default true
            other_install_button_visible: settings['other_install_button_visible'] !== 'false', // default true
            // 접속환경별 점검 우회 (maintenance_bypass — detect() 기반 일원화)
            maintenance_bypass_chrome: settings['maintenance_bypass_chrome'] === 'true',
            maintenance_bypass_samsung: settings['maintenance_bypass_samsung'] === 'true',
            maintenance_bypass_safari: settings['maintenance_bypass_safari'] === 'true',
            maintenance_bypass_other: settings['maintenance_bypass_other'] === 'true',
            maintenance_bypass_pwa_app: settings['maintenance_bypass_pwa_app'] === 'true',
            maintenance_bypass_webview_app: settings['maintenance_bypass_webview_app'] === 'true',
            maintenance_bypass: {
                chrome: settings['maintenance_bypass_chrome'] === 'true',
                samsung: settings['maintenance_bypass_samsung'] === 'true',
                safari: settings['maintenance_bypass_safari'] === 'true',
                other: settings['maintenance_bypass_other'] === 'true',
                pwa_app: settings['maintenance_bypass_pwa_app'] === 'true',
                webview_app: settings['maintenance_bypass_webview_app'] === 'true',
            },
            play_store_url: settings['play_store_url'] || '', // external Play Store / app store link
            app_store_url: settings['app_store_url'] || '', // iOS App Store link
            show_target_class_main_menu: settings['show_target_class_main_menu'] !== 'false', // default true
            promotion_popup_enabled: settings['promotion_popup_enabled'] === 'true' || settings['promotion_popup_enabled'] === true || settings['promotion_popup_enabled'] === '1' || settings['promotion_popup_enabled'] === 1 || settings['promotion_popup_enabled'] === 'on', // default false (꺼짐)
            promotion_reset_days: settings['promotion_reset_days'] || '0',
            assessment_distrust_threshold: settings['assessment_distrust_threshold'] || '3',
            assessment_positive_color: settings['assessment_positive_color'] || '#22c55e',
            assessment_positive_ratio: settings['assessment_positive_ratio'] || '30',
            assessment_negative_color: settings['assessment_negative_color'] || '#9ca3af',
            assessment_negative_ratio: settings['assessment_negative_ratio'] || '40',
            assessment_timetable_color: settings['assessment_timetable_color'] === 'true',
            changed_class_tint_color: settings['changed_class_tint_color'] || '#fef08a',
            changed_class_tint_opacity: settings['changed_class_tint_opacity'] || '0.75',
            comcigan_debug_overlay_enabled: settings['comcigan_debug_overlay_enabled'] === 'true',
            special_schedules_enabled: settings['special_schedules_enabled'] !== 'false',
            special_schedules: settings['special_schedules'] ? JSON.parse(settings['special_schedules']) : [],
            teacher_ignore_keywords: settings['teacher_ignore_keywords'],
            // 급식 설정
            meal_lunch_cutoff_hour: parseInt(settings['meal_lunch_cutoff_hour'] || '14'),
            meal_rating_enabled: settings['meal_rating_enabled'] !== 'false',   // default true
            meal_emphasis_enabled: settings['meal_emphasis_enabled'] !== 'false', // default true
            // 학기 리셋 키 — 클라이언트가 쿨키 버전과 비교하여 불일치 시 재등록 유도
            semester_key: settings['semester_key'] || '1',
            // 수행평가 등록주체 권한 및 차단 안내 메시지
            assessment_allow_student_grade1: settings['assessment_allow_student_grade1'] !== 'false',
            assessment_allow_student_grade2: settings['assessment_allow_student_grade2'] !== 'false',
            assessment_allow_student_grade3: settings['assessment_allow_student_grade3'] !== 'false',
            assessment_allow_teacher_grade1: settings['assessment_allow_teacher_grade1'] !== 'false',
            assessment_allow_teacher_grade2: settings['assessment_allow_teacher_grade2'] !== 'false',
            assessment_allow_teacher_grade3: settings['assessment_allow_teacher_grade3'] !== 'false',
            assessment_disallow_msg_student: settings['assessment_disallow_msg_student'] || '현재 학생의 수행평가 등록이 제한되어 있습니다.',
            assessment_disallow_msg_teacher: settings['assessment_disallow_msg_teacher'] || '현재 선생님의 수행평가 등록이 제한되어 있습니다.',
            // 교사 페이지 인증 만료 설정 (일수)
            teacher_auth_expire_days: parseInt(settings['teacher_auth_expire_days'] || '0', 10),
            // 학생에게 교사 지원표시 — 이용중인 교사 이름 배열
            active_teachers: (() => { try { return settings['active_teachers'] ? JSON.parse(settings['active_teachers']) : []; } catch { return []; } })(),
            // 오픈채팅 Android 품앗이 베타테스팅 기능 활성화 여부 (기본: false)
            beta_testing_enabled: settings['beta_testing_enabled'] === 'true',
            beta_pumasi_button_visible: settings['beta_pumasi_button_visible'] !== 'false',
            beta_tester_force_ips: betaTesterForceIps,
            is_force_beta_tester: isForceBetaTester,
            // 개발자 계정 (9999 김학생, 김교사) 설정
            ...(() => {
                const isDevEnabled = settings['dev_account_enabled'] === 'true';
                if (!isDevEnabled) {
                    return {
                        dev_account_enabled: false,
                        dev_student_grade: null,
                        dev_student_class: null,
                        dev_student_electives: {},
                        dev_teacher_source: null,
                    };
                }
                return {
                    dev_account_enabled: true,
                    dev_student_grade: settings['dev_student_grade'] || '2',
                    dev_student_class: settings['dev_student_class'] || '1',
                    dev_student_electives: (() => { try { return settings['dev_student_electives'] ? JSON.parse(settings['dev_student_electives']) : {}; } catch { return {}; } })(),
                    dev_teacher_source: settings['dev_teacher_source'] || '',
                };
            })(),
            // 테스트 DB 에이전트 쿼리 우회 허용 여부
            test_db_agent_query_enabled: settings['test_db_agent_query_enabled'] === 'true',
            // 환경 바인딩 정보 (테스트 서버/DB 일치 여부 포함)
            ...await (async () => {
                const envInfo = await resolveEnvBindingInfo(env, new URL(context.request.url));
                return {
                    env_info: envInfo,
                    is_test_server: envInfo.isTestServer,
                    server_name: envInfo.serverName,
                    is_test_db: envInfo.isTestDb,
                    test_db_name: envInfo.dbName,
                    is_env_mismatch: envInfo.isMismatch,
                };
            })(),
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
