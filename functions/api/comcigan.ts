
/**
 * Cloudflare Pages Function - 컴시간알리미 API 프록시 (Final Version)
 * Based on logic from comcigan-parser-edited
 */

const BASE_URL = 'http://comci.kr:4082'; // 기본 URL (동적 탐색이 이상적이나 Edge에서는 고정이 빠름)

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

        // 타임아웃 10초 설정
        return await Promise.race([
            apiCall,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 10000))
        ]);

    } catch (err: any) {
        return new Response(JSON.stringify({
            error: err.message,
            details: 'Failed to fetch data from comci.kr'
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
    const decoder = new TextDecoder('euc-kr');
    let text = decoder.decode(buffer);

    // 컴시간 특유의 쓰레기 문자 제거 (null byte, 등)
    // JSON 파싱을 방해하는 요소 제거 
    // 예: "자료481....]\0\0\0" 형태
    text = text.replace(/\0/g, '');

    return text;
}

// JSON 추출 헬퍼
function extractJson(text: string): any {
    // 1. 순수 JSON 파싱 시도
    try {
        return JSON.parse(text);
    } catch (e) {
        // 2. 실패 시, 괄호 짝을 맞춰서 JSON 부분만 추출 시도 
        // (컴시간은 가끔 JSON 뒤에 HTML 태그나 쓰레기 값이 붙음)
        const firstBrace = text.indexOf('{');
        const firstBracket = text.indexOf('[');

        // 객체인지 배열인지 판단
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
            throw new Error('Failed to parse extracted JSON');
        }
    }
}

// 학교 검색
async function searchSchool(keyword: string) {
    // UTF-8로 시도 (최신 컴시간 서버는 지원함)
    const searchUrl = `${BASE_URL}/st?str=${encodeURIComponent(keyword)}`;

    const response = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
        }
    });

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);

    const text = await decodeResponse(response);
    const data = extractJson(text);

    return createJsonResponse(data);
}

// 시간표 조회
async function getTimetable(schoolCode: number, grade: number, classNum: number) {
    if (!schoolCode) throw new Error('School code is required');

    const timetableUrl = `${BASE_URL}/sv?st=${schoolCode}`;

    const response = await fetch(timetableUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': 'http://comci.kr/st'
        }
    });

    if (!response.ok) throw new Error(`Timetable fetch failed: ${response.status}`);

    const text = await decodeResponse(response);
    const rawData = extractJson(text);

    /**
     * 데이터 구조 분석 (Refined Logic)
     * 1. 시간표 데이터 찾기
     * 2. 과목명 매핑 찾기
     * 3. 교사명 매핑 찾기
     */

    let timetableKey = '';
    // 3차원 배열 ([학년][반][요일]...)을 찾음
    // 확실한 특징: 값들이 숫자(코드)로 이루어져 있음
    // 단, 0번째는 비어있을 수 있으므로 1학년 1반 데이터를 확인
    for (const key in rawData) {
        const val = rawData[key];
        if (Array.isArray(val) && val.length > 0) {
            // 1학년 데이터가 있는지
            if (Array.isArray(val[1]) && Array.isArray(val[1][1])) {
                timetableKey = key;
                break;
            }
        }
    }

    if (!timetableKey) throw new Error('Timetable data key not found');

    const allTimetables = rawData[timetableKey];

    // 매핑 테이블 찾기 전략
    // 1. 모든 문자열 배열을 수집
    const stringArrays = Object.values(rawData).filter(v =>
        Array.isArray(v) && v.length > 0 && typeof v[0] === 'string'
    ) as string[][];

    let subjectMap: string[] = [];
    let teacherMap: string[] = [];

    // 2. 내용 분석
    for (const arr of stringArrays) {
        // 과목명 리스트 특징: '국어', '수학', '영어', '체육', '음악', '미술' 등이 포함됨
        const isSubjectList = arr.some(s =>
            ['국어', '수학', '영어', '사회', '과학', '역사', '도덕', '체육', '음악', '미술'].some(sub => s.includes(sub))
        );

        // 교사명 리스트 특징: 보통 과목명보다 짧거나, 이름 형식(3글자)이 많음. 
        // 하지만 가장 강력한 힌트는 과목명이 아니면 교사명일 확률이 높다는 것.

        if (isSubjectList) {
            if (!subjectMap.length || arr.length > subjectMap.length) {
                subjectMap = arr; // 더 긴 과목 리스트가 있다면 그걸 선택 (전학년 통합일 수 있으므로)
            }
        } else {
            if (!teacherMap.length || arr.length > teacherMap.length) {
                teacherMap = arr;
            }
        }
    }

    // 만약 분석 실패 시 길이 기반 fallback
    if (subjectMap.length === 0 && stringArrays.length >= 1) {
        stringArrays.sort((a, b) => b.length - a.length);
        subjectMap = stringArrays[0];
        if (stringArrays.length >= 2) teacherMap = stringArrays[1];
    }

    // 3. 해당 학급 데이터 추출
    if (!allTimetables[grade] || !allTimetables[grade][classNum]) {
        return createJsonResponse({
            schoolCode,
            data: [],
            message: `${grade}학년 ${classNum}반 데이터를 찾을 수 없습니다.`
        });
    }

    const classData = allTimetables[grade][classNum];
    const result: any[] = [];

    // 월(1) ~ 금(5)
    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayData = classData[weekday];
        if (!Array.isArray(dayData)) continue;

        for (let period = 1; period < dayData.length; period++) {
            const code = dayData[period];
            if (!code) continue;

            // 코드 해석 로직 (comcigan-parser-edited 참고)
            // Code structure: (TeacherIdx * 100) + SubjectIdx ??
            // or simply an index into a mapping table?
            // Most common: Math.floor(code / 100) = Teacher, code % 100 = Subject

            const teacherIdx = Math.floor(code / 100);
            const subjectIdx = code % 100;

            // 인덱스가 유효한지 확인
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
