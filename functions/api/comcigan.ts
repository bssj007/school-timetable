
/**
 * Cloudflare Pages Function - 컴시간알리미 API 프록시 (With CORS Proxy)
 * 
 * 컴시간 서버는 해외 IP(Cloudflare)를 차단할 수 있음.
 * 따라서 CORS 프록시나 다른 우회 경로를 통해 접근 시도.
 */

// 여러 프록시 후보 (순차 시도)
const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    '' // 직접 접속 (마지막 수단)
];

const COMCI_URL = 'http://comci.kr:4082';

export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');

    try {
        const apiCall = type === 'search'
            ? searchSchool(url.searchParams.get('keyword') || '')
            : getTimetable(
                parseInt(url.searchParams.get('schoolCode') || '0'),
                parseInt(url.searchParams.get('grade') || '0'),
                parseInt(url.searchParams.get('classNum') || '0')
            );

        // 타임아웃 25초로 연장 (프록시 경유 시간 고려)
        return await Promise.race([
            apiCall,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out (25s)')), 25000))
        ]);

    } catch (err: any) {
        return new Response(JSON.stringify({
            error: err.message,
            details: 'Failed to fetch data. Comcigan server might be blocking requests.'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}

function createJsonResponse(data: any) {
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}

// 텍스트 디코딩 헬퍼
async function decodeResponse(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    // CORS 프록시를 거치면 이미 UTF-8로 변환되었을 수도 있음.
    // 하지만 보통 raw 데이터를 그대로 주므로 EUC-KR 디코딩 시도.
    const decoder = new TextDecoder('euc-kr');
    let text = decoder.decode(buffer);

    // 컴시간 특유의 쓰레기 문자 제거
    text = text.replace(/\0/g, '');

    return text;
}

// JSON 추출 헬퍼
function extractJson(text: string): any {
    try {
        return JSON.parse(text);
    } catch (e) {
        const firstBrace = text.indexOf('{');
        const firstBracket = text.indexOf('[');

        let startIdx = 0;
        let endChar = '';

        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            startIdx = firstBrace;
            endChar = '}';
        } else if (firstBracket !== -1) {
            startIdx = firstBracket;
            endChar = ']';
        } else {
            throw new Error('No JSON start found');
        }

        const lastIdx = text.lastIndexOf(endChar);
        if (lastIdx === -1) throw new Error('No JSON end found');

        const jsonString = text.substring(startIdx, lastIdx + 1);
        try {
            return JSON.parse(jsonString);
        } catch (e2) {
            // 프록시 에러 메시지일 수도 있음
            throw new Error('Failed to parse JSON: ' + text.substring(0, 100));
        }
    }
}

// 프록시를 통한 Fetch 헬퍼
async function fetchWithProxy(targetUrl: string) {
    let lastError;

    for (const proxy of PROXIES) {
        try {
            const fullUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
            console.log(`Trying proxy: ${proxy} -> ${fullUrl}`);

            const response = await fetch(fullUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            });

            if (response.ok) return response;
            throw new Error(`Status ${response.status}`);
        } catch (e) {
            console.error(`Proxy failed: ${proxy}`, e);
            lastError = e;
            continue; // 다음 프록시 시도
        }
    }
    throw lastError;
}

// 학교 검색
async function searchSchool(keyword: string) {
    // 프록시 사용 시 인코딩 문제 주의 (프록시가 쿼리 파라미터를 어떻게 처리하는지)
    // 여기서는 간단히 UTF-8로 시도
    const searchUrl = `${COMCI_URL}/st?str=${encodeURIComponent(keyword)}`;
    const response = await fetchWithProxy(searchUrl);

    const text = await decodeResponse(response);
    const data = extractJson(text);

    return createJsonResponse(data);
}

// 시간표 조회
async function getTimetable(schoolCode: number, grade: number, classNum: number) {
    if (!schoolCode) throw new Error('School code is required');

    const timetableUrl = `${COMCI_URL}/sv?st=${schoolCode}`;
    const response = await fetchWithProxy(timetableUrl);

    const text = await decodeResponse(response);
    const rawData = extractJson(text);

    /**
     * 데이터 파싱 로직 (comcigan-parser-edited 기반)
     */
    let timetableKey = '';
    // 3차원 배열 ([학년][반][요일]...)을 찾음
    for (const key in rawData) {
        const val = rawData[key];
        if (Array.isArray(val) && val.length > 0) {
            if (Array.isArray(val[1]) && Array.isArray(val[1][1])) {
                timetableKey = key;
                break;
            }
        }
    }

    if (!timetableKey) throw new Error('Timetable data key not found');

    const allTimetables = rawData[timetableKey];

    // 매핑 테이블 찾기
    const stringArrays = Object.values(rawData).filter(v =>
        Array.isArray(v) && v.length > 0 && typeof v[0] === 'string'
    ) as string[][];

    let subjectMap: string[] = [];
    let teacherMap: string[] = [];

    for (const arr of stringArrays) {
        const isSubjectList = arr.some(s =>
            ['국어', '수학', '영어', '사회', '과학', '역사', '도덕', '체육', '음악', '미술'].some(sub => s.includes(sub))
        );

        if (isSubjectList) {
            if (!subjectMap.length || arr.length > subjectMap.length) {
                subjectMap = arr;
            }
        } else {
            if (!teacherMap.length || arr.length > teacherMap.length) {
                teacherMap = arr;
            }
        }
    }

    // Fallback
    if (subjectMap.length === 0 && stringArrays.length >= 1) {
        stringArrays.sort((a, b) => b.length - a.length);
        subjectMap = stringArrays[0];
        if (stringArrays.length >= 2) teacherMap = stringArrays[1];
    }

    // 데이터 추출
    if (!allTimetables[grade] || !allTimetables[grade][classNum]) {
        return createJsonResponse({
            schoolCode,
            data: [],
            message: `${grade}학년 ${classNum}반 데이터를 찾을 수 없습니다.`
        });
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

            let subject = '';
            let teacher = '';

            if (subjectIdx < subjectMap.length) subject = subjectMap[subjectIdx];
            if (teacherIdx < teacherMap.length) teacher = teacherMap[teacherIdx];

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
        grade,
        classNum,
        data: result,
        timestamp: new Date().toISOString()
    });
}
