import { createMealCacheTable } from "../db_schema";
import { adminPassword } from "../../server/adminPW";

interface Env {
    DB: any;
    ADMIN_PASSWORD?: string;
}

const RIROSCHOOL_BASE = "https://bssj.riroschool.kr";
const RIROSCHOOL_DB_ID = "2303";

// ---- helpers ----

function checkAdminAuth(request: Request): boolean {
    const headerPw = request.headers.get("X-Admin-Password");
    return headerPw === adminPassword;
}

async function ensureTable(env: Env) {
    try { await env.DB.prepare(createMealCacheTable).run(); } catch (_) { }
}

/** Parse KST date string like "2025년 3월 24일 (월)" → "2025-03-24" */
function parseKoreanDate(raw: string): string | null {
    // Match "YYYY년 M월 D일"
    const m = raw.match(/(\d{4})년\s+(\d{1,2})월\s+(\d{1,2})일/);
    if (!m) return null;
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
}

/**
 * Parse Riroschool meal_schedule.php HTML (weekly view).
 *
 * Actual structure:
 *   <div class="meal_week_popup" meal_date="2026-03-24" meal_code="중식" uid="...">
 *     <p>혼합잡곡밥<span>5</span></p>
 *     <p>근대된장국<span>5.6.9</span></p>
 *     ...
 *   </div>
 *
 * Returns [ { date: "YYYY-MM-DD", items: string[] }, ... ]
 */
function parseMealHtml(html: string): { date: string; items: string[] }[] {
    const dateMap: Record<string, string[]> = {};

    // Match every meal_week_popup block
    const blockPattern = /<div[^>]+class="[^"]*meal_week_popup[^"]*"[^>]+meal_date="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/div>/gi;
    let block: RegExpExecArray | null;

    while ((block = blockPattern.exec(html)) !== null) {
        const date = block[1];
        const inner = block[2];

        // Extract <p> tags, strip <span> (allergy codes), clean text
        const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        let pMatch: RegExpExecArray | null;
        const items: string[] = [];

        while ((pMatch = pPattern.exec(inner)) !== null) {
            const text = pMatch[1]
                .replace(/<span[^>]*>[\s\S]*?<\/span>/gi, "") // remove allergy spans
                .replace(/<[^>]+>/g, "")                       // strip any remaining tags
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .trim();

            if (text && text !== "-") items.push(text);
        }

        if (items.length > 0) {
            if (!dateMap[date]) dateMap[date] = [];
            dateMap[date].push(...items);
        }
    }

    return Object.entries(dateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => ({ date, items }));
}


// ---- GET /api/meal ----
// Public: return stored meal data from DB

