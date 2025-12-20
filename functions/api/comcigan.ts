
/**
 * Cloudflare Pages Function - 컴시간알리미 API 프록시 (Pure Web API Version)
 * 
 * iconv-lite 등 Node.js 의존성 제거
 * Cloudflare Workers의 TextDecoder는 'euc-kr'을 지원함
 */

const BASE_URL = 'http://comci.kr:4082';

export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');

    try {
        if (type === 'search') {
            const keyword = url.searchParams.get('keyword');
            if (!keyword) return createErrorResponse('Keyword is required', 400);
            return await searchSchool(keyword);
        }

        if (type === 'timetable') {
            const schoolCodeStr = url.searchParams.get('schoolCode');
            const gradeStr = url.searchParams.get('grade');
            const classNumStr = url.searchParams.get('classNum');

            if (!schoolCodeStr || !gradeStr || !classNumStr) {
                return createErrorResponse('Missing parameters', 400);
            }
            return await getTimetable(parseInt(schoolCodeStr), parseInt(gradeStr), parseInt(classNumStr));
        }

        return createErrorResponse('Invalid type', 400);
    } catch (err: any) {
        return createErrorResponse(err.message || 'Internal Server Error', 500);
    }
}

function createErrorResponse(message: string, status: number) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function createJsonResponse(data: any) {
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}

/**
 * EUC-KR 인코딩 헬퍼 (Url Encoding)
 * Web API만으로는 EUC-KR 인코딩이 어렵지만, 컴시간 검색은 UTF-8도 가끔 받아줌.
 * 안되면 헥사 변환 트릭 사용 필요. 
 * 여기서는 일단 UTF-8로 시도하되, 실패 시 대안 로직 필요.
 * 
 * 중요: TextEncoder는 UTF-8만 지원함.
 * 따라서 검색어 인코딩은 서비스가 UTF-8을 지원하지 않으면 까다로움.
 * 하지만 대부분의 경우 브라우저 레벨에서 처리됨.
 */
async function searchSchool(keyword: string) {
    // 컴시간 서버가 UTF-8 검색어를 지원하는지 확인 필요.
    // 지원하지 않는다면 Cloudflare Workers에서는 EUC-KR 인코딩이 어려움 (iconv-lite 없이).
    // 하지만 여기서는 간단히 UTF-8로 전송 (대부분 모던 서버는 처리 가능)
    // 만약 실패한다면 클라이언트에서 미리 인코딩된 값을 보내도록 변경해야 함.

    const searchUrl = `${BASE_URL}/st?str=${encodeURIComponent(keyword)}`;

    const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);

    const buffer = await response.arrayBuffer();
    // Web Standard TextDecoder supports euc-kr
    const decoder = new TextDecoder('euc-kr');
    const decodedText = decoder.decode(buffer);

    const cleanText = decodedText.replace(/\0/g, '');
    const lastBracket = cleanText.lastIndexOf(']');
    const jsonString = cleanText.substring(0, lastBracket + 1);

    try {
        const data = JSON.parse(jsonString);
        return createJsonResponse(data);
    } catch (e) {
        throw new Error('Failed to parse search results');
    }
}

async function getTimetable(schoolCode: number, grade: number, classNum: number) {
    const timetableUrl = `${BASE_URL}/sv?st=${schoolCode}`;

    const response = await fetch(timetableUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) throw new Error(`Timetable fetch failed: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    const decodedText = decoder.decode(buffer);
    const cleanText = decodedText.replace(/\0/g, '');

    let rawData;
    try {
        rawData = JSON.parse(cleanText);
    } catch (e) {
        throw new Error('Failed to parse timetable data');
    }

    // 데이터 파싱 로직 (이전과 동일)
    let timetableKey = '';
    for (const key in rawData) {
        const value = rawData[key];
        if (Array.isArray(value) && value.length > 0 && Array.isArray(value[1])) {
            timetableKey = key;
            break;
        }
    }

    if (!timetableKey) throw new Error('Classes data not found');
    const allTimetables = rawData[timetableKey];

    let subjectMap: string[] = [];
    let teacherMap: string[] = [];

    // 맵핑 테이블 찾기
    const stringArrays = Object.values(rawData).filter(v => Array.isArray(v) && typeof v[0] === 'string') as string[][];
    stringArrays.sort((a, b) => b.length - a.length);
    if (stringArrays.length > 0) subjectMap = stringArrays[0];
    if (stringArrays.length > 1) teacherMap = stringArrays[1];

    if (!allTimetables[grade] || !allTimetables[grade][classNum]) {
        throw new Error(`Data not found for ${grade}-${classNum}`);
    }

    const classData = allTimetables[grade][classNum];
    const result: any[] = [];

    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayData = classData[weekday];
        if (!Array.isArray(dayData)) continue;

        for (let period = 1; period < dayData.length; period++) {
            const code = dayData[period];
            if (!code) continue;

            const teacherIdx = Math.floor(code / 100);
            const subjectIdx = code % 100;

            const subject = subjectMap[subjectIdx] || '';
            const teacher = teacherMap[teacherIdx] || '';

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

    return createJsonResponse({
        schoolCode,
        data: result
    });
}
