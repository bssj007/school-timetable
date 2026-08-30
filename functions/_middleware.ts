/// <reference types="@cloudflare/workers-types" />
import { createStudentProfilesTable, createIpProfilesTable } from "./db_schema";

interface Env {
    DB: D1Database;
}

export const onRequest = async (context: any) => {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 0. 점검 모드(Maintenance) 원천 차단 (Edge 레벨)
    // HTML(페이지) 요청에 대해서만 점검 모드 차단을 수행하여 API/에셋을 보호합니다.
    if (request.headers.get('accept')?.includes('text/html')) {
        try {
            if (env.DB) {
                // 설정 DB 조회
                const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('maintenance_mode', 'ip_whitelist')").all();
                const settings: Record<string, string> = {};
                if (rows && rows.results) {
                    rows.results.forEach((row: any) => { settings[row.key] = row.value; });
                }

                const maintenanceMode = settings['maintenance_mode'] ? JSON.parse(settings['maintenance_mode']) : { active: false };
                
                if (maintenanceMode.active) {
                    const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
                    const ipWhitelist = settings['ip_whitelist'] ? JSON.parse(settings['ip_whitelist']) : [];
                    const isWhitelisted = ipWhitelist.includes(clientIp);

                    if (!isWhitelisted) {
                        const maintenanceMessage = maintenanceMode.message || "서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요.";
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
        .logo-container { width: 5rem; height: 5rem; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; background-color: #f8fafc; padding: 0.5rem; }
        .logo-container img { width: 100%; height: 100%; object-fit: contain; }
        h1 { font-size: 1.5rem; font-weight: 700; color: #111827; margin: 0 0 1rem 0; letter-spacing: -0.025em; }
        p { color: #475569; font-size: 1.125rem; line-height: 1.6; margin: 0; white-space: pre-wrap; word-break: keep-all; font-weight: 500; }
        .footer { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.875rem; color: #94a3b8; font-weight: 500; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo-container">
            <img src="${settings['site_favicon_url'] || '/icon.svg'}" alt="Logo" />
        </div>
        <h1>사이트 점검 중</h1>
        <p>${maintenanceMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        ${maintenanceMode.endTime ? `<div class="footer">점검 종료 예정: ${new Date(maintenanceMode.endTime).toLocaleString('ko-KR')}</div>` : ''}
    </div>
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
            let isStandalone = 0;

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

                const pwaMatch = cookies.match(new RegExp('(^| )pwa_standalone=([^;]+)'));
                if (pwaMatch && pwaMatch[2] === '1') {
                    isStandalone = 1;
                }
            }

            // 1. Insert Log (with Auto-Migration for Table Creation)
            const insertLog = async () => {
                await env.DB.prepare(
                    "INSERT INTO access_logs (ip, userAgent, method, endpoint, status, grade, classNum, studentNumber, kakaoId, kakaoNickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(ip, userAgent, request.method, url.pathname, response.status, grade, classNum, studentNumber, kakaoId, kakaoNickname).run();
            };

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
                                accessedAt TEXT DEFAULT (datetime('now'))
                            )
                        `).run();
                        await insertLog();
                    } catch (createError) {
                        console.error("[Middleware] Create access_logs Failed:", createError);
                    }
                } else if (e.message && e.message.includes("no such column")) {
                    // Ignore column errors for now or handle specific migrations if needed
                    console.warn("[Middleware] Column mismatch in access_logs", e);
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
            const isAssessmentApi = url.pathname === '/api/assessment' || url.pathname === '/api/assessment/';
                const isVoteAction = isAssessmentApi && url.searchParams.get('action') === 'vote';
                const isAddAction = isAssessmentApi && !isVoteAction && request.method === 'POST';
                const isDeleteAction = isAssessmentApi && !isVoteAction && request.method === 'DELETE';
                const isEditAction = isAssessmentApi && !isVoteAction && ['POST', 'DELETE', 'PATCH', 'PUT'].includes(request.method);
                const isPrintAction = url.pathname === '/api/action/print';
                const isDownloadAction = url.pathname === '/api/action/download';

                const query = `
                    INSERT INTO ip_profiles (ip, student_profile_id, kakaoId, kakaoNickname, lastAccess, modificationCount, addCount, deleteCount, userAgent, printCount, downloadCount, isStandalone)
                    VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ip) DO UPDATE SET
                        lastAccess = datetime('now'),
                        userAgent = excluded.userAgent,
                        student_profile_id = excluded.student_profile_id,
                        kakaoId = COALESCE(excluded.kakaoId, ip_profiles.kakaoId),
                        kakaoNickname = COALESCE(excluded.kakaoNickname, ip_profiles.kakaoNickname),
                        modificationCount = ip_profiles.modificationCount + ?,
                        addCount = ip_profiles.addCount + ?,
                        deleteCount = ip_profiles.deleteCount + ?,
                        printCount = ip_profiles.printCount + ?,
                        downloadCount = ip_profiles.downloadCount + ?,
                        isStandalone = CASE WHEN excluded.isStandalone = 1 THEN 1 ELSE ip_profiles.isStandalone END
                `;

                const increment = isEditAction ? 1 : 0;
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
                        isStandalone,
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

    // Edge HTML Rewriting for Dynamic Site Title
    const pathname = url.pathname;
    // Check if the route is an API, static asset, or file extension
    const isApiRoute = pathname.startsWith('/api/');
    const isAssetRoute = pathname.startsWith('/assets/') || pathname.match(/\.(js|css|png|jpe?g|gif|ico|svg|json|webmanifest)$/i);
    const contentType = response.headers.get("content-type") || "";

    // Cloudflare Pages often serves SPA routes without an explicit .html extension.
    // If it's not an API and not a static asset, it's highly likely an HTML page (like index.html).
    const isHtmlRoute = !isApiRoute && !isAssetRoute && (contentType.includes("text/html") || pathname === "/" || !pathname.includes("."));

    if (env.DB && isHtmlRoute) {
        try {
            const titleRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'site_title'").first();
            const siteTitle = (titleRow && titleRow.value) ? (titleRow.value as string) : '수행 일정공유';

            const htmlRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'site_title_html'").first();
            const siteTitleHtml = (htmlRow && htmlRow.value) ? (htmlRow.value as string) : '';

            // Transform the response stream first
            const transformedResponse = new HTMLRewriter().on("title", {
                element(element: any) {
                    element.setInnerContent(siteTitle);
                }
            }).on("head", {
                element(element: any) {
                    if (siteTitleHtml) {
                        element.append(`<script>window.__INITIAL_SITE_TITLE_HTML__ = ${JSON.stringify(siteTitleHtml)};</script>`, { html: true });
                    }
                }
            }).transform(response);

            // Clone to modify headers safely
            const finalResponse = new Response(transformedResponse.body, transformedResponse);
            finalResponse.headers.set("X-Edge-Title-Injected", "true");
            finalResponse.headers.set("X-Edge-Title-Value", encodeURIComponent(siteTitle));

            return finalResponse;
        } catch (e) {
            console.error("[Middleware] HTMLRewriter title injection failed:", e);
        }
    }

    return response;
};
