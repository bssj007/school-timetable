
/**
 * Cloudflare Pages Function - 부산성지고등학교 전용 컴시간알리미 API
 * 
 * Target: http://comci.net:4082/36179?NzM2MjlfOTMzNDJfMF8x (Verified Golden URL)
 */

const GOLDEN_URL = "http://comci.net:4082/36179?NzM2MjlfOTMzNDJfMF8x";

const PROXIES = [
    '', // Priority 1: Direct Connection
    'https://corsproxy.io/?' // Priority 2: Proxy
];

async function decodeResponse(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    let text = decoder.decode(buffer);
    return text.replace(/\0/g, '');
}

async function fetchWithProxy(targetUrl: string) {
    let lastError;
    for (const proxy of PROXIES) {
        try {
            const fullUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
            const isDirect = proxy === '';

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'http://comci.kr/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            };

            // console.log(`Fetching (${isDirect ? 'Direct' : 'Proxy'}): ${fullUrl}`);
            const response = await fetch(fullUrl, { headers });

            if (response.ok) return response;
            console.warn(`Request failed with status ${response.status}`);
        } catch (e) {
            console.warn(`Request failed (${proxy}):`, e);
            lastError = e;
        }
    }
    throw lastError || new Error('All connection attempts failed');
}

export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');

    try {
        if (type === 'timetable') {
            const grade = parseInt(url.searchParams.get('grade') || '0');
            const classNum = parseInt(url.searchParams.get('classNum') || '0');

            // Use the Golden URL directly
            return await getBusanSeongjiTimetable(grade, classNum);
        }
        return new Response('Invalid type', { status: 400 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function getBusanSeongjiTimetable(grade: number, classNum: number) {
    // Step 1: Fetch Data from Golden URL
    const response = await fetchWithProxy(GOLDEN_URL);
    const text = await decodeResponse(response);
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf("}") + 1);

    let rawData;
    try {
        rawData = JSON.parse(jsonString);
    } catch (e) {
        throw new Error("Failed to parse JSON from Golden URL");
    }

    // Step 2: Parse Timetable Data
    // (Reusing the robust parsing logic)
    let subjectProp = "";
    let teacherProp = "";
    let timedataProp = "";

    const firstNames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장"];

    for (const k of Object.keys(rawData)) {
        const val = rawData[k];
        if (typeof val === "object" && k.indexOf("자료") !== -1) {
            if (k.indexOf("긴") !== -1) {
                subjectProp = k;
            } else if (Array.isArray(val)) {
                let matchCount = 0;
                val.forEach((name: any) => {
                    if (typeof name === 'string' && firstNames.some(f => name.startsWith(f))) matchCount++;
                });

                if (matchCount > 5) teacherProp = k;
                if (val[grade] && val[grade][classNum] && val[grade][classNum][1]) timedataProp = k;
            }
        }
    }

    // Fallbacks
    if (!subjectProp || !teacherProp) {
        const stringArrays = Object.values(rawData).filter(v => Array.isArray(v) && typeof v[0] === 'string') as string[][];
        stringArrays.sort((a, b) => b.length - a.length);
        if (!subjectProp && stringArrays.length > 0) subjectProp = Object.keys(rawData).find(key => rawData[key] === stringArrays[0]) || "";
        if (!teacherProp && stringArrays.length > 1) teacherProp = Object.keys(rawData).find(key => rawData[key] === stringArrays[1]) || "";
    }

    if (!timedataProp) {
        for (const k of Object.keys(rawData)) {
            const val = rawData[k];
            if (Array.isArray(val) && val[grade] && val[grade][classNum] && Array.isArray(val[grade][classNum])) {
                timedataProp = k;
                break;
            }
        }
    }

    const teachers = rawData[teacherProp] || [];
    const subjects = rawData[subjectProp] || [];
    const data = rawData[timedataProp];
    const timeInfo = rawData["요일별시수"]; // This might be missing or named differently

    if (!data || !data[grade] || !data[grade][classNum]) {
        throw new Error(`데이터가 없습니다 (Grade: ${grade}, Class: ${classNum}). 학년/반 정보를 확인해주세요.`);
    }

    const classData = data[grade][classNum];
    const result: any[] = [];

    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayHours = (timeInfo && timeInfo[grade]) ? timeInfo[grade][weekday] : 7;
        for (let period = 1; period <= dayHours; period++) {
            const code = classData[weekday][period];
            if (!code) continue;

            const strCode = code.toString();
            let teacherIdx = 0;
            let subjectIdx = 0;

            if (strCode.length === 3) {
                teacherIdx = parseInt(strCode.substring(0, 1));
                subjectIdx = parseInt(strCode.substring(1));
            } else if (strCode.length === 4) {
                teacherIdx = parseInt(strCode.substring(0, 2));
                subjectIdx = parseInt(strCode.substring(2));
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

    return new Response(JSON.stringify({
        schoolName: "부산성지고등학교",
        data: result
    }), { headers: { 'Content-Type': 'application/json' } });
}
