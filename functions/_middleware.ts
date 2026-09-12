/// <reference types="@cloudflare/workers-types" />
import { createStudentProfilesTable, createIpProfilesTable, createAccessLogsTable } from "./db_schema";
import { parseUA } from "./_uaDetect";

interface Env {
    DB: D1Database;
    DB_NAME?: string;
}

// Worker 인스턴스당 1회만 스키마 보장 (모듈 레벨 캐시)
let accessLogsSchemaVerified = false;

/**
 * Test DB Watermark Helper
 * 테스트 DB 환경일 경우 사이트 최상단에 매우 작은 빨간색 글씨로 DB명을 워터마크처럼 고정 표시합니다.
 * UI 흐름에 영향을 주지 않으며 클릭 관통(pointer-events: none) 처리됩니다.
 */
function getTestDbWatermarkHtml(dbName: string): string {
    return `<style id="test-db-watermark-style">
  #test-db-watermark {
    position: fixed;
    top: max(1px, env(safe-area-inset-top, 1px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999999;
    pointer-events: none;
    user-select: none;
    font-size: 9px;
    line-height: 1;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: #ef4444;
    font-weight: 700;
    letter-spacing: 0.3px;
    opacity: 0.85;
    text-shadow: 0 0 2px rgba(255, 255, 255, 0.95), 0 0 4px rgba(255, 255, 255, 0.8), 0 1px 2px rgba(0, 0, 0, 0.15);
    white-space: nowrap;
  }
  @media print {
    #test-db-watermark, #test-db-watermark-style { display: none !important; }
  }
</style>
<div id="test-db-watermark">${dbName}</div>`;
}

async function resolveTestDbInfo(env: any, url: URL): Promise<{ isTestDb: boolean; dbName: string }> {
    let dbName = '';
    if (env.DB_NAME) {
        dbName = String(env.DB_NAME);
    }

    if (!dbName && env.DB) {
        try {
            await env.DB.prepare("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT)").run();
            const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'db_name'").first();
            if (row && row.value) {
                dbName = String(row.value);
            }
        } catch (_) {}
    }

    const hostname = url.hostname.toLowerCase();
    const isTestHostname = hostname.includes('test') || hostname.includes('localhost') || hostname === '127.0.0.1' || hostname.includes('preview');

    if (!dbName && isTestHostname) {
        dbName = 'school-timetable-testserver-db';
        if (env.DB) {
            try {
                await env.DB.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('db_name', 'school-timetable-testserver-db')").run();
            } catch (_) {}
        }
    }

    const isTestDb = Boolean(
        dbName && (
            dbName.toLowerCase().includes('test') ||
            isTestHostname
        )
    );

    return { isTestDb, dbName: dbName || 'school-timetable-testserver-db' };
}

