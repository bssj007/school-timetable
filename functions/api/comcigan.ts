
/**
 * Cloudflare Pages Function - 부산성지고등학교 전용 컴시간알리미 API
 * 
 * Flow:
 * 1. Connect to /st to get dynamic prefix
 * 2. Use known School Codes (36179, 93342) + Dynamic Prefix to get Timetable
 * 3. Support Full Browser Spec Headers
 */

const BASE_URL = "http://comci.net:4082";
const SCHOOL_CODE_1 = "36179"; // 교육청 코드
const SCHOOL_CODE_2 = "93342"; // 컴시간 코드 (Search Result)

// Headers
const HEADERS: any = {
    'Accept': '*/*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'http://comci.net:4082/st',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
};

const PROXIES = [
    '',
    'https://corsproxy.io/?'
];

async function decodeEucKr(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    return decoder.decode(buffer);
}

async function fetchWithProxy(targetUrl: string, headers: any = HEADERS, isEucKr: boolean = false) {
    let lastError;
    for (const proxy of PROXIES) {
        try {
            const fullUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
            const res = await fetch(fullUrl, { headers });
            if (res.ok) {
                if (isEucKr) return await decodeEucKr(res);
                const buf = await res.arrayBuffer();
                const txt = new TextDecoder('utf-8').decode(buf);
                return txt.replace(/\0/g, '');
            }
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error('Connection failed');
}

async function getPrefix() {
    // 1. Fetch /st to get sc_data prefix
    const html = await fetchWithProxy(`${BASE_URL}/st`, HEADERS, true); // true = EUC-KR
    const match = html.match(/sc_data\('([^']+)'/);
    if (!match) throw new Error("Failed to extract sc_data prefix");
    return match[1]; // e.g. "73629_"
}

export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');

    try {
        if (type === 'timetable') {
            const grade = parseInt(url.searchParams.get('grade') || '1');
            const classNum = parseInt(url.searchParams.get('classNum') || '1');
            return await getTimetable(grade, classNum);
        }
        return new Response('Invalid type', { status: 400 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function getTimetable(grade: number, classNum: number) {
    // 1. Get Dynamic Prefix
    const prefix = await getPrefix();

    // 2. Construct URL
    const param = `${prefix}${SCHOOL_CODE_2}_0_${grade}`;
    const b64 = btoa(param);
    const targetUrl = `${BASE_URL}/${SCHOOL_CODE_1}?${b64}`;

    // 3. Fetch Data
    const jsonText = await fetchWithProxy(targetUrl, HEADERS, false);
    const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
    const rawData = JSON.parse(jsonString);

    // 4. Parse
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
        return Array.isArray(val) && val[grade] && val[grade][classNum] && Array.isArray(val[grade][classNum]);
    }) || "";

    if (!timedataProp) throw new Error(`데이터 키를 찾을 수 없습니다. (Prefix: ${prefix})`);

    const teachers = rawData[teacherProp] || [];
    const subjects = rawData[subjectProp] || [];
    const data = rawData[timedataProp];
    // Time info optional
    const timeInfoProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].length === 8 && typeof rawData[k][1] === 'number');
    const timeInfo = timeInfoProp ? rawData[timeInfoProp] : null;

    if (!data || !data[grade] || !data[grade][classNum]) {
        throw new Error(`해당 학년/반 데이터가 없습니다.`);
    }

    const classData = data[grade][classNum];
    const result: any[] = [];

    for (let weekday = 1; weekday <= 5; weekday++) {
        let dayHours = 7;
        if (timeInfo && timeInfo[grade]) {
            dayHours = timeInfo[grade][weekday];
        }

        const maxPeriod = classData[weekday].length - 1;
        const loopLimit = Math.min(dayHours, maxPeriod); // Safer loop limit

        for (let period = 1; period <= loopLimit; period++) { // Use loopLimit, usually 7
            const code = classData[weekday][period];
            if (!code) continue;

            let teacherIdx = 0;
            let subjectIdx = 0;

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