export const onRequestGet = async (context: { request: Request; env: Env; next: () => Promise<Response> }): Promise<Response> => {
    const { env, request } = context;

    try {
        await ensureTable(env);

        const url = new URL(request.url);
        const from = url.searchParams.get("from"); // optional date filter YYYY-MM-DD

        let stmt;
        if (from) {
            stmt = env.DB.prepare(
                "SELECT date, menu_json, updated_at FROM meal_cache WHERE date >= ? ORDER BY date ASC"
            ).bind(from);
        } else {
            // Return last 30 days + next 14 days
            const today = new Date();
            const past = new Date(today);
            past.setDate(past.getDate() - 30);
            const fromDate = past.toISOString().split("T")[0];
            stmt = env.DB.prepare(
                "SELECT date, menu_json, updated_at FROM meal_cache WHERE date >= ? ORDER BY date ASC LIMIT 100"
            ).bind(fromDate);
        }

        const rows = await stmt.all();
        const meals = (rows.results || []).map((row: any) => {
            let items: string[] = [];
            try { items = JSON.parse(row.menu_json); } catch (_) { }
            return { date: row.date, items, updated_at: row.updated_at };
        });

        // Include last updated time (latest updated_at)
        const lastUpdated = meals.length > 0
            ? meals.reduce((acc: string, m: any) => m.updated_at > acc ? m.updated_at : acc, "")
            : null;

        return new Response(JSON.stringify({ meals, lastUpdated }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

// ---- POST /api/meal/fetch ----
// Admin only: crawl Riroschool and store meal data

// Note: this handler is for POST to /api/meal (the /fetch suffix is handled via nested route)
// We'll handle both in the same file using method dispatch on a sub-path pattern.
// Actually Cloudflare Pages Functions route /api/meal/fetch.ts separately.
// Let's put POST fetch in this file as onRequestPost then handle action=fetch

export const onRequestPost = async (context: { request: Request; env: Env; next: () => Promise<Response> }): Promise<Response> => {
    const { request, env } = context;

    if (!checkAdminAuth(request)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        await ensureTable(env);

        const body = await request.json() as any;
        const { username, password } = body;

        if (!username || !password) {
            return new Response(
                JSON.stringify({ error: "리로스쿨 아이디와 비밀번호를 입력해주세요." }),
                { status: 400 }
            );
        }

        // Step 1a: GET login page first to establish PHP session (PHPSESSID)
        const signinPageUrl = `${RIROSCHOOL_BASE}/user.php?action=signin`;
        const signinRes = await fetch(signinPageUrl, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml"
            },
            redirect: "follow"
        });

        // Extract the initial session cookie (PHPSESSID)
        const extractCookies = (res: Response): string => {
            const raw = res.headers.get("set-cookie") ?? "";
            const parts: string[] = [];
            raw.split(/,(?=[^;]+=)/).forEach(part => {
                const token = part.trim().split(";")[0].trim();
                if (token && token.includes("=")) parts.push(token);
            });
            return parts.join("; ");
        };

        const sessionCookie = extractCookies(signinRes);

        // Step 1b: POST login via AJAX endpoint with session cookie
        const loginUrl = `${RIROSCHOOL_BASE}/ajax.php`;
        const loginPayload = new URLSearchParams({
            app: "user",
            mode: "login",
            userType: "1",
            id: username,
            pw: password,
            deeplink: "",
            redirect_link: ""
        });

        const loginRes = await fetch(loginUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": signinPageUrl,
                "X-Requested-With": "XMLHttpRequest",
                ...(sessionCookie ? { "Cookie": sessionCookie } : {})
            },
            body: loginPayload.toString(),
            redirect: "manual"
        });

        // Parse JSON response to check login success
        let loginJson: any = null;
        try { loginJson = await loginRes.clone().json(); } catch (_) { }

        const code = loginJson?.code ?? loginJson?.result ?? loginJson?.status ?? null;
        const isSuccess = code === "000" || code === 0 || code === "0" || loginJson?.success === true;

        if (!isSuccess) {
            return new Response(
                JSON.stringify({ error: "로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요.", debug: loginJson }),
                { status: 401 }
            );
        }

        // Merge session cookie with any new cookies from login response
        const loginCookie = extractCookies(loginRes);
        // Build final cookie: start with session, override with login cookies
        const cookieMap: Record<string, string> = {};
        [sessionCookie, loginCookie].join("; ").split("; ").forEach(pair => {
            const eqIdx = pair.indexOf("=");
            if (eqIdx > 0) {
                const k = pair.substring(0, eqIdx).trim();
                const v = pair.substring(eqIdx + 1).trim();
                if (k) cookieMap[k] = v;
            }
        });
        const cookieHeader = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");

        // Step 2: Fetch meal schedule page with session
        const mealUrl = `${RIROSCHOOL_BASE}/meal_schedule.php?db=${RIROSCHOOL_DB_ID}`;
        const mealRes = await fetch(mealUrl, {
            method: "GET",
            headers: {
                ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": RIROSCHOOL_BASE
            },
            redirect: "follow"
        });

        if (!mealRes.ok) {
            return new Response(
                JSON.stringify({ error: `식단 페이지 접근 실패 (${mealRes.status})` }),
                { status: 502 }
            );
        }

        const html = await mealRes.text();

        // Check if redirected back to login
        if (html.includes("action=signin") && !html.includes("meal_schedule")) {
            return new Response(
                JSON.stringify({ error: "로그인 세션이 유효하지 않습니다. 아이디/비밀번호를 확인해주세요." }),
                { status: 401 }
            );
        }

        // Step 3: Parse HTML
        const meals = parseMealHtml(html);

        if (meals.length === 0) {
            return new Response(
                JSON.stringify({ 
                    error: "식단 데이터를 파싱할 수 없었습니다. 리로스쿨 페이지 구조가 변경되었을 수 있습니다.",
                    debugHtmlLength: html.length
                }),
                { status: 422 }
            );
        }

        // Step 4: Upsert into DB
        const now = new Date().toISOString();
        for (const meal of meals) {
            await env.DB.prepare(
                `INSERT INTO meal_cache (date, menu_json, updated_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(date) DO UPDATE SET
                     menu_json = excluded.menu_json,
                     updated_at = excluded.updated_at`
            ).bind(meal.date, JSON.stringify(meal.items), now).run();
        }

        return new Response(JSON.stringify({
            success: true,
            count: meals.length,
            dates: meals.map(m => m.date),
            updatedAt: now
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("[meal.ts] POST error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
