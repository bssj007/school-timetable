
import { createTimetableCacheTable } from '../db_schema';

/**
 * Cloudflare Pages Function - 부산성지고등학교 전용 컴시간알리미 API
 * 
 * Flow:
 * 1. D1 캐시 확인 → 신선하면 즉시 반환
 * 2. 캐시 미스/만료 → Comcigan 외부 서버에서 가져오기
 * 3. 결과를 D1에 캐시 저장
 */

const BASE_URL = "http://comci.net:4082";
const SEARCH_HEX = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"; // 부산성지고 EUC-KR Hex
const FALLBACK_CODE2 = "93342"; // Known correct code for Busan Seongji
const DEFAULT_CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 기본 캐시 유효 시간: 5분

const HEADERS: any = {
    'Accept': '*/*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'http://comci.net:4082/st',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
};

const PROXIES = [
    '', // Direct connection
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];

async function decodeEucKr(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    return decoder.decode(buffer);
}

async function fetchWithTimeout(url: string, options: any = {}, timeout = 5000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchWithProxy(targetUrl: string, headers: any = HEADERS, isEucKr: boolean = false) {
    let lastError;

    // Try each proxy in order
    for (const proxy of PROXIES) {
        try {
            const fullUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
            console.log(`[Comcigan] Attempting fetch with proxy: ${proxy || 'DIRECT'} -> ${fullUrl}`);

            const res = await fetchWithTimeout(fullUrl, { headers }, 5000); // 5s timeout

            if (res.ok) {
                if (isEucKr) return await decodeEucKr(res);
                const buf = await res.arrayBuffer();
                const txt = new TextDecoder('utf-8').decode(buf);
                return txt.replace(/\0/g, '');
            }
            console.warn(`[Comcigan] Proxy ${proxy || 'DIRECT'} failed with status: ${res.status}`);
        } catch (e: any) {
            console.warn(`[Comcigan] Proxy ${proxy || 'DIRECT'} error: ${e.message}`);
            lastError = e;
        }
    }

    console.error('[Comcigan] All proxies failed. Last error:', lastError);
    throw lastError || new Error('All connection attempts failed');
}

async function getPrefix() {
    const html = await fetchWithProxy(`${BASE_URL}/st`, HEADERS, true);
    const match = html.match(/sc_data\('([^']+)'/);
    if (!match) throw new Error("Failed to extract sc_data prefix");
    return match[1];
}

async function getSchoolCode(prefix: string) {
    try {
        const searchUrl = `${BASE_URL}/${prefix}${SEARCH_HEX}`;
        const jsonText = await fetchWithProxy(searchUrl, HEADERS, false);

        if (jsonText.trim() === '.' || jsonText.trim().length === 0) {
            throw new Error("Empty search response");
        }

        const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
        const data = JSON.parse(jsonString);

        const schools = data["학교검색"] || [];
        const target = schools.find((s: any) => s[2] === "부산성지고");

        if (!target) throw new Error("School not found in search result");

        return {
            code1: target[3],
            code2: target[4]
        };
    } catch (e) {
        console.warn("School search failed, using fallback:", e);
        return {
            code1: "36179",
            code2: FALLBACK_CODE2
        };
    }
}

function isDateInRange(targetDateStr: string, rangeStr: any): boolean {
    if (typeof rangeStr !== 'string') return false;
    const targetShort = targetDateStr.length > 8 ? targetDateStr.substring(2) : targetDateStr;
    const parts = rangeStr.split('~').map(s => s.trim());
    if (parts.length < 2) return rangeStr.startsWith(targetShort);
    const startDate = new Date(`20${parts[0]}`);
    const endDate = new Date(`20${parts[1]}`);
    const target = new Date(`20${targetShort}`);
    endDate.setHours(23, 59, 59, 999);
    return target >= startDate && target <= endDate;
}

// 컴시간 주차별(r=1, r=2, ...) 원본 데이터 직접 조회 헬퍼
async function fetchComciganRawData(r: number = 1): Promise<string> {
    const prefix = await getPrefix();
    const { code1, code2 } = await getSchoolCode(prefix);
    const param = `${prefix}${code2}_0_${r}`;
    const b64 = btoa(param);
    const targetUrl = `${BASE_URL}/${code1}?${b64}`;
    const jsonText = await fetchWithProxy(targetUrl, HEADERS, false);
    return jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
}

interface ResolvedWeeklyData {
    rawData: any;
    rawJson: string;
    isOutOfRange: boolean;
    isPastOutOfRange: boolean;
    isFutureOutOfRange: boolean;
    isArchivedData: boolean;
    matchedArchiveRange: string | null;
}

// 주차별/날짜별 raw_data 해석 통합 헬퍼 (teacher_timetable 및 getTimetable 공통 사용)
async function resolveWeeklyRawData(
    db: any,
    targetDate: string | null | undefined,
    cachedRawDataString?: string,
    allowLiveFetch: boolean = false
): Promise<ResolvedWeeklyData> {
    const koreanTime = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const dayOfWeek = koreanTime.getUTCDay();
    if (!targetDate && (dayOfWeek === 6 || dayOfWeek === 0)) {
        const daysToAdd = dayOfWeek === 6 ? 2 : 1;
        koreanTime.setUTCDate(koreanTime.getUTCDate() + daysToAdd);
    }
    const todayShort = koreanTime.toISOString().split('T')[0].substring(2);
    const targetShort = targetDate ? (targetDate.length > 8 ? targetDate.substring(2) : targetDate) : todayShort;
    const targetDateObj = new Date(`20${targetShort}`);

    // 1. 기본 캐시(raw_data) 로드
    let primaryJson = cachedRawDataString;
    if (!primaryJson && db) {
        try {
            const row = await db.prepare("SELECT response_json FROM timetable_cache WHERE cache_key = 'raw_data'").first();
            if (row?.response_json) primaryJson = row.response_json as string;
        } catch (_) {}
    }
    if (!primaryJson && allowLiveFetch) {
        try {
            primaryJson = await fetchComciganRawData(1);
            if (db) {
                try {
                    await db.prepare("INSERT OR REPLACE INTO timetable_cache (cache_key, response_json, updated_at) VALUES ('raw_data', ?, datetime('now'))").bind(primaryJson).run();
                } catch (_) {}
            }
        } catch (e) {
            console.error('[resolveWeeklyRawData] Live fetch failed:', e);
        }
    }

    if (!primaryJson) {
        return {
            rawData: null,
            rawJson: '',
            isOutOfRange: true,
            isPastOutOfRange: false,
            isFutureOutOfRange: false,
            isArchivedData: false,
            matchedArchiveRange: null
        };
    }

    const primaryRaw = JSON.parse(primaryJson);

    // 2. 전체 날짜 경계 계산
    const dateArr = primaryRaw['일자'];
    const dateArrNew = primaryRaw['일자자료'];
    let firstRange: string | null = null;
    let lastRange: string | null = null;

    if (dateArr && Array.isArray(dateArr) && dateArr.length > 0) {
        firstRange = dateArr.find((r: any) => typeof r === 'string' && r.includes('~')) ?? null;
        lastRange  = [...dateArr].reverse().find((r: any) => typeof r === 'string' && r.includes('~')) ?? null;
    } else if (dateArrNew && Array.isArray(dateArrNew) && dateArrNew.length > 0) {
        const firstItem = dateArrNew[0];
        const lastItem = dateArrNew[dateArrNew.length - 1];
        firstRange = Array.isArray(firstItem) ? firstItem[1] : firstItem;
        lastRange = Array.isArray(lastItem) ? lastItem[1] : lastItem;
    }

    let isFutureOutOfRange = false;
    let isPastOutOfRange = false;
    if (lastRange && typeof lastRange === 'string') {
        const parts = lastRange.split('~').map(s => s.trim());
        if (parts.length >= 2) {
            const endDate = new Date(`20${parts[1]}`);
            endDate.setHours(23, 59, 59, 999);
            if (targetDateObj > endDate) isFutureOutOfRange = true;
        }
    }
    if (!isFutureOutOfRange && firstRange && typeof firstRange === 'string') {
        const parts = firstRange.split('~').map(s => s.trim());
        if (parts.length >= 1) {
            const startDate = new Date(`20${parts[0]}`);
            startDate.setHours(0, 0, 0, 0);
            if (targetDateObj < startDate) isPastOutOfRange = true;
        }
    }

    // 3. timetable_archive 조회 (과거 주 및 저장된 주차 우선 매칭)
    if (db) {
        try {
            await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_archive (
                date_range TEXT PRIMARY KEY,
                response_json TEXT NOT NULL,
                saved_at TEXT DEFAULT (datetime('now'))
            )`).run();

            const archiveRows = await db.prepare("SELECT date_range, response_json FROM timetable_archive").all();
            for (const row of (archiveRows.results || [])) {
                const rangeStr = row.date_range as string;
                if (isDateInRange(targetShort, rangeStr)) {
                    try {
                        const parsed = JSON.parse(row.response_json as string);
                        const sDate = parsed['시작일'] ? parsed['시작일'].substring(2) : '';
                        // 아카이브 시작일이 해당 날짜 구간과 일치하는 정상 데이터인지 검증
                        if (sDate && isDateInRange(sDate, rangeStr)) {
                            const isPast = isPastOutOfRange || (firstRange && targetDateObj < new Date(`20${firstRange.split('~')[0].trim()}`));
                            return {
                                rawData: parsed,
                                rawJson: row.response_json as string,
                                isOutOfRange: false,
                                isPastOutOfRange: false,
                                isFutureOutOfRange: false,
                                isArchivedData: !!isPast,
                                matchedArchiveRange: rangeStr
                            };
                        }
                    } catch (_) {}
                }
            }
        } catch (e) {
            console.warn('[resolveWeeklyRawData] Error querying timetable_archive:', e);
        }
    }

    // 4. 아카이브에 없거나 구형 데이터인 경우, 컴시간 일자자료에서 매칭되는 주차(r) 탐색
    if (dateArrNew && Array.isArray(dateArrNew)) {
        for (const item of dateArrNew) {
            if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number') {
                const [rNum, rangeStr] = item;
                if (isDateInRange(targetShort, rangeStr)) {
                    if (rNum === 1) {
                        // 현재 주차 r=1: primaryRaw가 바로 현재 주차
                        if (db) {
                            try {
                                await db.prepare("INSERT OR REPLACE INTO timetable_archive (date_range, response_json, saved_at) VALUES (?, ?, datetime('now'))").bind(rangeStr, primaryJson).run();
                            } catch (_) {}
                        }
                        return {
                            rawData: primaryRaw,
                            rawJson: primaryJson,
                            isOutOfRange: false,
                            isPastOutOfRange: false,
                            isFutureOutOfRange: false,
                            isArchivedData: false,
                            matchedArchiveRange: rangeStr
                        };
                    } else {
                        // 다음 주차 등 미래 유효 주차 (r=2 등): 컴시간에 해당 주차 데이터 직접 요청
                        try {
                            const rJson = await fetchComciganRawData(rNum);
                            const rRaw = JSON.parse(rJson);
                            if (db) {
                                try {
                                    await db.prepare("INSERT OR REPLACE INTO timetable_archive (date_range, response_json, saved_at) VALUES (?, ?, datetime('now'))").bind(rangeStr, rJson).run();
                                } catch (_) {}
                            }
                            return {
                                rawData: rRaw,
                                rawJson: rJson,
                                isOutOfRange: false,
                                isPastOutOfRange: false,
                                isFutureOutOfRange: false,
                                isArchivedData: false,
                                matchedArchiveRange: rangeStr
                            };
                        } catch (fetchErr) {
                            console.warn(`[resolveWeeklyRawData] Failed to fetch r=${rNum} for ${rangeStr}:`, fetchErr);
                        }
                    }
                }
            }
        }
    }

    // 5. 아카이브와 컴시간 제공 범위 밖의 날짜 (미래 초과 또는 미보관 과거)
    const isOutOfRange = isFutureOutOfRange || isPastOutOfRange;
    return {
        rawData: primaryRaw,
        rawJson: primaryJson,
        isOutOfRange,
        isPastOutOfRange,
        isFutureOutOfRange,
        isArchivedData: false,
        matchedArchiveRange: null
    };
}

export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');
    const method = context.request.method;

    try {
        // POST method is strictly disabled to enforce caching architecture
        if (method === 'POST') {
            return new Response(JSON.stringify({ error: "Direct POST fetch is disabled. Use GET /api/comcigan?type=timetable to enforce cache usage." }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }

        // GET method: Return teacher timetable specifically
        if (type === 'teacher_timetable') {
            const targetDate = url.searchParams.get('targetDate');
            const resolved = await resolveWeeklyRawData(context.env?.DB, targetDate, undefined, true);
            const rawData = resolved.rawData;
            const isOutOfRange = resolved.isOutOfRange;
            const isArchivedData = resolved.isArchivedData;

            if (!rawData) {
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: "Cached timetable raw data not available. Please wait for background refresh." 
                }), { status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
            }

            // ── 교사/과목/시간표 키를 동적으로 탐지 ──────────────────────────────────────────
            const rawKeys = Object.keys(rawData);

            // 교사 배열
            const detectedTeacherProp = rawKeys.find(k =>
                Array.isArray(rawData[k]) && rawData[k].some((s: any) => typeof s === 'string' && s.endsWith('*'))
            ) ?? null;

            // 과목 배열
            const subjectKeywords = ["국어", "수학", "영어", "한국사", "체육", "음악", "미술", "진로", "문학", "정보", "화학", "생물", "물리", "지리", "역사", "경제", "정치", "사회", "과학", "통합사회", "통합과학"];
            const detectedSubjectProp = rawKeys.find(k => {
                if (k === detectedTeacherProp) return false;
                const val = rawData[k];
                if (!Array.isArray(val)) return false;
                let cnt = 0;
                for (let i = 0; i < Math.min(val.length, 100); i++) {
                    if (typeof val[i] === 'string' && subjectKeywords.some(kw => val[i].includes(kw))) {
                        if (++cnt >= 2) return true;
                    }
                }
                return false;
            }) ?? null;

            // 4D 학급 시간표 배열: val[grade][class][weekday][period] (Array 4차원만 정확히 필터)
            const timetableProps = rawKeys.filter(k => {
                const val = rawData[k];
                return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]) && val[1][1][1] && Array.isArray(val[1][1][1]);
            });

            // 기준 표준 데이터셋(targetBaseId) 탐색: 번호가 가장 큰 4D 배열 (자료481)
            let baselineDatasetId = "";
            if (timetableProps.length > 0) {
                const maxKeyItem = timetableProps.reduce((max, key) => {
                    const num = parseInt(key.replace('자료', ''), 10) || 0;
                    return num > max.num ? { key, num } : max;
                }, { key: timetableProps[0], num: -1 });
                baselineDatasetId = maxKeyItem.key;
            }
            const targetBaseId = baselineDatasetId || timetableProps[0] || "";

            // 해당 주차의 실제 시간표 데이터셋(timedataProp):
            // targetBaseId가 아니면서 실제 수업 데이터가 존재하는 4D 배열 (자료147)
            let timedataProp = targetBaseId;
            if (!isOutOfRange) {
                const activeProp = timetableProps.find(k => {
                    if (k === targetBaseId) return false;
                    const d = rawData[k];
                    if (!d) return false;
                    for (let g = 1; g <= 3; g++) {
                        if (!d[g]) continue;
                        for (const cls of Object.keys(d[g])) {
                            if (parseInt(cls, 10) <= 0) continue;
                            for (let w = 1; w <= 5; w++) {
                                const arr = d[g][cls]?.[w];
                                if (Array.isArray(arr) && arr.some((v: any) => v !== 0)) return true;
                            }
                        }
                    }
                    return false;
                });
                if (activeProp) timedataProp = activeProp;
            }

            // 교사 및 과목 목록
            const teachers = detectedTeacherProp ? (rawData[detectedTeacherProp] || []) : [];
            const subjects = detectedSubjectProp ? (rawData[detectedSubjectProp] || []) : [];
            const bunri = rawData['분리'] !== undefined ? rawData['분리'] : 100;

            // 4D 학급 시간표로부터 교사 3D 시간표 재구성 헬퍼
            const buildTeacherTimetable = (classData: any, numTeachers: number) => {
                const grid: any[] = [];
                for (let t = 0; t <= numTeachers; t++) {
                    grid.push([5, [0], [0], [0], [0], [0]]);
                }
                const changedFromPrefix = new Set<string>();
                let hasAnyData = false;
                if (!classData) return { grid, changedFromPrefix, hasAnyData };

                for (let g = 1; g <= 3; g++) {
                    const gData = classData[g];
                    if (!gData) continue;
                    for (const cls of Object.keys(gData)) {
                        const cNum = parseInt(cls, 10);
                        if (!cNum || cNum <= 0) continue;
                        for (let w = 1; w <= 5; w++) {
                            const dayArr = gData[cNum][w];
                            if (!Array.isArray(dayArr)) continue;
                            for (let p = 1; p < dayArr.length; p++) {
                                const v = dayArr[p];
                                if (!v) continue;
                                const isPrefixed = typeof v === 'string' && v.startsWith('>');
                                const code = typeof v === 'string' ? parseInt(v.replace(/>/g, ''), 10) : (v || 0);
                                if (!code) continue;
                                hasAnyData = true;

                                let tIdx = 0, sIdx = 0;
                                if (bunri === 100) {
                                    tIdx = Math.floor(code / bunri);
                                    sIdx = code % bunri;
                                } else {
                                    tIdx = code % bunri;
                                    sIdx = Math.floor(code / bunri);
                                }

                                if (tIdx > 0 && tIdx <= numTeachers) {
                                    while (grid[tIdx][w].length <= p) grid[tIdx][w].push(0);
                                    grid[tIdx][w][0] = Math.max(grid[tIdx][w][0] || 0, p);
                                    const teacherCode = sIdx * 1000 + g * 100 + cNum;
                                    grid[tIdx][w][p] = teacherCode;
                                    if (isPrefixed) {
                                        changedFromPrefix.add(`${tIdx}:${w}:${p}`);
                                    }
                                }
                            }
                        }
                    }
                }
                return { grid, changedFromPrefix, hasAnyData };
            };

            const baseRecon = buildTeacherTimetable(rawData[targetBaseId], teachers.length);
            const targetRecon = buildTeacherTimetable(rawData[timedataProp], teachers.length);

            // 해당 주차 3D 교사 시간표 (자료542 등)의 '>' 접두사 마커도 함께 통합
            const teacherScheduleProp = rawKeys.find(k => {
                if (k === detectedTeacherProp || k === detectedSubjectProp || timetableProps.includes(k)) return false;
                const v = rawData[k];
                return Array.isArray(v) && v.length >= teachers.length - 2 && v.length <= teachers.length + 2 && v[1] && Array.isArray(v[1]);
            });
            if (teacherScheduleProp && rawData[teacherScheduleProp]) {
                const dTeacher = rawData[teacherScheduleProp];
                for (let t = 1; t <= Math.min(teachers.length, dTeacher.length - 1); t++) {
                    const teacherArr = dTeacher[t];
                    if (!Array.isArray(teacherArr)) continue;
                    for (let w = 1; w <= 5; w++) {
                        const dayArr = teacherArr[w];
                        if (!Array.isArray(dayArr)) continue;
                        for (let p = 1; p < dayArr.length; p++) {
                            const v = dayArr[p];
                            if (typeof v === 'string' && v.startsWith('>')) {
                                targetRecon.changedFromPrefix.add(`${t}:${w}:${p}`);
                            }
                        }
                    }
                }
            }

            // 해당 주차 데이터셋이 비어있거나 outOfRange이면 표준 기준 시간표로 폴백
            const effectiveTargetGrid = (!isOutOfRange && targetRecon.hasAnyData) ? targetRecon.grid : baseRecon.grid;
            const changedCellSet = new Set<string>();

            // 대상 주차와 기준 시간표 비교하여 변경 셀 계산
            if (!isOutOfRange && targetRecon.hasAnyData && timedataProp !== targetBaseId) {
                // 1. 컴시간 자체 '>' 접두사 마커 반영
                for (const k of targetRecon.changedFromPrefix) {
                    changedCellSet.add(k);
                }
                // 2. 기준 시간표와 코드 비교 (대강, 교환, 취소, 이동 자동 감지)
                const maxT = Math.max(baseRecon.grid.length, targetRecon.grid.length);
                for (let t = 1; t < maxT; t++) {
                    for (let w = 1; w <= 5; w++) {
                        const liveDay = targetRecon.grid[t]?.[w] || [];
                        const baseDay = baseRecon.grid[t]?.[w] || [];
                        const maxP = Math.max(liveDay.length, baseDay.length);
                        for (let p = 1; p < maxP; p++) {
                            const liveCode = liveDay[p] || 0;
                            const baseCode = baseDay[p] || 0;
                            if (liveCode !== baseCode) {
                                changedCellSet.add(`${t}:${w}:${p}`);
                            }
                        }
                    }
                }
            }

            return new Response(JSON.stringify({
                success: !!(detectedTeacherProp && detectedSubjectProp && targetBaseId),
                teachers,
                subjects,
                timetable: effectiveTargetGrid,
                baseTimetable: baseRecon.grid,
                changedCells: Array.from(changedCellSet),
                datasetId: timedataProp,
                targetBaseId,
                isOutOfRange,
                isArchivedData,
                _detectedKeys: { teacher: detectedTeacherProp, subject: detectedSubjectProp, timetable: timedataProp, base: targetBaseId }
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // GET method: Return timetable
        if (type === 'timetable') {
            const grade = parseInt(url.searchParams.get('grade') || '1');
            const classNumStr = url.searchParams.get('classNum');
            const datasetOverride = url.searchParams.get('dataset');
            const targetDate = url.searchParams.get('targetDate');
            const classNum = classNumStr === 'all' ? 'all' : parseInt(classNumStr || '1');
            
            // Get Client IP
            const clientIp = context.request.headers.get('CF-Connecting-IP') || 'unknown';
            const db = context.env ? context.env.DB : undefined;

            let cachedRawDataString: string | undefined = undefined;
            let isStale = false;
            if (db) {
                try {
                    const batchRes = await db.batch([
                        db.prepare("SELECT response_json, updated_at FROM timetable_cache WHERE cache_key = 'raw_data'"),
                        db.prepare("SELECT value FROM system_settings WHERE key = 'comcigan_cache_max_age_minutes'")
                    ]);

                    const rawDataRow = batchRes[0].results?.[0];
                    if (rawDataRow && rawDataRow.response_json) {
                        let cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS;
                        
                        const maxAgeRow = batchRes[1].results?.[0];
                        if (maxAgeRow && maxAgeRow.value) {
                            cacheMaxAgeMs = parseInt(maxAgeRow.value as string) * 60 * 1000;
                        }
                        
                        const age = Date.now() - new Date((rawDataRow.updated_at as string || "").replace(' ', 'T') + 'Z').getTime();
                        if (age >= cacheMaxAgeMs) {
                            isStale = true;
                        }
                        cachedRawDataString = rawDataRow.response_json as string;
                        console.log(`[Comcigan Cache] raw_data read via batch, age=${Math.round(age/1000)}s, stale=${isStale}`);
                    }
                } catch (e) { }
            }

            // getTimetable with allowLiveFetch = true to resolve targetDate week
            const response = await getTimetable(grade, classNum, db, datasetOverride, clientIp, targetDate, cachedRawDataString, true);
            
            if (response.status === 503 && db) {
                // Completely empty cache + live fetching disabled
                console.warn(`[Comcigan Cache] Cache completely empty for Grade ${grade}. Triggering background refresh...`);
                context.waitUntil(
                    refreshCache(db, grade, targetDate).catch((e: any) => console.error('[Comcigan Cache] Background refresh on 503 miss failed:', e))
                );
                
                // Return a graceful empty response to prevent frontend crashes or hanging
                return new Response(JSON.stringify({
                    success: true,
                    cached: true,
                    isPending: true,
                    data: [],
                    message: "캐시가 비어있어 백그라운드에서 시간표를 갱신 중입니다. 잠시 후 상단의 새로고침을 클릭해주세요.",
                    datasetId: datasetOverride || 'PENDING',
                    ipOverrideApplied: false
                }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            if (isStale && db) {
                // Background update
                context.waitUntil(
                    refreshCache(db, grade, targetDate).catch((e: any) => console.error('[Comcigan Cache] Background refresh failed:', e))
                );
            }

            return response;
        }

        return new Response('Invalid type or method', { status: 400 });
    } catch (err: any) {
        console.error('[Comcigan API] Error:', err);
        return new Response(JSON.stringify({
            error: err.message,
            stack: err.stack?.split('\n').slice(0, 5).join('\n') // Truncate stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function getTimetable(grade: number, classNumInput: number | 'all', db?: any, datasetOverride?: string | null, clientIp: string = 'unknown', targetDate?: string | null, cachedRawDataString?: string, allowLiveFetch: boolean = true) {
    let ipOverrideApplied: string | false = false;

    // 1. 주차별/날짜별 raw_data 해석 (선생님 페이지와 동일한 통합 함수 활용)
    const resolved = await resolveWeeklyRawData(db, targetDate, cachedRawDataString, allowLiveFetch);
    if (!resolved.rawData) {
        if (!allowLiveFetch) {
            console.warn(`[getTimetable] Cache MISS & live fetch disabled for targetDate=${targetDate}. Returning 503.`);
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Cache miss and live Comcigan fetch is disabled for user requests.", 
                data: [] 
            }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error("Failed to load Comcigan timetable data");
    }

    const rawData = resolved.rawData;
    const jsonString = resolved.rawJson;
    let isOutOfRange = resolved.isOutOfRange;
    let isPastOutOfRange = resolved.isPastOutOfRange;
    let isFutureOutOfRange = resolved.isFutureOutOfRange;
    let isArchivedData = resolved.isArchivedData;
    let matchedArchiveDateRange = resolved.matchedArchiveRange;

    // 2. '>' 접두사 사전 수집 (컴시간의 대강/시간표 변경 마커 보존)
    const prefixedCells = new Set<string>();
    for (const key of Object.keys(rawData)) {
        if (key.startsWith('자료') && rawData[key]) {
            const val = rawData[key];
            if (Array.isArray(val) && val[grade] && typeof val[grade] === 'object') {
                for (const cls of Object.keys(val[grade])) {
                    const cNum = parseInt(cls);
                    if (isNaN(cNum) || cNum <= 0) continue;
                    const cData = val[grade][cNum];
                    if (!cData || !Array.isArray(cData)) continue;
                    for (let w = 1; w <= 5; w++) {
                        const wData = cData[w];
                        if (!wData || !Array.isArray(wData)) continue;
                        for (let p = 1; p < wData.length; p++) {
                            if (typeof wData[p] === 'string' && wData[p].startsWith('>')) {
                                prefixedCells.add(`${grade}:${cNum}:${w}:${p}`);
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. rawData sanitize
    const sanitizeTimetable = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val === 'string' && val.startsWith('>')) {
                obj[key] = parseInt(val.replace(/>/g, ''), 10) || 0;
            } else if (typeof val === 'object') {
                sanitizeTimetable(val);
            }
        }
    };
    for (const key of Object.keys(rawData)) {
        if (key.startsWith('자료') && rawData[key]) {
            sanitizeTimetable(rawData[key]);
        }
    }

    // 4. 교사, 과목, 4D 학급 시간표 프로퍼티 탐색
    const keys = Object.keys(rawData);
    const teacherProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].some((s: any) => typeof s === 'string' && s.endsWith('*'))) || "";

    const keywords = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학", "체육", "음악", "미술", "진로", "운동", "독서", "문학", "일본어", "중국어", "정보", "화학", "생물", "물리", "지리", "역사", "경제", "정치", "사회", "과학", "기술"];
    let subjectProp = keys.find(k => {
        if (k === teacherProp) return false;
        const val = rawData[k];
        if (!Array.isArray(val)) return false;
        let matchCount = 0;
        for (let i = 0; i < Math.min(val.length, 100); i++) {
            if (typeof val[i] === 'string' && keywords.some(kw => val[i].includes(kw))) {
                matchCount++;
                if (matchCount >= 2) return true;
            }
        }
        return false;
    }) || "";

    if (!subjectProp) {
        const stringArrays = keys.filter(k => k !== teacherProp && Array.isArray(rawData[k]) && typeof rawData[k][0] === 'string');
        stringArrays.sort((a, b) => rawData[b].length - rawData[a].length);
        if (stringArrays.length > 0) subjectProp = stringArrays[0];
    }

    // 엄격한 4D 배열만 필터 (val[grade][classNum][weekday][period])
    const timetableProps = keys.filter(k => {
        const val = rawData[k];
        return Array.isArray(val) && val[grade] && val[grade][1] && Array.isArray(val[grade][1]) && Array.isArray(val[grade][1][1]);
    });

    // 5. 기준 baseline 데이터셋 (4D 배열 중 최대 번호, 예: 자료481)
    let targetBaseId = "";
    if (timetableProps.length > 0) {
        targetBaseId = timetableProps.reduce((max, k) => {
            const num = parseInt(k.replace('자료', '')) || 0;
            return num > max.num ? { key: k, num } : max;
        }, { key: timetableProps[0], num: -1 }).key;
    }

    // 6. 시스템 설정(DB) 조회 (선택과목/수동 계획/IP 오버라이드 등)
    let timedataProp = "";
    let datasetSelected: string | null = null;
    let designatedDatasetId: string | null = null;
    let datasetSelectedGrade1: string | null = null;
    let finalDataset: string | null = null;
    let manualPlanData: any = null;
    let fallbackDataset: string | null = null;
    let fallbackDatasetGrade1: string | null = null;

    if (db) {
        try {
            await db.prepare(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `).run();

            const { results } = await db.prepare("SELECT key, value FROM system_settings WHERE key = 'comcigan_dataset_selected' OR key = 'comcigan_dataset_selected_grade1' OR key = 'manual_semester_plan' OR key = 'dataset_ip_overrides' OR key = 'comcigan_fallback_dataset' OR key = 'comcigan_fallback_dataset_grade1'").all();

            let ipOverridesFound: Record<string, { grade1?: string, default?: string, memo?: string }> = {};

            if (results && results.length > 0) {
                results.forEach((row: any) => {
                    if (row.key === 'comcigan_dataset_selected') datasetSelected = row.value;
                    if (row.key === 'comcigan_dataset_selected_grade1') datasetSelectedGrade1 = row.value;
                    if (row.key === 'comcigan_fallback_dataset') fallbackDataset = row.value;
                    if (row.key === 'comcigan_fallback_dataset_grade1') fallbackDatasetGrade1 = row.value;
                    if (row.key === 'dataset_ip_overrides') {
                        try {
                            ipOverridesFound = JSON.parse(row.value);
                        } catch (e) {}
                    }
                    if (row.key === 'manual_semester_plan') {
                        try {
                            manualPlanData = JSON.parse(row.value);
                        } catch (e) {}
                    }
                });
            }

            const effectiveDatasetNoOverride = grade === 1
                ? (datasetSelectedGrade1 === null ? datasetSelected : datasetSelectedGrade1)
                : datasetSelected;

            finalDataset = effectiveDatasetNoOverride;

            if (clientIp !== 'unknown' && ipOverridesFound[clientIp]) {
                const overrideConfig = ipOverridesFound[clientIp];
                if (grade === 1) {
                    if (overrideConfig.grade1 !== undefined && overrideConfig.grade1 !== null) {
                        finalDataset = overrideConfig.grade1;
                    }
                } else {
                    if (overrideConfig.default !== undefined && overrideConfig.default !== null) {
                        finalDataset = overrideConfig.default;
                    }
                }
            }

            if (clientIp !== 'unknown' && ipOverridesFound[clientIp] && finalDataset !== effectiveDatasetNoOverride) {
                ipOverrideApplied = grade === 1 ? "1학년" : "2/3학년";
            }

            if (datasetOverride && datasetOverride !== '_auto_' && datasetOverride !== 'COMCIGAN') {
                datasetSelected = datasetOverride;
            } else {
                datasetSelected = finalDataset;
            }

            designatedDatasetId = datasetSelected;
        } catch (e) {
            console.warn("[Comcigan Debug] Failed to read system_settings", e);
        }
    }

    // 7. timedataProp 결정
    let isFallbackApplied = false;
    if (isOutOfRange) {
        if (designatedDatasetId && designatedDatasetId !== '_auto_' && (timetableProps.includes(designatedDatasetId) || designatedDatasetId === 'MANUAL_PLAN')) {
            timedataProp = designatedDatasetId;
        } else if (finalDataset && finalDataset !== '_auto_' && (timetableProps.includes(finalDataset) || finalDataset === 'MANUAL_PLAN')) {
            timedataProp = finalDataset;
        } else {
            timedataProp = targetBaseId || timetableProps[0] || "";
        }
        isFallbackApplied = true;
    } else if (datasetSelected === 'MANUAL_PLAN') {
        timedataProp = 'MANUAL_PLAN';
    } else if (datasetSelected && datasetSelected !== '_auto_' && timetableProps.includes(datasetSelected)) {
        timedataProp = datasetSelected;
    } else {
        // 자동 선택: 실제 수업 데이터가 존재하는 4D 배열 중 targetBaseId가 아닌 주차별 데이터셋(예: 자료147)을 우선 선택
        const liveProps = timetableProps.filter(k => {
            if (k === targetBaseId) return false;
            const d = rawData[k];
            if (!d || !d[grade]) return false;
            for (const cls of Object.keys(d[grade])) {
                if (parseInt(cls) <= 0) continue;
                for (let w = 1; w <= 5; w++) {
                    const dw = d[grade][cls]?.[w];
                    if (Array.isArray(dw) && dw.some((v: any) => v !== 0)) return true;
                }
            }
            return false;
        });
        if (liveProps.length > 0) {
            timedataProp = liveProps[0];
        } else {
            timedataProp = targetBaseId || timetableProps[0] || "";
            isFallbackApplied = true;
        }
    }

    let originalDatasetId = null;
    let explicitRef = typeof designatedDatasetId !== 'undefined' ? designatedDatasetId : datasetSelected;
    if (explicitRef && explicitRef !== 'MANUAL_PLAN' && explicitRef !== '_auto_' && timetableProps.includes(explicitRef)) {
        originalDatasetId = explicitRef;
    } else if (explicitRef === 'MANUAL_PLAN') {
        originalDatasetId = 'MANUAL_PLAN';
    } else {
        originalDatasetId = targetBaseId || timetableProps[0] || "";
    }

    // 수동 시간표 처리
    if (timedataProp === 'MANUAL_PLAN') {
        const result: any[] = [];
        let classList: number[] = [];
        if (classNumInput === 'all') {
            if (manualPlanData?.timetables) {
                classList = Object.keys(manualPlanData.timetables)
                    .filter(key => key.startsWith(`${grade}-`))
                    .map(key => parseInt(key.split('-')[1]));
            }
        } else {
            classList = [classNumInput as number];
        }

        for (const cls of classList) {
            const classPlan = manualPlanData?.timetables?.[`${grade}-${cls}`];
            if (classPlan) {
                for (const [key, subjectStr] of Object.entries(classPlan)) {
                    const [weekdayStr, periodStr] = key.split('-');
                    const weekday = parseInt(weekdayStr);
                    const period = parseInt(periodStr);
                    const subjectValue = subjectStr as string;

                    let subject = subjectValue;
                    let teacher = "";
                    const parts = subjectValue.split(' ');
                    if (parts.length > 1) {
                        subject = parts[0];
                        teacher = parts.slice(1).join(' ');
                    }

                    if (subjectValue) {
                        result.push({
                            grade,
                            class: cls,
                            weekday,
                            classTime: period,
                            subject,
                            teacher
                        });
                    }
                }
            }
        }

        return new Response(JSON.stringify({
            schoolName: "부산성지고등학교 (수동 시간표)",
            datasetId: "MANUAL_PLAN",
            ipOverrideApplied,
            data: result,
            debugTokens: { manualPlan: true }
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (!timedataProp) throw new Error("Data key not found");

    const teachers = rawData[teacherProp] || [];
    const subjects = rawData[subjectProp] || [];
    const data = rawData[timedataProp];
    const baseData = targetBaseId ? rawData[targetBaseId] : null;
    const bunri = rawData['분리'] !== undefined ? rawData['분리'] : 100;
    const timeInfoProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].length === 8 && typeof rawData[k][1] === 'number');
    const timeInfo = timeInfoProp ? rawData[timeInfoProp] : null;

    if (!data || !data[grade]) {
        throw new Error(`Data not found for G${grade}`);
    }

    let isEmptyDataset = true;
    for (const cls of Object.keys(data[grade])) {
        if (parseInt(cls) > 0) {
            for (let w = 1; w <= 5; w++) {
                if (data[grade][cls]?.[w]) {
                    for (let p = 1; p < data[grade][cls][w].length; p++) {
                        if (data[grade][cls][w][p] !== 0) {
                            isEmptyDataset = false;
                            break;
                        }
                    }
                }
                if (!isEmptyDataset) break;
            }
        }
        if (!isEmptyDataset) break;
    }

    const classesToProcess = classNumInput === 'all'
        ? Object.keys(data[grade]).filter(k => !isNaN(parseInt(k)) && parseInt(k) > 0).map(Number)
        : [classNumInput as number];

    const result: any[] = [];

    for (const classNum of classesToProcess) {
        if (!data[grade][classNum]) continue;
        const classData = data[grade][classNum];

        for (let weekday = 1; weekday <= 5; weekday++) {
            let currentPeriodLimit = 0;
            if (classData[weekday] && Array.isArray(classData[weekday])) {
                currentPeriodLimit = Math.min(classData[weekday][0] || 0, classData[weekday].length - 1);
            }

            let basePeriodLimit = 0;
            if (baseData && baseData[grade]?.[classNum]?.[weekday]) {
                const bWeekday = baseData[grade][classNum][weekday];
                if (Array.isArray(bWeekday)) {
                    basePeriodLimit = Math.min(bWeekday[0] || 0, bWeekday.length - 1);
                }
            }

            const loopLimit = Math.max(currentPeriodLimit, basePeriodLimit);

            let isDayEmpty = true;
            if (classData[weekday] && Array.isArray(classData[weekday])) {
                for (let p = 1; p < classData[weekday].length; p++) {
                    if (classData[weekday][p] !== 0) {
                        isDayEmpty = false;
                        break;
                    }
                }
            }

            for (let period = 1; period <= loopLimit; period++) {
                let code = (classData[weekday] && classData[weekday][period]) ? classData[weekday][period] : 0;
                let isChanged = false;

                if (baseData && baseData[grade]?.[classNum]?.[weekday]) {
                    const baseCode = baseData[grade][classNum][weekday][period] || 0;
                    if (code === 0 && baseCode !== 0) {
                        if (isEmptyDataset || !isDayEmpty) {
                            code = baseCode;
                        }
                    }

                    const cellKey = `${grade}:${classNum}:${weekday}:${period}`;
                    const isPrefixed = prefixedCells.has(cellKey);
                    if (((baseCode !== code && timedataProp !== targetBaseId) || isPrefixed) && timedataProp !== targetBaseId) {
                        isChanged = true;
                    }
                }

                if (!code && !isChanged) continue;

                let subject = "";
                let teacher = "";
                if (code) {
                    let teacherIdx = 0;
                    let subjectIdx = 0;
                    if (bunri === 100) {
                        teacherIdx = Math.floor(code / bunri);
                        subjectIdx = code % bunri;
                    } else {
                        teacherIdx = code % bunri;
                        subjectIdx = Math.floor(code / bunri);
                    }
                    subject = subjects[subjectIdx] ? subjects[subjectIdx].replace(/_/g, "") : "";
                    teacher = teachers[teacherIdx] || "";
                }

                if (subject || isChanged) {
                    let baseSubject = subject;
                    let baseTeacher = teacher;
                    if (baseData && baseData[grade]?.[classNum]?.[weekday]) {
                        const baseCode = baseData[grade][classNum][weekday][period] || 0;
                        if (baseCode) {
                            let bTeacherIdx = 0, bSubjectIdx = 0;
                            if (bunri === 100) {
                                bTeacherIdx = Math.floor(baseCode / bunri);
                                bSubjectIdx = baseCode % bunri;
                            } else {
                                bTeacherIdx = baseCode % bunri;
                                bSubjectIdx = Math.floor(baseCode / bunri);
                            }
                            baseSubject = subjects[bSubjectIdx] ? subjects[bSubjectIdx].replace(/_/g, "") : "";
                            baseTeacher = teachers[bTeacherIdx] || "";
                        } else {
                            baseSubject = "";
                            baseTeacher = "";
                        }
                    }

                    result.push({
                        grade,
                        class: classNum,
                        weekday: weekday - 1,
                        classTime: period,
                        subject,
                        teacher,
                        isChanged,
                        baseSubject,
                        baseTeacher,
                    });
                }
            }
        }
    }

    return new Response(JSON.stringify({
        schoolName: "부산성지고등학교",
        datasetId: timedataProp,
        originalDatasetId,
        ipOverrideApplied: typeof ipOverrideApplied !== 'undefined' ? ipOverrideApplied : false,
        isOutOfRange,
        isArchivedData,
        matchedArchiveRange: matchedArchiveDateRange,
        data: result,
        debugTokens: { 
            override1: datasetSelectedGrade1 || null, 
            override23: typeof datasetSelected !== 'undefined' ? datasetSelected : null,
            isFallbackApplied,
            isEmptyDataset,
            isFutureOutOfRange,
            isPastOutOfRange,
            keysCount: keys.length,
            teacherProp,
            subjectProp,
            timetableProps,
            timedataProp,
            targetBaseId,
            bunri,
            hasData: !!(data && data[grade]),
            subjectsCount: subjects.length,
            teachersCount: teachers.length
        }
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30, s-maxage=60'
        }
    });
}

// --- 캐시 헬퍼 함수 ---

/**
 * 컴시간에서 최신 raw_data(r=1, r=2 등 모든 주차)를 직접 fetch해
 * timetable_cache 및 timetable_archive에 주차별로 동기화한다.
 */
async function refreshCache(db: any, grade: number = 1, targetDate?: string | null) {
    console.log(`[Cache] refreshCache: fetching live multi-week data from Comcigan ...`);

    if (!db) return;

    try {
        await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_archive (
            date_range TEXT PRIMARY KEY,
            response_json TEXT NOT NULL,
            saved_at TEXT DEFAULT (datetime('now'))
        )`).run();
        await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_cache (cache_key TEXT PRIMARY KEY, response_json TEXT NOT NULL, dataset_id TEXT, updated_at TEXT DEFAULT (datetime('now')))`).run();

        // 1. 이번 주 (r=1) fetch
        const r1Json = await fetchComciganRawData(1);
        const r1Raw = JSON.parse(r1Json);

        // 2. raw_data 캐시 갱신
        await db.prepare(`
            INSERT INTO timetable_cache (cache_key, response_json, updated_at)
            VALUES ('raw_data', ?, datetime('now'))
            ON CONFLICT(cache_key) DO UPDATE SET
                response_json = CASE WHEN timetable_cache.is_frozen = 1 THEN timetable_cache.response_json ELSE excluded.response_json END,
                updated_at    = CASE WHEN timetable_cache.is_frozen = 1 THEN timetable_cache.updated_at    ELSE datetime('now')            END
        `).bind(r1Json).run();

        // 3. 일자자료 순회하며 모든 주차(r=1, r=2, ...)를 timetable_archive에 동기화
        const dateList = r1Raw['일자자료'];
        if (dateList && Array.isArray(dateList)) {
            for (const item of dateList) {
                if (!Array.isArray(item) || item.length < 2) continue;
                const [rNum, rangeStr] = item;
                if (typeof rNum !== 'number' || typeof rangeStr !== 'string') continue;

                try {
                    let weekJson = r1Json;
                    if (rNum > 1) {
                        weekJson = await fetchComciganRawData(rNum);
                    }
                    await db.prepare(
                        "INSERT OR REPLACE INTO timetable_archive (date_range, response_json, saved_at) VALUES (?, ?, datetime('now'))"
                    ).bind(rangeStr, weekJson).run();
                    console.log(`[Cache] refreshCache: archive synced for r=${rNum} (${rangeStr})`);
                } catch (rErr) {
                    console.warn(`[Cache] refreshCache: failed for r=${rNum}:`, rErr);
                }
            }
        }
    } catch (e) {
        console.error('[Cache] refreshCache failed:', e);
    }

    console.log('[Cache] refreshCache: multi-week sync done.');
}

export { refreshCache, getTimetable };

