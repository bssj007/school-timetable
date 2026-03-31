interface Env {
    DB: any;
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

async function scrapeAndSave(env: Env) {
    const nowTs = Math.floor(Date.now() / 1000);
    const now = new Date();
    const currentYear = now.getFullYear();
    const mFirst = `${currentYear}/01/01`;
    const mEnd = `${currentYear}/12/31`;

    for (const dietTy of ['중식', '석식']) {
        try {
            const res = await fetch("https://school.busanedu.net/bssj-h/dv/dietView/selectDvList.do", {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ sysId: 'bssj-h', dietTy, monthFirst: mFirst, monthEnmt: mEnd })
            });
            if (!res.ok) continue;
            const data: any[] = await res.json();
            const fetched = data.filter(i => i.dietSeq && i.dietSeq !== 'holiday');
            
            // D1 Batch insertion for large data, avoiding limits
            const chunkSize = 80;
            for (let i = 0; i < fetched.length; i += chunkSize) {
                const chunk = fetched.slice(i, i + chunkSize);
                const stmts = chunk.map(item => env.DB.prepare(`
                    INSERT INTO meals (date, content, calories, origins, type, sysId, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(date, type) DO UPDATE SET
                        content = excluded.content,
                        calories = excluded.calories,
                        origins = excluded.origins,
                        createdAt = excluded.createdAt
                    WHERE meals.sysId != 'manual'
                `).bind(item.dietDate, item.dietCn, item.dietCal, item.orgplce, item.dietTy || dietTy, 'bssj-h', nowTs));
                await env.DB.batch(stmts);
            }
            console.log(`[Scraper] Saved ${fetched.length} ${dietTy} entries collectively`);
        } catch (e) {
            console.error(`[Scraper] Error fetching ${dietTy}:`, e);
        }
    }
}

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { env } = context;
    try {
        const now = new Date();
        const yearStr = now.getFullYear().toString();

        let count = 0;
        try {
            const countResult = await env.DB.prepare(
                "SELECT COUNT(*) as cnt FROM meals WHERE date LIKE ?"
            ).bind(`${yearStr}/%`).first();
            count = countResult?.cnt ?? 0;
        } catch (e: any) {
            // Auto layout table if missing
            if (e.message && e.message.includes("no such table")) {
                console.log("[Meal API] Target table missing, running migration.");
                await env.DB.prepare(CREATE_MEALS_TABLE).run();
                count = 0;
            } else {
                throw e;
            }
        }

        if (count === 0) {
            console.log("[API] No meals for this year in DB, scraping now...");
            await scrapeAndSave(env);
        }

        // Fetch all meals for this year
        const rows = await env.DB.prepare(
            "SELECT * FROM meals WHERE date LIKE ? ORDER BY date ASC"
        ).bind(`${yearStr}/%`).all();

        const grouped: Record<string, any> = {};
        for (const m of (rows.results || [])) {
            // Normalize date: YYYY/MM/DD -> YYYY-MM-DD
            const date = (m.date as string).replace(/\//g, '-');
            if (!grouped[date]) {
                grouped[date] = { 
                    date, 
                    lunch: [], 
                    dinner: [], 
                    lunch_is_manual: false, 
                    dinner_is_manual: false, 
                    updated_at: m.createdAt ? new Date(m.createdAt * 1000).toISOString() : '' 
                };
            }
            const lines = (m.content as string).split('\n').map((l: string) => l.trim()).filter((l: string) => l !== '');
            if (m.type === '석식') {
                grouped[date].dinner = lines;
                if (m.sysId === 'manual') grouped[date].dinner_is_manual = true;
            }
            else {
                grouped[date].lunch = lines;
                if (m.sysId === 'manual') grouped[date].lunch_is_manual = true;
            }
        }

        const meals = Object.values(grouped);
        const lastUpdated = meals.reduce((acc: any, m: any) => m.updated_at > acc ? m.updated_at : acc, '');

        return new Response(JSON.stringify({ meals, lastUpdated: lastUpdated || null }), {
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60, s-maxage=300'
            }
        });
    } catch (error: any) {
        console.error("[Meal API] Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
    const { env, request } = context;
    const pw = request.headers.get('X-Admin-Password');
    if (!pw) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    try {
        await env.DB.prepare(CREATE_MEALS_TABLE).run();
        
        let body: any = {};
        try {
            body = await request.json();
        } catch {}

        if (body.mode === 'manual_add') {
            const date = body.date?.replace(/-/g, '/'); // YYYY-MM-DD -> YYYY/MM/DD
            const { type, content } = body;
            const nowTs = Math.floor(Date.now() / 1000);
            if (!date || !type || !content) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
            
            await env.DB.prepare(`
                INSERT INTO meals (date, content, calories, origins, type, sysId, createdAt)
                VALUES (?, ?, '', '', ?, 'manual', ?)
                ON CONFLICT(date, type) DO UPDATE SET
                    content = excluded.content,
                    sysId = 'manual',
                    createdAt = excluded.createdAt
            `).bind(date, content, type, nowTs).run();
            return new Response(JSON.stringify({ success: true, message: '수동 식단이 저장되었습니다.' }), { headers: { 'Content-Type': 'application/json' } });
        }
        
        if (body.mode === 'manual_delete') {
            const date = body.date?.replace(/-/g, '/');
            const { type } = body;
            if (!date || !type) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
            
            await env.DB.prepare(`
                DELETE FROM meals WHERE date = ? AND type = ? AND sysId = 'manual'
            `).bind(date, type).run();
            return new Response(JSON.stringify({ success: true, message: '수동 식단이 삭제되었습니다.' }), { headers: { 'Content-Type': 'application/json' } });
        }

        // General refresh
        await scrapeAndSave(env);
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
