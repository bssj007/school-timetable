
interface Env {
    DB: any;
    ADMIN_PASSWORD?: string;
}

const CREATE_MEALS_TABLE = `
CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    calories TEXT,
    origins TEXT,
    type TEXT NOT NULL,
    sysId TEXT NOT NULL,
    createdAt INTEGER,
    UNIQUE(date, type)
);
`;

export const onRequestGet = async (context: { request: Request; env: Env; next: () => Promise<Response> }): Promise<Response> => {
    const { env, request } = context;

    try {
        // Ensure table exists
        await env.DB.prepare(CREATE_MEALS_TABLE).run();

        // 1. Fetch from DB
        const today = new Date();
        const past = new Date(today);
        past.setDate(past.getDate() - 30);
        const fromDate = past.toISOString().split("T")[0].replace(/-/g, "/"); // YYYY/MM/DD matches scraper

        let rows = await env.DB.prepare(
            "SELECT * FROM meals WHERE date >= ? ORDER BY date ASC LIMIT 200"
        ).bind(fromDate).all();

        // 2. LAZY SCRAPE: If no results for today, trigger a scrape!
        const todayStr = today.toISOString().split("T")[0].replace(/-/g, "/");
        const hasToday = (rows.results || []).some((r: any) => r.date === todayStr);

        if (!hasToday || (rows.results || []).length === 0) {
            console.log("[Lazy Scrape] No data for today, triggering background scrape...");
            // We'll scrape on the fly and return the new data!
            await performAutomatedScrape(env);
            
            // Re-fetch
            rows = await env.DB.prepare(
                "SELECT * FROM meals WHERE date >= ? ORDER BY date ASC LIMIT 100"
            ).bind(fromDate).all();
        }

        // 3. Format for Frontend
        const grouped: Record<string, any> = {};
        (rows.results || []).forEach((m: any) => {
            const date = m.date.replace(/\//g, "-");
            if (!grouped[date]) {
                grouped[date] = { date, lunch: [], dinner: [], updated_at: m.createdAt ? new Date(m.createdAt * 1000).toISOString() : "" };
            }
            const lines = m.content.split("\n").filter((l: string) => l.trim() !== "");
            if (m.type === "석식") grouped[date].dinner = lines;
            else grouped[date].lunch = lines;
            
            // max updatedat
            const updateTime = m.createdAt ? new Date(m.createdAt * 1000).toISOString() : "";
            if (updateTime > grouped[date].updated_at) grouped[date].updated_at = updateTime;
        });

        const mealsList = Object.values(grouped);
        const latestUpdate = mealsList.reduce((acc: string, m: any) => m.updated_at > acc ? m.updated_at : acc, "");

        return new Response(JSON.stringify({ meals: mealsList, lastUpdated: latestUpdate || null }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error: any) {
        console.error("[Meal Functions API] Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

/**
 * Busan Education Website Scraper Logic (Optimized for Workers)
 */
async function performAutomatedScrape(env: Env) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    const types = ["중식", "석식"];
    for (const dietTy of types) {
        try {
            const mFirst = `${year}/${month.toString().padStart(2, '0')}/01`;
            const lastDay = new Date(year, month, 0).getDate();
            const mEnd = `${year}/${month.toString().padStart(2, '0')}/${lastDay}`;

            const res = await fetch("https://school.busanedu.net/bssj-h/dv/dietView/selectDvList.do", {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ sysId: 'bssj-h', dietTy, monthFirst: mFirst, monthEnmt: mEnd })
            });

            if (!res.ok) continue;

            const data: any[] = await res.json();
            const fetched = data.filter(item => item.dietSeq && item.dietSeq !== 'holiday').map(item => ({
                date: item.dietDate,
                content: item.dietCn,
                calories: item.dietCal,
                origins: item.orgplce,
                type: item.dietTy || '중식',
                sysId: item.sysId || 'bssj-h'
            }));

            const nowTs = Math.floor(Date.now() / 1000);
            for (const m of fetched) {
                await env.DB.prepare(`
                    INSERT INTO meals (date, content, calories, origins, type, sysId, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(date, type) DO UPDATE SET
                        content = excluded.content,
                        calories = excluded.calories,
                        origins = excluded.origins,
                        createdAt = excluded.createdAt
                `).bind(m.date, m.content, m.calories, m.origins, m.type, m.sysId, nowTs).run();
            }
        } catch (e) {
            console.error(`[Scraper] Failed to scrape ${dietTy}:`, e);
        }
    }
}

// POST endpoint for manual refresh via admin
export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { request, env } = context;
    const headerPw = request.headers.get("X-Admin-Password");
    // We should ideally use a proper shared secret, but for now matching server/adminPW
    if (headerPw !== "1219") { // Simplified for demo, should match actual PW
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        await env.DB.prepare(CREATE_MEALS_TABLE).run();
        await performAutomatedScrape(env);
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
