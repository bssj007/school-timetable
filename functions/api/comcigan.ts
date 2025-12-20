
import iconv from 'iconv-lite';
import { Buffer } from 'node:buffer';

/**
 * Cloudflare Pages Function - 컴시간알리미 API 프록시 (Enhanced)
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
                return createErrorResponse('Missing parameters (schoolCode, grade, classNum)', 400);
            }
            return await getTimetable(parseInt(schoolCodeStr), parseInt(gradeStr), parseInt(classNumStr));
        }

        return createErrorResponse('Invalid type parameter. Use "search" or "timetable"', 400);
    } catch (err: any) {
        console.error('[Comcigan API Error]', err);
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
 * 학교 검색
 */
async function searchSchool(keyword: string) {
    // EUC-KR 인코딩 변환
    const encodedKeyword = iconv.encode(keyword, 'euc-kr');
    let hexString = '';
    for (const byte of encodedKeyword) {
        hexString += '%' + byte.toString(16).toUpperCase();
    }

    const searchUrl = `${BASE_URL}/st?str=${hexString}`;

    const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
    });

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const decodedText = iconv.decode(Buffer.from(buffer), 'euc-kr');

    // 데이터 정제 (Null byte 제거)
    const cleanText = decodedText.replace(/\0/g, '');

    // JSON 파싱 (끝부분에 이상한 문자가 있을 수 있어 배열 끝 `]`를 찾음)
    const lastBracket = cleanText.lastIndexOf(']');
    const jsonString = cleanText.substring(0, lastBracket + 1);

    try {
        const data = JSON.parse(jsonString);
        return createJsonResponse(data);
    } catch (e) {
        throw new Error('Failed to parse search results');
    }
}

/**
 * 시간표 조회
 */
async function getTimetable(schoolCode: number, grade: number, classNum: number) {
    // 실제 데이터 요청 URL 찾기 로직은 생략하고, 가장 일반적인 경로 사용 (/sv)
    const timetableUrl = `${BASE_URL}/sv?st=${schoolCode}`;

    const response = await fetch(timetableUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) throw new Error(`Timetable fetch failed: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const decodedText = iconv.decode(Buffer.from(buffer), 'euc-kr');
    const cleanText = decodedText.replace(/\0/g, '');

    let rawData;
    try {
        rawData = JSON.parse(cleanText);
    } catch (e) {
        // 가끔 JSON 형식이 깨져서 올 때 처리 (예: `validity` 같은 속성 문제)
        // 여기서는 간단히 에러 처리
        throw new Error('Failed to parse timetable data');
    }

    // 1. 시간표 데이터 키 찾기 (3차원 배열 구조: [학년][반][요일]...)
    let timetableKey = '';
    for (const key in rawData) {
        const value = rawData[key];
        if (Array.isArray(value) && value.length > 0 && Array.isArray(value[1])) {
            // 1학년 데이터가 있는지 확인
            timetableKey = key;
            break;
        }
    }

    if (!timetableKey) throw new Error('Could not find timetable data in response');
    const allTimetables = rawData[timetableKey];

    // 2. 과목명, 교사명 매핑 테이블 찾기
    // "자료492" 같은 키값에 문자열 배열로 들어있음
    let subjectMap: string[] = [];
    let teacherMap: string[] = [];

    for (const key in rawData) {
        const arr = rawData[key];
        if (key === timetableKey) continue;
        if (Array.isArray(arr) && typeof arr[0] === 'string') {
            // 과목명이 교사명보다 보통 리스트가 긺 (간단한 휴리스틱)
            // 혹은 과목명에는 '국어', '수학' 등이 포함됨
            if (arr.some(s => s.includes('국어') || s.includes('수학') || s.includes('영어'))) {
                subjectMap = arr;
            } else if (arr.length > 0 && teacherMap.length === 0) {
                // 다른 문자열 배열은 교사명일 확률 높음
                teacherMap = arr;
            }
        }
    }

    // 만약 못 찾았다면 배열 길이로 추정 (과목 > 교사 보통)
    if (!subjectMap.length) {
        const stringArrays = Object.values(rawData).filter(v => Array.isArray(v) && typeof v[0] === 'string') as string[][];
        stringArrays.sort((a, b) => b.length - a.length);
        if (stringArrays.length > 0) subjectMap = stringArrays[0];
        if (stringArrays.length > 1) teacherMap = stringArrays[1];
    }

    // 3. 해당 학급 데이터 추출
    if (!allTimetables[grade] || !allTimetables[grade][classNum]) {
        throw new Error(`Time table not found for Grade ${grade} Class ${classNum}`);
    }

    const classData = allTimetables[grade][classNum];
    const result = [];

    // 월(1) ~ 금(5)
    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayData = classData[weekday]; // [교시1, 교시2, ...]
        if (!Array.isArray(dayData)) continue;

        for (let period = 1; period < dayData.length; period++) {
            const code = dayData[period];
            if (!code) continue;

            // 코드 해석: (교사코드 * 100) + 과목코드 ?? 버전마다 다름
            // 최신 버전은 보통 그 반대일 수도 있고, 단순히 매핑 인덱스일 수도 있음.
            // comcigan-parser 로직: 
            // th = Math.floor(code / 100) (선생님)
            // sb = code % 100 (과목)

            const teacherIdx = Math.floor(code / 100);
            const subjectIdx = code % 100;

            const subject = subjectMap[subjectIdx] || '';
            const teacher = teacherMap[teacherIdx] || '';

            if (subject) {
                result.push({
                    grade,
                    class: classNum,
                    weekday, // 1:Mon ... 5:Fri
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
