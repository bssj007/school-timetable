
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

export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');
    const method = context.request.method;

    try {
        // POST method: Simple fetch and return without DB save
        if (method === 'POST') {
            const body = await context.request.json();
            const { schoolName, grade, classNum } = body;

            console.log('[Comcigan API] POST request:', { schoolName, grade, classNum });

            // Just fetch the timetable and return it
            // D1 save will be handled client-side or later
            const timetableResponse = await getTimetable(grade, classNum, context.env ? context.env.DB : undefined);
            const timetableJson: any = await timetableResponse.json();

            return new Response(JSON.stringify({
                success: true,
                message: `${schoolName || '부산성지고등학교'} ${grade}학년 ${classNum}반 시간표를 가져왔습니다.`,
                count: timetableJson.data?.length || 0,
                data: timetableJson.data
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // GET method: Return teacher timetable specifically
        if (type === 'teacher_timetable') {
            let rawData;
            try {
                // Fetch live raw data directly
                const prefix = await getPrefix();
                const { code1, code2 } = await getSchoolCode(prefix);
                const param = `${prefix}${code2}_0_1`;
                const b64 = btoa(param);
                const targetUrl = `${BASE_URL}/${code1}?${b64}`;

                const jsonText = await fetchWithProxy(targetUrl, HEADERS, false);
                const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
                rawData = JSON.parse(jsonString);
            } catch (e: any) {
                console.error("[Teacher Timetable] Failed to fetch raw data:", e);
                return new Response(JSON.stringify({ error: "Failed to fetch Comcigan data", details: e.message }), { status: 500 });
            }

            if (!rawData) {
                return new Response(JSON.stringify({ error: "Failed to parse Comcigan data" }), { status: 500 });
            }

            return new Response(JSON.stringify({
                success: true,
                teachers: rawData['자료446'] || [],
                subjects: rawData['자료492'] || [],
                timetable: rawData['자료542'] || []
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

            // --- 캐시 우선 응답 ---
            if (db) {
                try {
                    // 캐시 테이블 보장
                    try { await db.prepare(createTimetableCacheTable).run(); } catch (_) {}

                    // 캐시 최대 유효 시간 조회 (system_settings)
                    let cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS;
                    try {
                        const maxAgeRow = await db.prepare("SELECT value FROM system_settings WHERE key = 'comcigan_cache_max_age_minutes'").first();
                        if (maxAgeRow && maxAgeRow.value) {
                            cacheMaxAgeMs = parseInt(maxAgeRow.value as string) * 60 * 1000;
                        }
                    } catch (_) {}

                    let cacheKey = targetDate ? `gc_${grade}_${targetDate}` : `gc_${grade}`;

                    // 미리 IP Override 여부를 확인하여 캐시키를 고립시킴
                    let hasIpOverride = false;
                    if (clientIp !== 'unknown') {
                        try {
                            const overrideRow = await db.prepare("SELECT value FROM system_settings WHERE key = 'dataset_ip_overrides'").first();
                            if (overrideRow && overrideRow.value) {
                                const overrides = JSON.parse(overrideRow.value as string);
                                if (overrides[clientIp]) {
                                    hasIpOverride = true;
                                }
                            }
                        } catch (_) {}
                    }

                    if (datasetOverride && datasetOverride !== '_auto_') {
                        cacheKey += `__dataset_${datasetOverride}`;
                    } else if (hasIpOverride) {
                        cacheKey += `__ip_${clientIp.replace(/[:.]/g, '_')}`;
                    }

                    const cacheRow = await db.prepare("SELECT response_json, dataset_id, updated_at, is_frozen FROM timetable_cache WHERE cache_key = ?").bind(cacheKey).first();

                    if (cacheRow && cacheRow.response_json) {
                        const isFrozen = cacheRow.is_frozen === 1;
                        const cacheAge = Date.now() - new Date(cacheRow.updated_at as string + 'Z').getTime();
                        const isFresh = isFrozen || cacheAge < cacheMaxAgeMs;

                        console.log(`[Comcigan Cache] HIT: ${cacheKey}, age=${Math.round(cacheAge / 1000)}s, fresh=${isFresh}, frozen=${isFrozen}`);

                        // 캐시에서 데이터를 재구성 (classNum 필터링 + IP override 재적용)
                        const cachedData = JSON.parse(cacheRow.response_json as string);
                        const cacheResponse = buildCacheResponse(cachedData, classNum, db, datasetOverride, clientIp, cacheRow.dataset_id as string, cacheAge);

                        if (!isFresh) {
                            // 백그라운드에서 갱신
                            context.waitUntil(
                                refreshCache(db, grade, targetDate).catch((e: any) => console.error('[Comcigan Cache] Background refresh failed:', e))
                            );
                        }

                        return await cacheResponse;
                    }

                    console.log(`[Comcigan Cache] MISS: ${cacheKey}`);
                } catch (e) {
                    console.warn('[Comcigan Cache] Cache lookup failed, falling through to direct fetch:', e);
                }
            }

            // --- 캐시 미스: 기존 방식으로 직접 가져오거나 raw_data 캐시 우회 사용 ---
            let cachedRawDataString: string | undefined = undefined;
            if (db) {
                try {
                    const rawDataRow = await db.prepare("SELECT response_json, updated_at FROM timetable_cache WHERE cache_key = 'raw_data'").first();
                    if (rawDataRow && rawDataRow.response_json) {
                        let cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS;
                        try {
                            const maxAgeRow = await db.prepare("SELECT value FROM system_settings WHERE key = 'comcigan_cache_max_age_minutes'").first();
                            if (maxAgeRow && maxAgeRow.value) {
                                cacheMaxAgeMs = parseInt(maxAgeRow.value as string) * 60 * 1000;
                            }
                        } catch (_) {}
                        
                        const age = Date.now() - new Date(rawDataRow.updated_at as string + 'Z').getTime();
                        if (age < cacheMaxAgeMs) {
                            cachedRawDataString = rawDataRow.response_json as string;
                            console.log(`[Comcigan Cache] raw_data HIT, age=${Math.round(age/1000)}s - By-passing HTTP Fetch`);
                        }
                    }
                } catch (e) { }
            }

            const response = await getTimetable(grade, classNum, db, datasetOverride, clientIp, targetDate, cachedRawDataString);
            
            // 성공 시 캐시 저장 (백그라운드)
            if (db && response.status === 200) {
                // Determine the isolated cacheKey again for saving
                let cacheKeyToSave = targetDate ? `gc_${grade}_${targetDate}` : `gc_${grade}`;
                
                let hasIpOverride = false;
                if (clientIp !== 'unknown') {
                    try {
                        const overrideRow = await db.prepare("SELECT value FROM system_settings WHERE key = 'dataset_ip_overrides'").first();
                        if (overrideRow && overrideRow.value) {
                            const overrides = JSON.parse(overrideRow.value as string);
                            if (overrides[clientIp]) hasIpOverride = true;
                        }
                    } catch (_) {}
                }

                if (datasetOverride && datasetOverride !== '_auto_') {
                    cacheKeyToSave += `__dataset_${datasetOverride}`;
                } else if (hasIpOverride) {
                    cacheKeyToSave += `__ip_${clientIp.replace(/[:.]/g, '_')}`;
                }

                const responseClone = response.clone();
                context.waitUntil(
                    (async () => {
                        try {
                            const json: any = await responseClone.json();
                            if (json.data && json.data.length > 0) {
                                // 일반 캐시 저장 로직
                                // 캐시에는 전체 학년의 all-class 데이터를 저장
                                if (classNum === 'all' || json.data.length > 10) {
                                    await saveTimetableCache(db, grade, json, targetDate, cacheKeyToSave);
                                }
                            }
                        } catch (e) {
                            console.error('[Comcigan Cache] Failed to save cache:', e);
                        }
                    })()
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

async function getTimetable(grade: number, classNumInput: number | 'all', db?: any, datasetOverride?: string | null, clientIp: string = 'unknown', targetDate?: string | null, cachedRawDataString?: string) {
    let ipOverrideApplied: string | false = false;
    let jsonString = cachedRawDataString;

    // --- FUTURE BOUNDARY STALE CHECK ---
    // If the frontend legitimately requests a date that exceeds the maximum timeline of our currently
    // cached Comcigan payload, aggressively discard the raw cache to prevent the auto-fallback algorithm 
    // from blindly attaching itself to the final index of a stale array.
    if (jsonString && targetDate) {
        try {
            const tempRaw = JSON.parse(jsonString);
            const dateArr = tempRaw['일자'];
            const dateArrNew = tempRaw['일자자료'];
            let lastRange = null;
            
            if (dateArr && Array.isArray(dateArr) && dateArr.length > 0) {
                lastRange = dateArr[dateArr.length - 1]; // e.g. "26-03-23 ~ 26-03-28"
            } else if (dateArrNew && Array.isArray(dateArrNew) && dateArrNew.length > 0) {
                const lastItem = dateArrNew[dateArrNew.length - 1]; // e.g. [2, "26-03-30 ~ 26-04-04"]
                lastRange = Array.isArray(lastItem) ? lastItem[1] : lastItem;
            }
            
            if (lastRange && typeof lastRange === 'string') {
                const parts = lastRange.split('~').map(s => s.trim());
                if (parts.length >= 2) {
                    const endDate = new Date(`20${parts[1]}`);
                    endDate.setHours(23, 59, 59, 999);
                    const targetShort = targetDate.length > 8 ? targetDate.substring(2) : targetDate;
                    const targetDateObj = new Date(`20${targetShort}`);
                    
                    if (targetDateObj > endDate) {
                        console.log(`[Comcigan Debug] targetDate ${targetShort} exceeds cached raw_data max date ${parts[1]}. Bypassing raw_data cache.`);
                        jsonString = undefined; 
                    }
                }
            }
        } catch (e) {
            console.warn('[Comcigan Debug] Failed to evaluate raw_data date expiration boundary', e);
        }
    }

    if (!jsonString) {
        const prefix = await getPrefix();
        const { code1, code2 } = await getSchoolCode(prefix);

        // Always fetch grade 1's parameter to avoid Comcigan server corruption where fetching grade 2 breaks the Thursday data
        const param = `${prefix}${code2}_0_1`;
        const b64 = btoa(param);
        const targetUrl = `${BASE_URL}/${code1}?${b64}`;

        const jsonText = await fetchWithProxy(targetUrl, HEADERS, false);
        jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
    }
    
    // raw_data caching moved to the end of the function to ensure data integrity
    
    const rawData = JSON.parse(jsonString);

    const keys = Object.keys(rawData);
    const teacherProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].some((s: any) => typeof s === 'string' && s.endsWith('*'))) || "";

    const keywords = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학", "체육", "음악", "미술", "진로", "운동", "독서", "문학", "일본어", "중국어", "정보", "화학", "생물", "물리", "지리", "역사", "경제", "정치", "사회", "과학", "기술"];
    let subjectProp = keys.find(k => {
        if (k === teacherProp) return false; // 교사 배열은 후보에서 제외
        const val = rawData[k];
        if (!Array.isArray(val)) return false;
        let matchCount = 0;
        for (let i = 0; i < Math.min(val.length, 100); i++) {
            if (typeof val[i] === 'string' && keywords.some(kw => val[i].includes(kw))) {
                matchCount++;
                if (matchCount >= 2) return true; // 2개 이상 키워드 매칭 시 확정
            }
        }
        return false;
    }) || "";

    if (!subjectProp) {
        const stringArrays = keys.filter(k => k !== teacherProp && Array.isArray(rawData[k]) && typeof rawData[k][0] === 'string');
        stringArrays.sort((a, b) => rawData[b].length - rawData[a].length);
        if (stringArrays.length > 0) subjectProp = stringArrays[0];
    }

    const timetableProps = keys.filter(k => {
        const val = rawData[k];
        // Just check if class 1 exists for the grade to find the timedata property
        return Array.isArray(val) && val[grade] && val[grade][1] && Array.isArray(val[grade][1]);
    });
    // Comcigan usually returns original timetable first (e.g. 자료481) and changed daily timetable later. 
    // Sometimes the last element is an empty matrix of zeros for future use.
    // Pick the last one that actually has non-zero values in its class 1 timetable.
    let timedataProp = "";
    let datasetSelected: string | null = null;
    let designatedDatasetId: string | null = null;
    let datasetSelectedGrade1: string | null = null;
    let fallbackSelectedGrade1: string | null = null;
    let fallbackSelectedGen: string | null = null;

    if (db) {
        try {
            // Ensure table exists just in case
            await db.prepare(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `).run();

            const { results } = await db.prepare("SELECT key, value FROM system_settings WHERE key = 'comcigan_dataset_selected' OR key = 'comcigan_dataset_selected_grade1' OR key = 'manual_semester_plan' OR key = 'dataset_ip_overrides' OR key = 'comcigan_fallback_dataset' OR key = 'comcigan_fallback_dataset_grade1'").all();

            let manualPlanData: any = null;
            let ipOverridesFound: Record<string, { grade1?: string, default?: string, memo?: string }> = {};

            if (results && results.length > 0) {
                results.forEach((row: any) => {
                    if (row.key === 'comcigan_dataset_selected') datasetSelected = row.value;
                    if (row.key === 'comcigan_dataset_selected_grade1') datasetSelectedGrade1 = row.value;
                    if (row.key === 'comcigan_fallback_dataset') fallbackSelectedGen = row.value;
                    if (row.key === 'comcigan_fallback_dataset_grade1') fallbackSelectedGrade1 = row.value;
                    if (row.key === 'dataset_ip_overrides') {
                        try {
                            ipOverridesFound = JSON.parse(row.value);
                            console.log(`[Comcigan Debug] Loaded IP Overrides:`, !!ipOverridesFound);
                        } catch (e) {
                            console.error("Failed to parse dataset_ip_overrides", e);
                        }
                    }
                    if (row.key === 'manual_semester_plan') {
                        try {
                            manualPlanData = JSON.parse(row.value);
                        } catch (e) {
                            console.error("Failed to parse manual_semester_plan", e);
                        }
                    }
                });
            }

            // Determine what the effective dataset WOULD BE without IP overrides
            const effectiveDatasetNoOverride = grade === 1
                ? (datasetSelectedGrade1 === null ? datasetSelected : datasetSelectedGrade1)
                : datasetSelected;

            let finalDataset: string | null = effectiveDatasetNoOverride;

            // 1. Check IP Override first
            if (clientIp !== 'unknown' && ipOverridesFound[clientIp]) {
                const overrideConfig = ipOverridesFound[clientIp];
                console.log(`[Comcigan Debug] Applying IP Override for ${clientIp}:`, overrideConfig);
                
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

            // Check if the IP override actually changed the active dataset for the CURRENTLY REQUESTED grade
            if (clientIp !== 'unknown' && ipOverridesFound[clientIp] && finalDataset !== effectiveDatasetNoOverride) {
                ipOverrideApplied = grade === 1 ? "1학년" : "2/3학년";
            }

            if (datasetOverride && datasetOverride !== '_auto_' && datasetOverride !== 'COMCIGAN') {
                datasetSelected = datasetOverride; // From the dashboard manual selector
            } else {
                datasetSelected = finalDataset;
            }

            designatedDatasetId = datasetSelected;

            if (datasetSelected === 'MANUAL_PLAN') {
                console.log(`[Comcigan Debug] Using MANUAL_PLAN dataset`);

                // Parse the manual plan for the requested grade and class
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
                            // key is "weekday-period", e.g. "0-2" (Monday 2nd period)
                            const [weekdayStr, periodStr] = key.split('-');
                            const weekday = parseInt(weekdayStr);
                            const period = parseInt(periodStr);
                            const subjectValue = subjectStr as string;

                            // Let's try to extract teacher if it's "Subj Name". Basically split by space.
                            let subject = subjectValue;
                            let teacher = "";
                            const parts = subjectValue.split(' ');
                            if (parts.length > 1) {
                                subject = parts[0];
                                teacher = parts.slice(1).join(' '); // in case name has spaces
                            }

                            if (subjectValue) {
                                result.push({
                                    grade,
                                    class: cls,
                                    weekday, // already 0-indexed in our manual planner
                                    classTime: period,
                                    subject,
                                    teacher
                                });
                            }
                        }
                    }
                }

                if (result.length > 0) {
                    return new Response(JSON.stringify({
                        schoolName: "부산성지고등학교 (수동 시간표)",
                        datasetId: "MANUAL_PLAN",
                        ipOverrideApplied,
                        data: result,
                        debugTokens: { manualPlan: true }
                    }), { headers: { 'Content-Type': 'application/json' } });
                } else {
                    console.warn(`[Comcigan Debug] MANUAL_PLAN selected but no data found for G${grade} C${classNumInput}. Falling back to normal.`);
                }

            }
        } catch (e) {
            console.warn("[Comcigan Debug] Failed to read system_settings for dataset selection", e);
        }
    }

    // ----------------------------------------------------
    // STRICT BOUNDARY FALLBACK CASCADE (Temp User Request)
    // ----------------------------------------------------
    const isDateInRange = (targetDateStr: string, rangeStr: any): boolean => {
        if (typeof rangeStr !== 'string') return false;
        const targetShort = targetDateStr.length > 8 ? targetDateStr.substring(2) : targetDateStr;
        const parts = rangeStr.split('~').map(s => s.trim());
        if (parts.length < 2) return rangeStr.startsWith(targetShort);
        const startDate = new Date(`20${parts[0]}`);
        const endDate = new Date(`20${parts[1]}`);
        const target = new Date(`20${targetShort}`);
        endDate.setHours(23, 59, 59, 999);
        return target >= startDate && target <= endDate;
    };

    let fallbackSelected = null;
    if (grade === 1 && fallbackSelectedGrade1) {
        fallbackSelected = fallbackSelectedGrade1;
    } else {
        fallbackSelected = fallbackSelectedGen;
    }

    const koreanTime = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    // When no targetDate is provided and today is a weekend (Sat=6, Sun=0),
    // advance to next Monday so we match the upcoming week's dataset range.
    const dayOfWeek = koreanTime.getUTCDay(); // UTC day since koreanTime is already offset
    if (!targetDate && (dayOfWeek === 6 || dayOfWeek === 0)) {
        const daysToAdd = dayOfWeek === 6 ? 2 : 1; // Sat->Mon=+2, Sun->Mon=+1
        koreanTime.setUTCDate(koreanTime.getUTCDate() + daysToAdd);
        console.log(`[Comcigan Debug] Weekend detected (day=${dayOfWeek}), advancing target to Monday: ${koreanTime.toISOString().split('T')[0]}`);
    }
    const todayShort = koreanTime.toISOString().split('T')[0].substring(2); // "YY-MM-DD"
    const targetShort = targetDate ? (targetDate.length > 8 ? targetDate.substring(2) : targetDate) : todayShort;

    let isFallbackApplied = false;
    let datasetDateRanges: Record<string, string> = {};
    
    // Always build the date ranges map first
    if (rawData['일자'] && Array.isArray(rawData['일자'])) {
        const allDatasetKeys = Object.keys(rawData).filter(k => k.startsWith('자료') && !isNaN(parseInt(k.replace('자료', ''))));
        allDatasetKeys.forEach((key, idx) => {
            if (idx + 1 < rawData['일자'].length) {
                datasetDateRanges[key] = rawData['일자'][idx + 1];
            }
        });
    } else if (rawData['일자자료'] && Array.isArray(rawData['일자자료'])) {
        const dateList = rawData['일자자료'];
        dateList.forEach((dt: any) => {
            if (!Array.isArray(dt) || dt.length < 2) return;
            const [directIdx, range] = dt;
            if (typeof directIdx === 'number' && timetableProps[directIdx]) {
                datasetDateRanges[timetableProps[directIdx]] = range;
            }
        });
    }

    if (datasetSelected && datasetSelected !== 'MANUAL_PLAN' && datasetSelected !== '_auto_') {
        const rangeStr = datasetDateRanges[datasetSelected];
        let covers = false;
        
        if (rangeStr) {
            covers = isDateInRange(targetShort, rangeStr);
        }

        if (covers) {
            timedataProp = datasetSelected;
            console.log(`[Comcigan Debug] datasetSelected ${datasetSelected} covers ${targetShort}`);
        } else {
            console.log(`[Comcigan Debug] datasetSelected ${datasetSelected} does NOT cover ${targetShort}. Applying explicit fallback.`);
            if (fallbackSelected && fallbackSelected !== '_auto_' && timetableProps.includes(fallbackSelected)) {
                timedataProp = fallbackSelected;
            } else {
                timedataProp = timetableProps[0] || "";
            }
            isFallbackApplied = true;
        }
    } else if (datasetSelected === 'MANUAL_PLAN') {
        timedataProp = 'MANUAL_PLAN';
    } else {
        console.log(`[Comcigan Debug] No concrete datasetSelected found. Auto-applying dynamic date resolution.`);
        
        let matchedDataset = null;
        for (const [key, rangeStr] of Object.entries(datasetDateRanges)) {
            if (isDateInRange(targetShort, rangeStr)) {
                matchedDataset = key;
                break;
            }
        }

        if (matchedDataset) {
            timedataProp = matchedDataset;
            console.log(`[Comcigan Debug] Auto-resolved to ${matchedDataset} for date ${targetShort}`);
        } else {
            console.log(`[Comcigan Debug] No dataset matches date ${targetShort}. Applying explicit fallback.`);
            if (fallbackSelected && fallbackSelected !== '_auto_' && timetableProps.includes(fallbackSelected)) {
                timedataProp = fallbackSelected;
            } else {
                timedataProp = timetableProps[0] || "";
            }
            isFallbackApplied = true;
        }
    }

    // Anchor originalDatasetId explicitly
    let originalDatasetId = null;
    let explicitRef = typeof designatedDatasetId !== 'undefined' ? designatedDatasetId : datasetSelected;
    
    if (explicitRef && explicitRef !== 'MANUAL_PLAN' && explicitRef !== '_auto_' && timetableProps.includes(explicitRef)) {
        originalDatasetId = explicitRef;
    } else if (explicitRef === 'MANUAL_PLAN') {
        originalDatasetId = 'MANUAL_PLAN';
    } else {
        if (fallbackSelected && fallbackSelected !== '_auto_' && timetableProps.includes(fallbackSelected)) {
            originalDatasetId = fallbackSelected;
        } else {
            originalDatasetId = timetableProps[0];
        }
    }

    console.log('[Comcigan Debug] keys:', keys.length, 'teacherProp:', teacherProp, 'subjectProp:', subjectProp);
    console.log('[Comcigan Debug] timetableProps:', timetableProps, 'selected timedataProp:', timedataProp);

    if (!timedataProp) throw new Error("Data key not found");

    const teachers = rawData[teacherProp] || [];
    const subjects = rawData[subjectProp] || [];
    const data = rawData[timedataProp];
    const baseData = timetableProps.length > 0 ? rawData[timetableProps[0]] : null;
    const bunri = rawData['분리'] !== undefined ? rawData['분리'] : 100; // Get bunri value
    const timeInfoProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].length === 8 && typeof rawData[k][1] === 'number');

    console.log('[Comcigan Debug] data for grade', grade, 'is array?', Array.isArray(data[grade]));
    const timeInfo = timeInfoProp ? rawData[timeInfoProp] : null;

    console.log('[Comcigan] 분리:', bunri, 'teachers:', teachers.length, 'subjects:', subjects.length);

    if (!data || !data[grade]) {
        throw new Error(`Data not found for G${grade}`);
    }

    let isEmptyDataset = true;
    for (const cls of Object.keys(data[grade])) {
        if (parseInt(cls) > 0) {
             for(let w=1; w<=5; w++){
                 if(data[grade][cls][w]){
                     for(let p=1; p<data[grade][cls][w].length; p++){
                         if(data[grade][cls][w][p] !== 0) {
                             isEmptyDataset = false;
                             break;
                         }
                     }
                 }
                 if(!isEmptyDataset) break;
             }
        }
        if(!isEmptyDataset) break;
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
            if (baseData && baseData[grade] && baseData[grade][classNum] && baseData[grade][classNum][weekday]) {
                const bWeekday = baseData[grade][classNum][weekday];
                if (Array.isArray(bWeekday)) {
                    basePeriodLimit = Math.min(bWeekday[0] || 0, bWeekday.length - 1);
                }
            }

            const loopLimit = Math.max(currentPeriodLimit, basePeriodLimit);

            for (let period = 1; period <= loopLimit; period++) {
                let code = (classData[weekday] && classData[weekday][period]) ? classData[weekday][period] : 0;

                let isChanged = false;
                if (baseData && baseData[grade] && baseData[grade][classNum] && baseData[grade][classNum][weekday]) {
                    const baseCode = baseData[grade][classNum][weekday][period] || 0;
                    
                    // 컴시간알리미 클라이언트의 셀 수준 폴백(Cell-level Fallback) 로직:
                    // 주간 변동 데이터셋(자료147, 자료245 등)에서 값이 `0`으로 비어 있다면, 
                    // 이는 "휴강"이 아니라 "해당 교시는 원본 스케줄(자료481 등)을 그대로 따른다"는 의미입니다.
                    if (code === 0 && baseCode !== 0) {
                        code = baseCode;
                    }
                    
                    if (baseCode !== code && timedataProp !== timetableProps[0]) {
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
                    result.push({
                        grade,
                        class: classNum,
                        weekday: weekday - 1, // Convert to 0-indexed (0=Mon, 4=Fri)
                        classTime: period,
                        subject, // Empty string if cancelled
                        teacher,
                        isChanged
                    });
                }
            }
        }
    }

    const samples: any[] = [];
    if (data && data[grade]) {
        const cls = Object.keys(data[grade]).find(k => parseInt(k) > 0);
        if (cls) {
            for (let w = 1; w <= 5; w++) {
                if (data[grade][cls][w]) {
                    for (let p = 1; p <= 4; p++) {
                        const code = data[grade][cls][w][p];
                        if (code) samples.push(code);
                    }
                }
                if (samples.length >= 5) break;
            }
        }
    }

    const parsedSamples = samples.map(code => {
        let tIdx = 0, sIdx = 0;
        if (bunri === 100) {
            tIdx = Math.floor(code / bunri);
            sIdx = code % bunri;
        } else {
            tIdx = code % bunri;
            sIdx = Math.floor(code / bunri);
        }
        return {
            code,
            tIdx,
            sIdx,
            subj: subjects[sIdx] || "(none)",
            teacher: teachers[tIdx] || "(none)",
            alt_sIdx: code % bunri,
            alt_tIdx: Math.floor(code / bunri),
            alt_subj: subjects[code % bunri] || "(none)",
            alt_teacher: teachers[Math.floor(code / bunri)] || "(none)"
        };
    });

    if (db && !isEmptyDataset && !isFallbackApplied) {
        try {
            await db.prepare(`CREATE TABLE IF NOT EXISTS timetable_cache (cache_key TEXT PRIMARY KEY, response_json TEXT NOT NULL, dataset_id TEXT, updated_at TEXT DEFAULT (datetime('now')))`).run();
            await db.prepare(`
                INSERT INTO timetable_cache (cache_key, response_json, updated_at) 
                VALUES ('raw_data', ?, datetime('now')) 
                ON CONFLICT(cache_key) DO UPDATE SET 
                    response_json = CASE WHEN timetable_cache.is_frozen = 1 THEN timetable_cache.response_json ELSE excluded.response_json END,
                    updated_at = CASE WHEN timetable_cache.is_frozen = 1 THEN timetable_cache.updated_at ELSE datetime('now') END
            `).bind(jsonString).run();
        } catch (e) {
            console.error('[Comcigan Debug] Failed to cache raw_data (deferred):', e);
        }
    }

    return new Response(JSON.stringify({
        schoolName: "부산성지고등학교",
        datasetId: timedataProp,
        originalDatasetId,
        ipOverrideApplied: typeof ipOverrideApplied !== 'undefined' ? ipOverrideApplied : false,
        data: result,
        debugTokens: { 
            override1: datasetSelectedGrade1 || null, 
            override23: typeof datasetSelected !== 'undefined' ? datasetSelected : null,
            fallback1: fallbackSelectedGrade1 || null, 
            fallback23: fallbackSelectedGen || null, 
            isFallbackApplied,
            isEmptyDataset,
            keysCount: keys.length,
            teacherProp,
            subjectProp,
            timetableProps,
            timedataProp,
            bunri,
            timeInfoProp,
            hasData: !!(data && data[grade]),
            bunriLogic: bunri === 100 ? "100" : "other",
            subjectsCount: subjects.length,
            teachersCount: teachers.length,
            parsedSamples
        }
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30, s-maxage=60'
        }
    });
}

// --- 캐시 헬퍼 함수 ---

async function saveTimetableCache(db: any, grade: number, responseData: any, targetDate?: string | null, cacheKeyOverride?: string) {
    const cacheKey = cacheKeyOverride || (targetDate ? `gc_${grade}_${targetDate}` : `gc_${grade}`);
    try {
        await db.prepare(createTimetableCacheTable).run().catch(() => {});
        try { await db.prepare("ALTER TABLE timetable_cache ADD COLUMN is_frozen INTEGER DEFAULT 0").run(); } catch(e) {}
        
        await db.prepare(`
            INSERT INTO timetable_cache (cache_key, response_json, dataset_id, updated_at) 
            VALUES (?, ?, ?, datetime('now')) 
            ON CONFLICT(cache_key) DO UPDATE SET 
                response_json = CASE WHEN timetable_cache.is_frozen = 1 THEN timetable_cache.response_json ELSE excluded.response_json END,
                dataset_id = CASE WHEN timetable_cache.is_frozen = 1 THEN timetable_cache.dataset_id ELSE excluded.dataset_id END,
                updated_at = CASE WHEN timetable_cache.is_frozen = 1 THEN timetable_cache.updated_at ELSE datetime('now') END
        `).bind(cacheKey, JSON.stringify(responseData), responseData.datasetId || '').run();
        console.log(`[Comcigan Cache] Saved: ${cacheKey}, items=${responseData.data?.length || 0}`);
    } catch (e) {
        console.error(`[Comcigan Cache] Save failed for ${cacheKey}:`, e);
    }
}

async function refreshCache(db: any, grade: number, targetDate?: string | null) {
    console.log(`[Comcigan Cache] Refreshing cache for grade ${grade} / date ${targetDate || 'default'}...`);
    const response = await getTimetable(grade, 'all', db, null, 'cache-refresh', targetDate, undefined);
    if (response.status === 200) {
        const json: any = await response.json();
        if (json.data && json.data.length > 0) {
            await saveTimetableCache(db, grade, json, targetDate);
        }
    }
}

async function buildCacheResponse(
    cachedData: any,
    classNum: number | 'all',
    db: any,
    datasetOverride: string | null | undefined,
    clientIp: string,
    cachedDatasetId: string,
    cacheAgeMs: number
): Promise<Response> {
    // 캐시 키가 이미 IP 오버라이드나 강제 지정자를 반영하여 분리되었으므로,
    // cachedData 내부에 본래 포함된 ipOverrideApplied 상태를 그대로 신뢰함.
    let ipOverrideApplied = cachedData.ipOverrideApplied || false;

    // classNum 필터링 적용
    let filteredData = cachedData.data || [];
    if (classNum !== 'all' && typeof classNum === 'number') {
        filteredData = filteredData.filter((item: any) => item.class === classNum);
    }

    return new Response(JSON.stringify({
        schoolName: cachedData.schoolName || "부산성지고등학교",
        datasetId: cachedData.datasetId || cachedDatasetId,
        ipOverrideApplied,
        data: filteredData,
        cached: true,
        cacheAgeSec: Math.round(cacheAgeMs / 1000),
        debugTokens: cachedData.debugTokens
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=10, s-maxage=30',
            'X-Cache-Status': 'HIT',
            'X-Cache-Age': String(Math.round(cacheAgeMs / 1000))
        }
    });
}

// 외부에서 호출 가능하도록 export (for _scheduled.ts)
export { refreshCache, saveTimetableCache };
