
/**
 * Cloudflare Pages Function - 부산성지고등학교 전용 컴시간알리미 API
 * 
 * Flow:
 * 1. Connect to /st to get Dynamic Prefix
 * 2. Try School Search / Fallback to Static Code
 * 3. Fetch Timetable
 */

const BASE_URL = "http://comci.net:4082";
const SEARCH_HEX = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"; // 부산성지고 EUC-KR Hex
const FALLBACK_CODE2 = "93342"; // Known correct code for Busan Seongji

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
            const timetableResponse = await getTimetable(grade, classNum);
            const timetableJson = await timetableResponse.json();

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

        // GET method: Return timetable
        if (type === 'timetable') {
            const grade = parseInt(url.searchParams.get('grade') || '1');
            const classNumStr = url.searchParams.get('classNum');
            const classNum = classNumStr === 'all' ? 'all' : parseInt(classNumStr || '1');
            return await getTimetable(grade, classNum);
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

async function getTimetable(grade: number, classNumInput: number | 'all') {
    const prefix = await getPrefix();
    const { code1, code2 } = await getSchoolCode(prefix);

    const param = `${prefix}${code2}_0_${grade}`;
    const b64 = btoa(param);
    const targetUrl = `${BASE_URL}/${code1}?${b64}`;

    const jsonText = await fetchWithProxy(targetUrl, HEADERS, false);
    const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
    const rawData = JSON.parse(jsonString);

    const keys = Object.keys(rawData);
    const teacherProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].some((s: any) => typeof s === 'string' && s.endsWith('*'))) || "";

    const keywords = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학", "체육", "음악", "미술", "진로", "운동", "독서", "문학"];
    let subjectProp = keys.find(k => {
        const val = rawData[k];
        if (!Array.isArray(val)) return false;
        for (let i = 0; i < Math.min(val.length, 100); i++) {
            if (typeof val[i] === 'string' && keywords.some(kw => val[i].includes(kw))) return true;
        }
        return false;
    }) || "";

    if (!subjectProp) {
        const stringArrays = keys.filter(k => k !== teacherProp && Array.isArray(rawData[k]) && typeof rawData[k][0] === 'string');
        stringArrays.sort((a, b) => rawData[b].length - rawData[a].length);
        if (stringArrays.length > 0) subjectProp = stringArrays[0];
    }

    const timedataProp = keys.find(k => {
        const val = rawData[k];
        // Just check if class 1 exists for the grade to find the timedata property
        return Array.isArray(val) && val[grade] && val[grade][1] && Array.isArray(val[grade][1]);
    }) || "";

    if (!timedataProp) throw new Error("Data key not found");

    const teachers = rawData[teacherProp] || [];
    const subjects = rawData[subjectProp] || [];
    const data = rawData[timedataProp];
    const bunri = rawData['분리'] !== undefined ? rawData['분리'] : 100; // Get bunri value
    const timeInfoProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].length === 8 && typeof rawData[k][1] === 'number');
    const timeInfo = timeInfoProp ? rawData[timeInfoProp] : null;

    console.log('[Comcigan] 분리:', bunri, 'teachers:', teachers.length, 'subjects:', subjects.length);

    if (!data || !data[grade]) {
        throw new Error(`Data not found for G${grade}`);
    }

    const classesToProcess = classNumInput === 'all'
        ? Object.keys(data[grade]).filter(k => !isNaN(parseInt(k)) && parseInt(k) > 0).map(Number)
        : [classNumInput as number];

    const result: any[] = [];

    for (const classNum of classesToProcess) {
        if (!data[grade][classNum]) continue;
        const classData = data[grade][classNum];

        for (let weekday = 1; weekday <= 5; weekday++) {
            let dayHours = 7;
            if (timeInfo && timeInfo[grade]) {
                dayHours = timeInfo[grade][weekday];
            }

            const maxPeriod = classData[weekday] ? classData[weekday].length - 1 : 0;
            const loopLimit = Math.min(dayHours, maxPeriod);

            for (let period = 1; period <= loopLimit; period++) {
                const code = classData[weekday][period];
                if (!code) continue;

                let teacherIdx = 0;
                let subjectIdx = 0;

                // Based on bunri value (same logic as server comcigan-parser.ts)
                if (bunri === 100) {
                    teacherIdx = Math.floor(code / bunri);
                    subjectIdx = code % bunri;
                } else { // bunri === 1000 or other
                    teacherIdx = code % bunri;
                    subjectIdx = Math.floor(code / bunri);
                }

                const subject = subjects[subjectIdx] ? subjects[subjectIdx].replace(/_/g, "") : "";
                const teacher = teachers[teacherIdx] || "";

                if (subject) {
                    result.push({
                        grade,
                        class: classNum,
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
        schoolName: "부산성지고등학교",
        data: result
    }), { headers: { 'Content-Type': 'application/json' } });
}
