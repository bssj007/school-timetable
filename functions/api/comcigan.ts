
/**
 * Cloudflare Pages Function - 부산성지고등학교 전용 컴시간알리미 API
 * 
 * Target: http://comci.net:4082 (New Server)
 */

const BASE_URL = 'http://comci.net:4082';

// PROXIES: Direct first, then proxies.
const PROXIES = [
    '',
    'https://corsproxy.io/?'
];

async function decodeResponse(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    // Using 'euc-kr' decoder
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
                'Referer': 'http://comci.kr/', // Referer might need to be comci.net?
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            };

            console.log(`Fetching (${isDirect ? 'Direct' : 'Proxy'}): ${fullUrl}`);
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

async function init() {
    const response = await fetchWithProxy(`${BASE_URL}/st`);
    const body = await decodeResponse(response);

    const idx = body.indexOf("school_ra(sc)");
    const idx2 = body.indexOf("sc_data('");

    if (idx === -1 || idx2 === -1) {
        throw new Error(`Init failed. Body start: ${body.substring(0, 100)}`);
    }

    const extractSchoolRa = body.substring(idx, idx + 50).replace(/ /g, "");
    const schoolRaMatch = extractSchoolRa.match(/url:'.(.*?)'/);

    const extractScData = body.substring(idx2, idx2 + 100).replace(/ /g, "");
    const scDataMatch = extractScData.match(/sc_data\((.*?)\)/);

    if (!schoolRaMatch || !scDataMatch) throw new Error("Init failed: Parsing error");

    const schoolRa = schoolRaMatch[1];
    const scData = scDataMatch[1].replace(/'/g, "").split(",");

    return { schoolRa, scData };
}

async function getBusanSeongjiTimetable(grade: number, classNum: number) {
    const { schoolRa, scData } = await init();

    // Try "부산성지고" (Short name often works better)
    // EUC-KR Hex for "부산성지고": %BA%CE%BB%EA%BC%BA%C1%F6%B0%ED
    const encodedKeyword = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED";
    const searchUrl = `${BASE_URL}${schoolRa}${encodedKeyword}`;

    const searchRes = await fetchWithProxy(searchUrl);
    const searchText = await decodeResponse(searchRes);
    const searchJsonString = searchText.substring(searchText.indexOf('{'), searchText.lastIndexOf("}") + 1);

    let searchData;
    try {
        searchData = JSON.parse(searchJsonString);
    } catch (e) {
        throw new Error("Search JSON Parse Error: " + searchJsonString.substring(0, 100));
    }

    if (!searchData["학교검색"] || searchData["학교검색"].length === 0) {
        // Fallback: Try "성지고" (%BC%BA%C1%F6%B0%ED)
        const encodedKeyword2 = "%BC%BA%C1%F6%B0%ED";
        const searchUrl2 = `${BASE_URL}${schoolRa}${encodedKeyword2}`;
        const res2 = await fetchWithProxy(searchUrl2);
        const text2 = await decodeResponse(res2);
        try {
            const data2 = JSON.parse(text2.substring(text2.indexOf('{'), text2.lastIndexOf("}") + 1));
            if (data2["학교검색"] && data2["학교검색"].length > 0) {
                // Find the one that starts with "부산"
                const found = data2["학교검색"].find((s: any) => s[2].startsWith("부산"));
                if (found) {
                    searchData = { "학교검색": [found] };
                } else {
                    // Just take the first one if not found (Risky but better than error)
                    searchData = data2;
                }
            }
        } catch (e2) { }

        if (!searchData || !searchData["학교검색"]) throw new Error("부산성지고등학교 검색 실패");
    }

    const schoolCode = searchData["학교검색"][0][3];

    // Timetable URL
    const widthCode = parseInt(scData[0]) + parseInt(schoolCode);
    const complexCode = widthCode + "_" + "0" + "_" + scData[2];
    const base64Code = btoa(complexCode);

    const targetUrlPart = schoolRa.split('?')[0] + '?' + base64Code;
    const fullUrl = `${BASE_URL}${targetUrlPart}`;

    const response = await fetchWithProxy(fullUrl);
    const text = await decodeResponse(response);
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf("}") + 1);
    const rawData = JSON.parse(jsonString);

    // Parsing Logic (Standard)
    let subjectProp = "";
    let teacherProp = "";
    let timedataProp = "";

    const firstNames = ["김", "이", "박", "최", "정", "강"];

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
    const timeInfo = rawData["요일별시수"];

    if (!data || !data[grade] || !data[grade][classNum]) {
        throw new Error(`데이터 없음 (Grade: ${grade}, Class: ${classNum})`);
    }

    const classData = data[grade][classNum];
    const result: any[] = [];

    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayHours = timeInfo ? timeInfo[grade][weekday] : 7;
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
        schoolCode,
        data: result
    }), { headers: { 'Content-Type': 'application/json' } });
}
