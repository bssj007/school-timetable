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
 * Parse Riroschool meal_schedule.php HTML.
 * Returns [ { date: "YYYY-MM-DD", items: string[] }, ... ]
 */
function parseMealHtml(html: string): { date: string; items: string[] }[] {
    const results: { date: string; items: string[] }[] = [];

    // Find the main meal table — Riroschool uses a table with date headers and menu cells
    // Strategy: find all <th> with Korean date patterns, then find associated <td> menu content

    // Extract all table cells with dates (thead cells) and menu cells (tbody cells)
    // The structure is typically: one row per day column

    // Try to find the weekly meal table
    // The page contains a table where columns are days of the week
    // Row 1: dates (th cells), remaining rows: menu items

    // Find all date cells
    const datePattern = /(\d{4})년\s+(\d{1,2})월\s+(\d{1,2})일/g;

    // Collect all date-like strings from the HTML with their positions
    const dateMatches: { date: string; index: number }[] = [];
    let match;
    while ((match = datePattern.exec(html)) !== null) {
        const y = match[1];
        const mo = match[2].padStart(2, "0");
        const d = match[3].padStart(2, "0");
        dateMatches.push({ date: `${y}-${mo}-${d}`, index: match.index });
    }

    if (dateMatches.length === 0) return results;

    // For each date, find the associated menu content
    // Menu items are typically in the HTML between date columns
    // We'll parse the table structure more carefully

    // Split by table rows
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[] = [];
    let rowMatch;
    while ((rowMatch = rowPattern.exec(html)) !== null) {
        rows.push(rowMatch[1]);
    }

    // Find the date header row: the row that contains the most date patterns
    let dateRowIdx = -1;
    let maxDateCount = 0;
    for (let i = 0; i < rows.length; i++) {
        const count = (rows[i].match(/\d{4}년\s+\d{1,2}월\s+\d{1,2}일/g) || []).length;
        if (count > maxDateCount) {
            maxDateCount = count;
            dateRowIdx = i;
        }
    }

    if (dateRowIdx === -1 || maxDateCount === 0) {
        // Fallback: just use the unique dates found
        return results;
    }

    // Extract column dates from the date row
    const dateRow = rows[dateRowIdx];
    const cellPattern = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    const dateCells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(dateRow)) !== null) {
        dateCells.push(cellMatch[1]);
    }

    // Parse dates from cells
    const colDates: (string | null)[] = dateCells.map(cell => {
        const stripped = cell.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
        return parseKoreanDate(stripped);
    });

    // For each subsequent row, extract menu items per column
    // Accumulate menu text per column
    const colMenus: string[][] = colDates.map(() => []);

    for (let i = dateRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        // Skip empty/separator rows
        if (!row.trim() || row.includes("colspan") && (row.match(/colspan\s*=\s*["']?\d+/i)?.[0] ?? "").includes("5")) continue;

        const cells: string[] = [];
        let cm;
        const cp = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        while ((cm = cp.exec(row)) !== null) {
            cells.push(cm[1]);
        }

        // Map cells to columns (some cells may have colspan)
        let colIdx = 0;
        const cellsWithSpan: { content: string; span: number }[] = [];
        const cellHtmlPattern = /<t[hd]([^>]*)>([\s\S]*?)<\/t[hd]>/gi;
        let chm;
        while ((chm = cellHtmlPattern.exec(row)) !== null) {
            const attrs = chm[1];
            const content = chm[2];
            const spanMatch = attrs.match(/colspan\s*=\s*["']?(\d+)/i);
            const span = spanMatch ? parseInt(spanMatch[1]) : 1;
            cellsWithSpan.push({ content, span });
        }

        let ci = 0;
        for (const { content, span } of cellsWithSpan) {
            const text = content
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .trim();

            if (text && ci < colMenus.length) {
                const items = text.split("\n").map(s => s.trim()).filter(s => s.length > 0 && s !== "-" && s !== "&nbsp;");
                if (items.length > 0) {
                    colMenus[ci].push(...items);
                }
            }
            ci += span;
        }
    }

    // Build results
    for (let i = 0; i < colDates.length; i++) {
        const date = colDates[i];
        if (!date) continue;
        const items = colMenus[i] || [];
        if (items.length > 0) {
            results.push({ date, items });
        }
    }

    return results;
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

        // Step 1: Login to Riroschool
        const loginUrl = `${RIROSCHOOL_BASE}/user.php`;
        const loginFormData = new URLSearchParams({
            action: "signin",
            user_id: username,
            user_pw: password,
            redirect_link: `/meal_schedule.php?db=${RIROSCHOOL_DB_ID}`
        });

        const loginRes = await fetch(loginUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (compatible; SchoolTimetable/1.0)",
                "Referer": RIROSCHOOL_BASE
            },
            body: loginFormData.toString(),
            redirect: "manual" // Don't auto-follow to capture cookies
        });

        // Collect cookies from login response
        const setCookieHeaders: string[] = [];
        loginRes.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") {
                setCookieHeaders.push(value);
            }
        });

        // Extract session cookie values
        const cookieStrings = setCookieHeaders.map(c => c.split(";")[0]);
        const cookieHeader = cookieStrings.join("; ");

        if (!cookieHeader) {
            return new Response(
                JSON.stringify({ error: "로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요." }),
                { status: 401 }
            );
        }

        // Step 2: Fetch meal schedule page
        const mealUrl = `${RIROSCHOOL_BASE}/meal_schedule.php?db=${RIROSCHOOL_DB_ID}`;
        const mealRes = await fetch(mealUrl, {
            method: "GET",
            headers: {
                "Cookie": cookieHeader,
                "User-Agent": "Mozilla/5.0 (compatible; SchoolTimetable/1.0)",
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

        // Check if redirected to login (not authenticated)
        if (html.includes("action=signin") || html.includes("로그인") && !html.includes("meal_schedule")) {
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