export const onRequest = async (context: any) => {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 0. 점검 모드(Maintenance) 원천 차단 (Edge 레벨)
    // HTML(페이지) 요청에 대해서만 점검 모드 차단을 수행하여 API/에셋을 보호합니다.
    // 단, /admin 및 /privacy 경로는 어떠한 접속제한도 적용하지 않습니다 (관리자 및 약관/방침 열람 보장).
    if (request.headers.get('accept')?.includes('text/html') && !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/privacy')) {
        try {
            if (env.DB) {
                // 설정 DB 조회
                const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('maintenance_mode', 'ip_whitelist', 'site_favicon_url', 'maintenance_bypass_chrome', 'maintenance_bypass_samsung', 'maintenance_bypass_safari', 'maintenance_bypass_other', 'maintenance_bypass_pwa_app', 'maintenance_bypass_webview_app')").all();
                const settings: Record<string, string> = {};
                if (rows && rows.results) {
                    rows.results.forEach((row: any) => { settings[row.key] = row.value; });
                }

                const maintenanceMode = settings['maintenance_mode'] ? JSON.parse(settings['maintenance_mode']) : { active: false };
                
                if (maintenanceMode.active) {
                    const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
                    const ipWhitelist = settings['ip_whitelist'] ? JSON.parse(settings['ip_whitelist']) : [];
                    const isWhitelisted = ipWhitelist.includes(clientIp);

                    // 환경별 점검 우회가 하나라도 활성화되어 있으면 클라이언트 detect()가 정밀 판별할 수 있도록 SPA 로드 허용
                    const hasAnyEnvBypass = [
                        settings['maintenance_bypass_chrome'],
                        settings['maintenance_bypass_samsung'],
                        settings['maintenance_bypass_safari'],
                        settings['maintenance_bypass_other'],
                        settings['maintenance_bypass_pwa_app'],
                        settings['maintenance_bypass_webview_app'],
                    ].some(v => v === 'true');

                    if (!isWhitelisted && !hasAnyEnvBypass) {
                        const maintenanceMessage = maintenanceMode.message || "서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요.";
                        const siteFaviconUrl = settings['site_favicon_url'];
                        const logoOrIconHtml = siteFaviconUrl ? `
        <img class="logo-img" src="${siteFaviconUrl}" alt="Logo" />` : `
        <div class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>`;
                        const { isTestDb: isMaintTestDb, dbName: maintDbName } = await resolveTestDbInfo(env, url);
                        const maintWatermarkHtml = (isMaintTestDb && maintDbName) ? getTestDbWatermarkHtml(maintDbName) : '';

                        const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>사이트 점검 중</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .container { background-color: #ffffff; border: 2px solid #fee2e2; border-radius: 1rem; padding: 2.5rem; max-width: 28rem; width: 90%; text-align: center; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06); }
        .icon { color: #ef4444; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; }
        .icon svg { width: 3.5rem; height: 3.5rem; }
        .logo-img { width: 4.5rem; height: 4.5rem; object-fit: contain; margin: 0 auto 1.5rem auto; display: block; }
        h1 { font-size: 1.5rem; font-weight: 700; color: #111827; margin: 0 0 1rem 0; letter-spacing: -0.025em; }
        p { color: #475569; font-size: 1.125rem; line-height: 1.6; margin: 0; white-space: pre-wrap; word-break: keep-all; font-weight: 500; }
        .footer { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.875rem; color: #94a3b8; font-weight: 500; }
    </style>
</head>
<body>
    <div class="container">
${logoOrIconHtml}
        <h1>사이트 점검 중</h1>
        <p>${maintenanceMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        ${maintenanceMode.endTime ? `<div class="footer">점검 종료 예정: ${new Date(maintenanceMode.endTime).toLocaleString('ko-KR')}</div>` : ''}
    </div>
    ${maintWatermarkHtml}
</body>
</html>`;
                        return new Response(html, {
                            status: 503,
                            headers: { 'Content-Type': 'text/html; charset=utf-8' }
                        });
                    }
                }
            }
        } catch (e) {
            console.error('[Middleware] Maintenance check failed:', e);
        }
    }

    // 1. Log Access (Response)
    const response = await next();

    // 5. Client ID Management (Cookie)
    // Structure: We need to handle this BEFORE response ideally, but since we are in middleware,
    // we can append to response headers if it's new.

    const cookies = request.headers.get('Cookie') || '';

    // Pass Context
    context.data = { ...context.data };

    // Async task for Logging & Profile Update
    const logTrace = async () => {
        // SKIP for Admin APIs to verify race conditions during DB Reset
        if (url.pathname.startsWith('/api/admin')) return;

        if (!env.DB) return;

        try {
            const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
            const userAgent = request.headers.get('User-Agent') || '';

            // Parse Other Cookies
            let grade = null, classNum = null, studentNumber = null, studentName: string | null = null;
            let kakaoId = null, kakaoNickname = null;
            let teacherName: string | null = null;
            let isBetaTester = false;
            let betaTesterSince: string | null = null;

            if (cookies) {
                const configMatch = cookies.match(new RegExp('(^| )school_timetable_config=([^;]+)'));
                if (configMatch) {
                    try {
                        const config = JSON.parse(decodeURIComponent(configMatch[2]));
                        grade = config.grade;
                        classNum = config.classNum;
                        studentNumber = config.studentNumber;
                        studentName = config.studentName?.trim() ?? null;
                    } catch (e) { }
                }

                const kakaoMatch = cookies.match(new RegExp('(^| )kakao_user_data=([^;]+)'));
                if (kakaoMatch) {
                    try {
                        const kakaoData = JSON.parse(decodeURIComponent(kakaoMatch[2]));
                        kakaoId = kakaoData.id?.toString();
                        kakaoNickname = kakaoData.nickname;
                    } catch (e) { }
                }

                // 선생님 이름 쿨키 (sj_teacher_name)
                const teacherMatch = cookies.match(new RegExp('(^| )sj_teacher_name=([^;]+)'));
                if (teacherMatch) {
                    try { teacherName = decodeURIComponent(teacherMatch[2]).trim() || null; } catch { }
                }

                // 오픈채팅 베타테스터 품앗이 쿠키 (sj_beta_pumasi)
                const pumasiMatch = cookies.match(new RegExp('(^| )sj_beta_pumasi=([^;]+)'));
                if (pumasiMatch) {
                    isBetaTester = true;
                    try {
                        const raw = decodeURIComponent(pumasiMatch[2]);
                        const num = parseInt(raw, 10);
                        if (!isNaN(num) && num > 0) {
                            betaTesterSince = new Date(num).toISOString();
                        } else {
                            betaTesterSince = raw;
                        }
                    } catch {
                        betaTesterSince = new Date().toISOString();
                    }
                }
            }

            const uaProfile = parseUA(userAgent);

            // 앱(WebView 또는 PWA) 접속 여부 감지
            const modeParam = url.searchParams.get('mode');
            const standaloneParam = url.searchParams.get('standalone');
            const isPwaUrl = modeParam === 'pwa' || modeParam === 'app' || standaloneParam === '1' || url.searchParams.get('utm_source') === 'homescreen';
            const hasAppCookie = cookies.includes('sj_app_mode=1') || cookies.includes('pwa_standalone=1');
            const isAppHeader = request.headers.get('X-App-Execution') === '1';
            const isCurrentAppAccess = Boolean(isPwaUrl || uaProfile.isApp || hasAppCookie || isAppHeader);

            // 1. Insert Log — 테이블 먼저 보장 후 INSERT
            const insertLog = async () => {
                const fullEndpoint = url.pathname + (url.search ? url.search : '');
                await env.DB.prepare(
                    "INSERT INTO access_logs (ip, userAgent, method, endpoint, status, grade, classNum, studentNumber, kakaoId, kakaoNickname, teacherName, browserKey, deviceType, os, isInApp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(ip, userAgent, request.method, fullEndpoint, response.status, grade, classNum, studentNumber, kakaoId, kakaoNickname, teacherName, uaProfile.browserKey, uaProfile.deviceType, uaProfile.os, uaProfile.isInApp ? 1 : 0).run();
            };

            // 테이블 & 컬럼 선제적 보장 (Worker 인스턴스당 1회만 실행)
            if (!accessLogsSchemaVerified) {
                try {
                    await env.DB.prepare(createAccessLogsTable).run();
                    // 구버전 컬럼 보장
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN teacherName TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN browserKey TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN deviceType TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN os TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN isInApp INTEGER DEFAULT 0").run(); } catch (_) {}
                    accessLogsSchemaVerified = true;
                } catch (schemaErr) {
                    console.warn('[Middleware] access_logs schema ensure failed:', schemaErr);
                }
            }

            try {
                await insertLog();
            } catch (e: any) {
                // Auto-Migration: Table missing or Column missing
                if (e.message && e.message.includes("no such table")) {
                    console.log("[Middleware] Creating access_logs table");
                    try {
                        // Create table with ALL current columns
                        await env.DB.prepare(`
                            CREATE TABLE IF NOT EXISTS access_logs (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                ip TEXT NOT NULL,
                                userAgent TEXT,
                                method TEXT,
                                endpoint TEXT,
                                status INTEGER,
                                grade INTEGER,
                                classNum INTEGER,
                                studentNumber INTEGER,
                                kakaoId TEXT,
                                kakaoNickname TEXT,
                                teacherName TEXT,
                                browserKey TEXT,
                                deviceType TEXT,
                                os TEXT,
                                isInApp INTEGER DEFAULT 0,
                                accessedAt TEXT DEFAULT (datetime('now'))
                            )
                        `).run();
                        await insertLog();
                    } catch (createError) {
                        console.error("[Middleware] Create access_logs Failed:", createError);
                    }
                } else if (e.message && e.message.includes("no such column")) {
                    // 컨럼 누락 구버전 테이블 자동 마이그레이션
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN teacherName TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN browserKey TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN deviceType TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN os TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN isInApp INTEGER DEFAULT 0").run(); } catch (_) {}
                    try { await insertLog(); } catch (_) { console.warn("[Middleware] Column mismatch in access_logs after migration"); }
                } else {
                    console.error("[Middleware] Log Insert Failed:", e);
                }
            }


            // 2. Dynamic Profile Creation Helper
            // 복합 식별자: (name, grade, classNum, studentNumber) — name이 없으면 SKIP
            const ensureStudentProfileAndGetId = async (name: string, g: number, c: number, s: number) => {
                try {
                    const res = await env.DB.prepare(`
                        INSERT INTO student_profiles (name, grade, classNum, studentNumber, updatedAt) 
                        VALUES (?, ?, ?, ?, datetime('now'))
                        ON CONFLICT(name, grade, classNum, studentNumber) 
                        DO UPDATE SET updatedAt = datetime('now')
                        RETURNING id
                    `).bind(name, g, c, s).first();
                    return res?.id as number | null;
                } catch (e: any) {
                    console.error("[Middleware] Student Profile Upsert Failed:", e);
                    if (e.message && e.message.includes("no such table")) {
                        try {
                            await env.DB.prepare(createStudentProfilesTable).run();
                            const res = await env.DB.prepare(`
                                INSERT INTO student_profiles (name, grade, classNum, studentNumber, updatedAt) 
                                VALUES (?, ?, ?, ?, datetime('now'))
                                ON CONFLICT(name, grade, classNum, studentNumber) 
                                DO UPDATE SET updatedAt = datetime('now')
                                RETURNING id
                            `).bind(name, g, c, s).first();
                            return res?.id as number | null;
                        } catch (createError) {
                            console.error("[Middleware] Create student_profiles Failed:", createError);
                        }
                    }
                    return null;
                }
            };

            // name이 없으면 프로필 생성 SKIP → ip_profiles.student_profile_id = NULL
            let resolvedStudentProfileId: number | null = null;
            if (studentName && grade && classNum && studentNumber) {
                const g = parseInt(grade);
                const c = parseInt(classNum);
                const n = parseInt(studentNumber);
                if (!isNaN(g) && !isNaN(c) && !isNaN(n)) {
                    resolvedStudentProfileId = await ensureStudentProfileAndGetId(studentName, g, c, n);
                }
            }

            // Helper: Retry Operation with Backoff
            const retryOperation = async (fn: () => Promise<void>, retries = 3, delay = 50) => {
                for (let i = 0; i < retries; i++) {
                    try {
                        await fn();
                        return true;
                    } catch (e: any) {
                        if (i === retries - 1) throw e; // Final attempt failed
                        // Check if error is worth retrying (Lock or FK)
                        if (e.message && (e.message.includes("database is locked") || e.message.includes("FOREIGN KEY"))) {
                            console.warn(`[Middleware] Retry ${i + 1}/${retries} failed: ${e.message}. Retrying in ${delay}ms...`);
                            await new Promise(res => setTimeout(res, delay));
                            delay *= 2; // Exponential backoff
                        } else {
                            throw e; // Non-retryable error
                        }
                    }
                }
                return false;
            };

            const updateIpProfile = async () => {
                const isSuccess = response.status >= 200 && response.status < 300;
                const isAssessmentApi = url.pathname === '/api/assessment' || url.pathname === '/api/assessment/';
                const rawAction = url.searchParams.get('action');
                const hasAction = rawAction !== null && rawAction.trim() !== '';
                const isVoteAction = isAssessmentApi && rawAction === 'vote';

                // 순수 추가: action 쿼리 파라미터가 없는 POST 요청 및 성공 응답 (predict, preview, force_predict 배제)
                const isAddAction = isAssessmentApi && !hasAction && request.method === 'POST' && isSuccess;
                // 순수 삭제: DELETE 요청 및 성공 응답
                const isDeleteAction = isAssessmentApi && request.method === 'DELETE' && isSuccess;
                // 순수 수정: PUT 또는 투표가 아닌 PATCH 요청 및 성공 응답
                const isPureEditAction = isAssessmentApi && !hasAction && (request.method === 'PUT' || (request.method === 'PATCH' && !isVoteAction)) && isSuccess;
                
                // 전체 수정 기여 횟수: 추가 + 삭제 + 수정
                const isModificationAction = isAddAction || isDeleteAction || isPureEditAction;

                const isPrintAction = url.pathname === '/api/action/print' && isSuccess;
                const isDownloadAction = url.pathname === '/api/action/download' && isSuccess;

                const query = `
                    INSERT INTO ip_profiles (
                        ip, student_profile_id, kakaoId, kakaoNickname, lastAccess,
                        modificationCount, addCount, deleteCount, userAgent, printCount, downloadCount,
                        isStandalone, teacherName, browserKey, deviceType, os, isInApp,
                        isBetaTester, betaTesterSince
                    )
                    VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ip) DO UPDATE SET
                        lastAccess = datetime('now'),
                        userAgent = excluded.userAgent,
                        student_profile_id = excluded.student_profile_id,
                        kakaoId = COALESCE(excluded.kakaoId, ip_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, ip_profiles.kakaoNickname),
                        teacherName = excluded.teacherName,
                        browserKey = excluded.browserKey,
                        deviceType = excluded.deviceType,
                        os = excluded.os,
                        isInApp = excluded.isInApp,
                        isBetaTester = CASE WHEN excluded.isBetaTester = 1 THEN 1 ELSE ip_profiles.isBetaTester END,
                        betaTesterSince = COALESCE(ip_profiles.betaTesterSince, excluded.betaTesterSince),
                        modificationCount = ip_profiles.modificationCount + ?,
                        addCount = ip_profiles.addCount + ?,
                        deleteCount = ip_profiles.deleteCount + ?,
                        printCount = ip_profiles.printCount + ?,
                        downloadCount = ip_profiles.downloadCount + ?,
                        isStandalone = CASE WHEN excluded.isStandalone = 1 THEN 1 ELSE ip_profiles.isStandalone END
                `;

                const increment = isModificationAction ? 1 : 0;
                const addIncrement = isAddAction ? 1 : 0;
                const deleteIncrement = isDeleteAction ? 1 : 0;
                const printIncrement = isPrintAction ? 1 : 0;
                const downloadIncrement = isDownloadAction ? 1 : 0;

                const executeLink = async (profileId: number | null) => {
                    await env.DB.prepare(query).bind(
                        ip,
                        profileId,
                        kakaoId,
                        kakaoNickname,
                        increment, // modificationCount Start
                        addIncrement,
                        deleteIncrement,
                        userAgent,
                        printIncrement,
                        downloadIncrement,
                        isCurrentAppAccess ? 1 : 0, // isStandalone (한 번이라도 1이 되면 영구 유지)
                        teacherName,
                        uaProfile.browserKey,
                        uaProfile.deviceType,
                        uaProfile.os,
                        uaProfile.isInApp ? 1 : 0,
                        isBetaTester ? 1 : 0,
                        betaTesterSince,
                        increment, // modificationCount Update
                        addIncrement,
                        deleteIncrement,
                        printIncrement,
                        downloadIncrement
                    ).run();
                };

                // Logic with Retry
                try {
                    await retryOperation(async () => {
                        await executeLink(resolvedStudentProfileId);
                    });
                } catch (e: any) {
                    if (resolvedStudentProfileId !== null && (e.message && (e.message.includes("FOREIGN KEY") || e.message.includes("constraint")))) {
                        console.warn(`[Middleware] FK Violation for profile ${resolvedStudentProfileId} after retries.`);
                        console.warn(`[Middleware] Fallback to NULL link.`);
                        await executeLink(null);
                    } else if (e.message && e.message.includes("database is locked")) {
                        console.error("[Middleware] Database Locked. Skipping profile update to prevent blocking.");
                    } else {
                        throw e;
                    }
                }
            };

            try {
                await updateIpProfile();
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    console.log("[Middleware] Creating ip_profiles table (New Schema)");
                    try {
                        await env.DB.prepare(createIpProfilesTable).run();
                        // Retry update
                        await updateIpProfile();
                    } catch (migrationError) {
                        console.error("[Middleware] Migration Failed for ip_profiles:", migrationError);
                    }
                } else if (e.message && (e.message.includes("has no column named") || e.message.includes("no column named"))) {
                    console.warn("[Middleware] ip_profiles schema mismatch detected. Attempting safe ALTER...");
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN addCount INTEGER DEFAULT 0").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN deleteCount INTEGER DEFAULT 0").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN printCount INTEGER DEFAULT 0").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN downloadCount INTEGER DEFAULT 0").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN isStandalone INTEGER DEFAULT 0").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN teacherName TEXT").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN browserKey TEXT").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN deviceType TEXT").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN os TEXT").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN isInApp INTEGER DEFAULT 0").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN isBetaTester INTEGER DEFAULT 0").run();
                    } catch (_) { /* already exists */ }
                    try {
                        await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN betaTesterSince TEXT").run();
                    } catch (_) { /* already exists */ }

                    // Retry update after ALTER
                    try {
                        await updateIpProfile();
                    } catch (retryError) {
                        console.error("[Middleware] Retry failed after ALTER:", retryError);
                    }
                } else {
                    console.error("IP Profile Update Error", e);
                }
            }

        } catch (e) {
            console.error("Log/Profile Update Failed:", e);
        }
    };

    // Placeholder for background tasks if it was missing
    const runBackgroundTasks = async () => {
        // Implement any daily cleanup or checks here
    };

    context.waitUntil(Promise.all([logTrace(), runBackgroundTasks()]));

    // Edge HTML Rewriting for Dynamic Site Title & Test DB Watermark
    const pathname = url.pathname;
    // Check if the route is an API, static asset, or file extension
    const isApiRoute = pathname.startsWith('/api/');
    const isAssetRoute = pathname.startsWith('/assets/') || pathname.match(/\.(js|css|png|jpe?g|gif|ico|svg|json|webmanifest)$/i);
    const contentType = response.headers.get("content-type") || "";

    // Cloudflare Pages often serves SPA routes without an explicit .html extension.
    // If it's not an API and not a static asset, it's highly likely an HTML page (like index.html).
    const isHtmlRoute = !isApiRoute && !isAssetRoute && (contentType.includes("text/html") || pathname === "/" || !pathname.includes("."));

    if (isHtmlRoute) {
        try {
            const { isTestDb, dbName } = await resolveTestDbInfo(env, url);

            let siteTitle = '수행 일정공유';
            let siteTitleHtml = '';

            if (env.DB) {
                try {
                    const titleRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'site_title'").first();
                    if (titleRow && titleRow.value) siteTitle = titleRow.value as string;

                    const htmlRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'site_title_html'").first();
                    if (htmlRow && htmlRow.value) siteTitleHtml = htmlRow.value as string;
                } catch (e) {
                    console.error("[Middleware] Title fetch failed:", e);
                }
            }

            // Transform the response stream
            const rewriter = new HTMLRewriter()
                .on("title", {
                    element(element: any) {
                        element.setInnerContent(siteTitle);
                    }
                })
                .on("head", {
                    element(element: any) {
                        if (siteTitleHtml) {
                            element.append(`<script>window.__INITIAL_SITE_TITLE_HTML__ = ${JSON.stringify(siteTitleHtml)};</script>`, { html: true });
                        }
                        if (isTestDb && dbName) {
                            element.append(`<script>window.__TEST_DB_NAME__ = ${JSON.stringify(dbName)};</script>`, { html: true });
                        }
                    }
                });

            if (isTestDb && dbName) {
                rewriter.on("body", {
                    element(element: any) {
                        element.append(getTestDbWatermarkHtml(dbName), { html: true });
                    }
                });
            }

            const transformedResponse = rewriter.transform(response);

            // Clone to modify headers safely
            const finalResponse = new Response(transformedResponse.body, transformedResponse);
            finalResponse.headers.set("X-Edge-Title-Injected", "true");
            finalResponse.headers.set("X-Edge-Title-Value", encodeURIComponent(siteTitle));
            if (isTestDb && dbName) {
                finalResponse.headers.set("X-Test-DB-Watermark", encodeURIComponent(dbName));
            }

            return finalResponse;
        } catch (e) {
            console.error("[Middleware] HTMLRewriter injection failed:", e);
        }
    }

    return response;
};
