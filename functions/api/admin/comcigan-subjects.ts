
interface Env {
    // Comcigan API is external, so we don't need DB here for fetching from Comcigan
}

const BASE_URL = "http://comci.net:4082";
// Reusing logic from comcigan.ts directly or importing if possible. 
// Since Cloudflare Pages Functions are isolated, it's safer to duplicate the helper logic or abstract it.
// For now, I'll copy the helper functions to ensure it works standalone.
// In a larger refactor, these should be in a shared utils file.

const HEADERS: any = {
    'Accept': '*/*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'http://comci.net:4082/st',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
};
const SEARCH_HEX = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"; // 부산성지고
const FALLBACK_CODE2 = "93342";
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
    const grade = parseInt(url.searchParams.get('grade') || '0');

    if (!grade) return new Response('Grade required', { status: 400 });

    try {
        const prefix = await getPrefix();
        const { code1, code2 } = await getSchoolCode(prefix);
        const param = `${prefix}${code2}_0_${grade}`;
        const targetUrl = `${BASE_URL}/${code1}?${btoa(param)}`;

        const jsonText = await fetchWithProxy(targetUrl, HEADERS, false);
        const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
        const rawData = JSON.parse(jsonString);

        // Parse logic (simplified from comcigan.ts)
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
            return Array.isArray(val) && val[grade] && Array.isArray(val[grade][1]);
        }) || "";

        if (!timedataProp) throw new Error("Data key not found");

        const teachers = rawData[teacherProp] || [];
        const subjects = rawData[subjectProp] || [];
        const data = rawData[timedataProp];
        const bunri = rawData['분리'] || 100;

        const uniqueSubjects = new Map<string, { subject: string, teacher: string }>();
        const EXCLUDED = ["창체", "채플", "공강", "자습", "동아리"];

        // Iterate all classes in the grade
        const gradeData = data[grade];
        for (let classNum = 1; classNum < gradeData.length; classNum++) {
            const classSchedule = gradeData[classNum];
            if (!classSchedule) continue;

            for (let weekday = 1; weekday <= 5; weekday++) {
                const daySchedule = classSchedule[weekday];
                if (!daySchedule) continue;

                for (let period = 1; period < daySchedule.length; period++) {
                    const code = daySchedule[period];
                    if (!code) continue;

                    let teacherIdx = 0;
                    let subjectIdx = 0;

                    if (bunri === 100) {
                        teacherIdx = Math.floor(code / bunri);
                        subjectIdx = code % bunri;
                    } else {
                        teacherIdx = code % bunri;
                        subjectIdx = Math.floor(code / bunri);
                    }

                    const subject = subjects[subjectIdx] ? subjects[subjectIdx].replace(/_/g, "") : "";
                    const teacher = teachers[teacherIdx] || "";

                    if (!subject) continue;
                    if (EXCLUDED.some(ex => subject.includes(ex))) continue;

                    const key = `${subject}-${teacher}`;
                    if (!uniqueSubjects.has(key)) {
                        uniqueSubjects.set(key, { subject, teacher });
                    }
                }
            }
        }

        return new Response(JSON.stringify(Array.from(uniqueSubjects.values())), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
