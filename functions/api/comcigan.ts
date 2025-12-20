
/**
 * Cloudflare Pages Function - 부산성지고등학교 전용 컴시간알리미 API
 * 
 * Target: http://comci.net:4082/36179?NzM2MjlfOTMzNDJfMF8x (Verified Golden URL)
 * Encoding: UTF-8
 */

const GOLDEN_URL = "http://comci.net:4082/36179?NzM2MjlfOTMzNDJfMF8x";

const PROXIES = [
    '',
    'https://corsproxy.io/?'
];

async function decodeResponse(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    let text = decoder.decode(buffer);
    return text.replace(/\0/g, '');
}

async function fetchWithProxy(targetUrl: string) {
    let lastError;
    for (const proxy of PROXIES) {
        try {
            const fullUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'http://comci.kr/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            };
            const response = await fetch(fullUrl, { headers });
            if (response.ok) return response;
        } catch (e) {
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
    // 1. Fetch
    const response = await fetchWithProxy(GOLDEN_URL);
    const text = await decodeResponse(response);
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf("}") + 1);
    const rawData = JSON.parse(jsonString);

    // 2. Identify Keys
    let subjectProp = "";
    let teacherProp = "";
    let timedataProp = "";

    const keys = Object.keys(rawData);

    // Find Teacher Key: Array of strings, contains names ending with '*'
    teacherProp = keys.find(k =>
        Array.isArray(rawData[k]) &&
        rawData[k].some((s: any) => typeof s === 'string' && s.endsWith('*'))
    ) || "";

    // Find Subject Key (Keyword Search - Robust)
    const keywords = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학", "체육", "음악", "미술", "진로"];
    subjectProp = keys.find(k => {
        const val = rawData[k];
        if (!Array.isArray(val)) return false;
        // Check deeper
        for (let i = 0; i < Math.min(val.length, 100); i++) {
            if (typeof val[i] === 'string' && keywords.some(kw => val[i].includes(kw))) return true;
        }
        return false;
    }) || "";

    // Fallback if keyword fails (Back to heuristic)
    if (!subjectProp) {
        const stringArrays = keys.filter(k => k !== teacherProp && Array.isArray(rawData[k]) && typeof rawData[k][0] === 'string');
        stringArrays.sort((a, b) => rawData[b].length - rawData[a].length);
        if (stringArrays.length > 0) subjectProp = stringArrays[0];
    }

    // Find Data Key: 3D array val[grade][class] exists
    timedataProp = keys.find(k => {
        const val = rawData[k];
        return Array.isArray(val) && val[grade] && val[grade][classNum] && Array.isArray(val[grade][classNum]);
    }) || "";

    const teachers = rawData[teacherProp] || [];
    const subjects = rawData[subjectProp] || [];
    const data = rawData[timedataProp];
    // Time info is usually short array e.g. [0, 7, 7, 7, 7, 7]
    const timeInfoProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].length === 8 && typeof rawData[k][1] === 'number'); // "요일별시수" logic
    const timeInfo = timeInfoProp ? rawData[timeInfoProp] : null;

    if (!data || !data[grade] || !data[grade][classNum]) {
        throw new Error(`데이터가 없습니다 (Grade: ${grade}, Class: ${classNum}).`);
    }

    const classData = data[grade][classNum];
    const result: any[] = [];

    for (let weekday = 1; weekday <= 5; weekday++) {
        // timeInfo structure might be val[grade][weekday]
        // If not found, default to 7
        let dayHours = 7;
        if (timeInfo && timeInfo[grade]) {
            dayHours = timeInfo[grade][weekday];
        }

        for (let period = 1; period <= dayHours; period++) {
            const code = classData[weekday][period];
            if (!code) continue;

            let teacherIdx = 0;
            let subjectIdx = 0;

            // Parsing Logic
            if (code < 1000) {
                teacherIdx = Math.floor(code / 100);
                subjectIdx = code % 100;
            } else {
                teacherIdx = Math.floor(code / 1000);
                subjectIdx = code % 1000;
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
