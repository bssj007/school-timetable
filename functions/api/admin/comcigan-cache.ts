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

    // 테이블 보장
    try { await db.prepare(createTimetableCacheTable).run(); } catch (_) {}

    const method = request.method;

    // GET: 캐시 상태 조회
    if (method === 'GET') {
        try {
            const { results } = await db.prepare("SELECT cache_key, dataset_id, updated_at, LENGTH(response_json) as data_size FROM timetable_cache ORDER BY cache_key").all();

            // 현재 캐시 최대 유효 시간 설정값 조회
            let cacheMaxAgeMinutes = 5;
            try {
                const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'comcigan_cache_max_age_minutes'").first();
                if (row && row.value) cacheMaxAgeMinutes = parseInt(row.value as string);
            } catch (_) {}

            const now = Date.now();
            const cacheEntries = (results || []).map((row: any) => {
                const updatedAt = new Date(row.updated_at + 'Z').getTime();
                const ageMs = now - updatedAt;
                return {
                    cacheKey: row.cache_key,
                    datasetId: row.dataset_id,
                    updatedAt: row.updated_at,
                    ageSec: Math.round(ageMs / 1000),
                    dataSize: row.data_size,
                    isFresh: ageMs < (cacheMaxAgeMinutes * 60 * 1000)
                };
            });

            return new Response(JSON.stringify({
                cacheEntries,
                settings: {
                    cacheMaxAgeMinutes
                }
            }), {
                headers: { 'Content-Type': 'application/json' }
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
            const body = await request.json();
            const grades = body.grades || [1, 2, 3];

            // comcigan.ts의 refreshCache를 직접 import하면 Cloudflare Pages Functions에서
            // import 경로 문제가 생길 수 있으므로, 직접 fetch로 캐시를 갱신
            const results: any[] = [];
            for (const grade of grades) {
                try {
                    // 직접 Comcigan에서 가져와 캐시에 저장 (UPSERT로 기존 캐시 덮어쓰기)
                    // 기존 캐시를 삭제하지 않음 → 갱신 실패 시에도 기존 캐시 유지
                    const { refreshCache } = await import('./comcigan' as any);
                    await refreshCache(db, grade);
                    
                    // 저장 결과 확인
                    const row = await db.prepare("SELECT updated_at, LENGTH(response_json) as data_size FROM timetable_cache WHERE cache_key = ?").bind(`grade_${grade}`).first();
                    results.push({
                        grade,
                        success: !!row,
                        updatedAt: row?.updated_at,
                        dataSize: row?.data_size
                    });
                } catch (e: any) {
                    results.push({ grade, success: false, error: e.message });
                }
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

    // PATCH: 캐시 설정 변경
    if (method === 'PATCH') {
        try {
            const body = await request.json();
            const { cacheMaxAgeMinutes } = body;

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
