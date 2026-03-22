import { adminPassword as envAdminPassword } from "../../../server/adminPW";
import { createTimetableCacheTable } from "../../db_schema";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const adminPassword = request.headers.get('X-Admin-Password');

    if (adminPassword !== envAdminPassword) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not available' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const db = env.DB;

    // 테이블 보장 밑 컬럼 핫픽스
    try { await db.prepare(createTimetableCacheTable).run(); } catch (_) {}
    try { await db.prepare("ALTER TABLE timetable_cache ADD COLUMN is_frozen INTEGER DEFAULT 0").run(); } catch (_) {}

    const method = request.method;

    // GET: 캐시 상태 조회
    if (method === 'GET') {
        try {
            const { results } = await db.prepare("SELECT cache_key, dataset_id, updated_at, LENGTH(response_json) as data_size, is_frozen FROM timetable_cache ORDER BY cache_key").all();

            // 현재 캐시 최대 유효 시간 설정값 조회
            let cacheMaxAgeMinutes = 5;
            try {
                const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'comcigan_cache_max_age_minutes'").first();
                if (row && row.value) cacheMaxAgeMinutes = parseInt(row.value as string);
            } catch (_) {}

            const now = Date.now();
            const cacheEntries = (results || []).map((row: any) => {
                const updatedAt = new Date((row.updated_at || "").replace(' ', 'T') + 'Z').getTime();
                const ageMs = now - updatedAt;
                return {
                    cacheKey: row.cache_key,
                    datasetId: row.dataset_id,
                    updatedAt: row.updated_at,
                    ageSec: Math.round(ageMs / 1000),
                    dataSize: row.data_size,
                    isFresh: row.is_frozen === 1 || ageMs < (cacheMaxAgeMinutes * 60 * 1000),
                    isFrozen: row.is_frozen === 1
                };
            });

            return new Response(JSON.stringify({
                cacheEntries,
                settings: {
                    cacheMaxAgeMinutes
                }
            }), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // POST: 수동 캐시 갱신
    if (method === 'POST') {
        try {
            const results: any[] = [];
            try {
                // 직접 Comcigan에서 가져와 전교생 통합본(raw_data) 캐시에 저장
                const { refreshCache } = await import('../comcigan' as any);
                await refreshCache(db, 1);
                
                // 저장 결과 확인
                const row = await db.prepare("SELECT updated_at, LENGTH(response_json) as data_size FROM timetable_cache WHERE cache_key = 'raw_data'").first();
                results.push({
                    global: true,
                    success: !!row,
                    updatedAt: row?.updated_at,
                    dataSize: row?.data_size
                });
            } catch (e: any) {
                results.push({ global: true, success: false, error: e.message });
            }

            return new Response(JSON.stringify({ success: true, results }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // PATCH: 캐시 설정 변경 및 수동 동결 설정
    if (method === 'PATCH') {
        try {
            const body = await request.json();
            const { action, cacheKey, freeze, cacheMaxAgeMinutes } = body;

            if (action === 'toggle_freeze' && cacheKey) {
                await db.prepare("UPDATE timetable_cache SET is_frozen = ?, updated_at = datetime('now') WHERE cache_key = ?")
                    .bind(freeze ? 1 : 0, cacheKey)
                    .run();
                return new Response(JSON.stringify({ success: true, isFrozen: freeze }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (cacheMaxAgeMinutes !== undefined) {
                const minutes = Math.max(1, Math.min(60, parseInt(cacheMaxAgeMinutes)));
                await db.prepare(`
                    CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT)
                `).run();
                await db.prepare(
                    "INSERT INTO system_settings (key, value) VALUES ('comcigan_cache_max_age_minutes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                ).bind(String(minutes)).run();
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response('Method Not Allowed', { status: 405 });
};
