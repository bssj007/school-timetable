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
            // timetable_archive 테이블 보장
            try { await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_archive (date_range TEXT PRIMARY KEY, response_json TEXT NOT NULL, saved_at TEXT DEFAULT (datetime('now')))`).run(); } catch (_) {}

            const [cacheRes, settingRes, archiveRes, rawDataRes] = await db.batch([
                db.prepare("SELECT cache_key, dataset_id, updated_at, LENGTH(response_json) as data_size, is_frozen FROM timetable_cache ORDER BY cache_key"),
                db.prepare("SELECT value FROM system_settings WHERE key = 'comcigan_cache_max_age_minutes'"),
                db.prepare("SELECT date_range, saved_at, LENGTH(response_json) as data_size FROM timetable_archive ORDER BY saved_at DESC"),
                db.prepare("SELECT response_json FROM timetable_cache WHERE cache_key = 'raw_data'")
            ]);

            // 현재 캐시 최대 유효 시간 설정값 조회
            let cacheMaxAgeMinutes = 5;
            const maxAgeRow = settingRes.results?.[0];
            if (maxAgeRow && maxAgeRow.value) cacheMaxAgeMinutes = parseInt(maxAgeRow.value as string);

            const now = Date.now();
            const cacheEntries = ((cacheRes.results) || []).map((row: any) => {
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

            // 현재 LIVE raw_data에서 날짜 범위 파싱
            const liveRanges: string[] = [];
            try {
                const rawRow = rawDataRes.results?.[0];
                if (rawRow?.response_json) {
                    const rd = JSON.parse(rawRow.response_json as string);
                    const dateArr = rd['일자'];
                    const dateArrNew = rd['일자자료'];
                    if (dateArr && Array.isArray(dateArr)) {
                        for (const r of dateArr) {
                            if (typeof r === 'string' && r.includes('~')) liveRanges.push(r.trim());
                        }
                    } else if (dateArrNew && Array.isArray(dateArrNew)) {
                        for (const item of dateArrNew) {
                            const r = Array.isArray(item) ? item[1] : item;
                            if (typeof r === 'string' && r.includes('~')) liveRanges.push(r.trim());
                        }
                    }
                }
            } catch (_) {}

            const archiveEntries = ((archiveRes.results) || []).map((row: any) => ({
                dateRange: row.date_range,
                savedAt: row.saved_at,
                dataSize: row.data_size
            }));

            return new Response(JSON.stringify({
                cacheEntries,
                archive: archiveEntries,
                liveRanges,
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

            // ── 과거 캐싱 TEST ──────────────────────────────────────────
            if (action === 'test_archive') {
                try { await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_archive (date_range TEXT PRIMARY KEY, response_json TEXT NOT NULL, saved_at TEXT DEFAULT (datetime('now')))`).run(); } catch (_) {}

                // 1. 현재 raw_data 읽기
                const rawRow = await db.prepare("SELECT response_json FROM timetable_cache WHERE cache_key = 'raw_data'").first();
                if (!rawRow || !rawRow.response_json) {
                    return new Response(JSON.stringify({ success: false, error: 'raw_data 캐시가 없습니다. 먼저 캐시를 갱신하세요.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }
                const rawJson = rawRow.response_json as string;
                const rawData = JSON.parse(rawJson);

                // 2. 날짜 범위 파싱
                const dateArr = rawData['일자'];
                const dateArrNew = rawData['일자자료'];
                const ranges: string[] = [];

                if (dateArr && Array.isArray(dateArr)) {
                    for (const r of dateArr) {
                        if (typeof r === 'string' && r.includes('~')) ranges.push(r.trim());
                    }
                } else if (dateArrNew && Array.isArray(dateArrNew)) {
                    for (const item of dateArrNew) {
                        const r = Array.isArray(item) ? item[1] : item;
                        if (typeof r === 'string' && r.includes('~')) ranges.push(r.trim());
                    }
                }

                if (ranges.length === 0) {
                    return new Response(JSON.stringify({ success: false, error: '날짜 범위를 파싱할 수 없습니다. raw_data 구조를 확인하세요.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                // 3. 이미 저장된 아카이브는 덮어쓰지 않음 (INSERT OR IGNORE)
                // — 활성화 상태(과거) 아카이브 항목 보호를 위해 INSERT OR REPLACE 대신 INSERT OR IGNORE 사용
                const savedRanges: string[] = [];
                const skippedRanges: string[] = []; // 이미 존재하여 건너뛴 범위
                for (const range of ranges) {
                    try {
                        const result = await db.prepare(
                            "INSERT OR IGNORE INTO timetable_archive (date_range, response_json, saved_at) VALUES (?, ?, datetime('now'))"
                        ).bind(range, rawJson).run();
                        // D1: meta.changes === 1이면 실제 삽입, 0이면 IGNORE(이미 존재)
                        if (result?.meta?.changes === 1) {
                            savedRanges.push(range);
                        } else {
                            skippedRanges.push(range);
                        }
                    } catch (_) {}
                }

                // 4. 첫 번째 범위의 시작 날짜로 archive 조회 검증
                const firstRange = ranges[0];
                const firstRangeParts = firstRange.split('~').map((s: string) => s.trim());
                const testTargetShort = firstRangeParts[0]; // e.g. "26-03-03"
                const testTargetDate = new Date(`20${testTargetShort}`);

                const archiveRows = await db.prepare("SELECT date_range, LENGTH(response_json) as data_size FROM timetable_archive").all();
                let lookupResult: { found: boolean; matchedRange: string | null; testedDate: string; dataSize?: number } = {
                    found: false,
                    matchedRange: null,
                    testedDate: testTargetShort,
                };

                for (const row of (archiveRows.results || [])) {
                    const rangeStr = row.date_range as string;
                    const parts = rangeStr.split('~').map((s: string) => s.trim());
                    if (parts.length < 2) continue;
                    const start = new Date(`20${parts[0]}`);
                    const end = new Date(`20${parts[1]}`);
                    end.setHours(23, 59, 59, 999);
                    if (testTargetDate >= start && testTargetDate <= end) {
                        lookupResult = { found: true, matchedRange: rangeStr, testedDate: testTargetShort, dataSize: row.data_size as number };
                        break;
                    }
                }

                return new Response(JSON.stringify({
                    success: true,
                    savedRanges,
                    skippedRanges,
                    totalArchived: savedRanges.length,
                    totalSkipped: skippedRanges.length,
                    lookupTest: lookupResult,
                    summary: lookupResult.found
                        ? `✅ 신규저장(${savedRanges.length}개) / 기존보호(${skippedRanges.length}개) + 조회 성공: '${lookupResult.matchedRange}' (${Math.round((lookupResult.dataSize ?? 0) / 1024)}KB)`
                        : `⚠️ 신규저장(${savedRanges.length}개) / 기존보호(${skippedRanges.length}개) — 조회 실패: ${testTargetShort}에 해당하는 범위 없음`
                }), { headers: { 'Content-Type': 'application/json' } });
            }

            // ── 날짜 지정 아카이브 조회 TEST ────────────────────────────
            if (action === 'lookup_archive') {
                const { targetDate } = body; // 예: "26-03-03" 또는 "2026-03-03"
                if (!targetDate) {
                    return new Response(JSON.stringify({ success: false, error: 'targetDate가 필요합니다. 예: 26-03-03' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                try { await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_archive (date_range TEXT PRIMARY KEY, response_json TEXT NOT NULL, saved_at TEXT DEFAULT (datetime('now')))`).run(); } catch (_) {}

                const targetShort = (targetDate as string).length > 8 ? (targetDate as string).substring(2) : (targetDate as string);
                const targetDateObj = new Date(`20${targetShort}`);

                if (isNaN(targetDateObj.getTime())) {
                    return new Response(JSON.stringify({ success: false, error: `날짜 파싱 실패: "${targetDate}". YY-MM-DD 형식으로 입력하세요.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                const archiveRows = await db.prepare("SELECT date_range, LENGTH(response_json) as data_size, saved_at FROM timetable_archive").all();
                const allRanges = (archiveRows.results || []).map((r: any) => ({ dateRange: r.date_range, dataSize: r.data_size, savedAt: r.saved_at }));

                let found = false;
                let matchedRange: string | null = null;
                let matchedDataSize: number | null = null;
                let matchedSavedAt: string | null = null;

                for (const row of (archiveRows.results || [])) {
                    const rangeStr = row.date_range as string;
                    const parts = rangeStr.split('~').map((s: string) => s.trim());
                    if (parts.length < 2) continue;
                    const start = new Date(`20${parts[0]}`);
                    const end = new Date(`20${parts[1]}`);
                    end.setHours(23, 59, 59, 999);
                    if (targetDateObj >= start && targetDateObj <= end) {
                        found = true;
                        matchedRange = rangeStr;
                        matchedDataSize = row.data_size as number;
                        matchedSavedAt = row.saved_at as string;
                        break;
                    }
                }

                return new Response(JSON.stringify({
                    success: true,
                    testedDate: targetShort,
                    found,
                    matchedRange,
                    matchedDataSize,
                    matchedSavedAt,
                    totalArchiveEntries: allRanges.length,
                    allRanges,
                    summary: found
                        ? `✅ "${targetShort}" → 아카이브 '${matchedRange}' 매칭 (${Math.round((matchedDataSize ?? 0) / 1024)}KB)`
                        : `❌ "${targetShort}" → 매칭되는 아카이브 없음 (총 ${allRanges.length}개 항목)`
                }), { headers: { 'Content-Type': 'application/json' } });
            }

            if (action === 'toggle_freeze' && cacheKey) {
                await db.prepare("UPDATE timetable_cache SET is_frozen = ?, updated_at = datetime('now') WHERE cache_key = ?")
                    .bind(freeze ? 1 : 0, cacheKey)
                    .run();
                return new Response(JSON.stringify({ success: true, isFrozen: freeze }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (action === 'delete_archive') {
                const { dateRange } = body;
                if (!dateRange) return new Response(JSON.stringify({ error: 'dateRange required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                try { await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_archive (date_range TEXT PRIMARY KEY, response_json TEXT NOT NULL, saved_at TEXT DEFAULT (datetime('now')))`).run(); } catch (_) {}
                await db.prepare("DELETE FROM timetable_archive WHERE date_range = ?").bind(dateRange).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
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
