/**
 * Cloudflare Pages Function - 컴시간알리미 API 프록시
 * 
 * Node.js 의존성 없이 Fetch API만 사용하여 구현
 */

interface Env {
    // 환경 변수 타입 정의
}

// 컴시간 기본 URL
const BASE_URL = 'http://comci.kr:4082';

// Cloudflare Pages Function 타입 우회
export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type'); // 'search' | 'timetable'

    try {
        if (type === 'search') {
            const keyword = url.searchParams.get('keyword');
            if (!keyword) return new Response('Keyword is required', { status: 400 });
            return await searchSchool(keyword);
        }

        if (type === 'timetable') {
            const schoolCode = url.searchParams.get('schoolCode');
            const grade = parseInt(url.searchParams.get('grade') || '0');
            const classNum = parseInt(url.searchParams.get('classNum') || '0');

            if (!schoolCode || !grade || !classNum) {
                return new Response('Missing parameters', { status: 400 });
            }
            return await getTimetable(parseInt(schoolCode), grade, classNum);
        }

        return new Response('Invalid type', { status: 400 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * 학교 검색
 * comcigan-parser 로직 참고: /st 경로로 GET 요청
 */
async function searchSchool(keyword: string) {
    // EUC-KR 인코딩이 필요할 수 있으나, URL query param은 보통 UTF-8로 처리되거나 
    // 브라우저가 자동 변환함. Workers에서는 encodeURIComponent 사용.
    // 컴시간은 쿼리 파라미터를 EUC-KR로 받을 가능성이 높음.
    // 하지만 Cloudflare Workers에서 iconv 없이 EUC-KR 인코딩은 복잡.
    // 일단 UTF-8로 시도해보고, 안되면 다른 방법 강구.
    // 다행히 최근 웹 서버들은 UTF-8도 어느정도 지원함.

    // 헥사 코드로 변환하는 트릭(comcigan-parser에서 사용)이 필요할 수 있음.
    // comcigan-parser는 iconv-lite로 EUC-KR 변환 후 헥사 문자열로 만듦 ('%B0%A1%...')

    // 여기서는 간단히 UTF-8로 시도 (대부분의 모던 브라우저/서버 호환)
    // 만약 실패한다면 수동 매핑이나 다른 API 엔드포인트 찾아야 함.

    const searchUrl = `${BASE_URL}/st?str=${encodeURIComponent(keyword)}`;

    const response = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
    });

    if (!response.ok) throw new Error('Search request failed');

    // 응답은 JSON 배열 형태 (e.g. [{"학교명":"...","지역":"...",...}])
    // 하지만 인코딩이 깨질 수 있음.
    // ArrayBuffer로 받아서 TextDecoder('euc-kr')로 디코딩 시도
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    const text = decoder.decode(buffer);

    // JSON 파싱 전처리 (컴시간 응답이 순수 JSON이 아닐 수 있음 - 예를 들어 null 로 끝나는 등)
    // comcigan-parser는 0x00(null byte)를 제거함
    const cleanText = text.replace(/\0/g, '');

    const data = JSON.parse(cleanText);

    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * 시간표 조회
 * comcigan-parser 로직 참고
 */
async function getTimetable(schoolCode: number, grade: number, classNum: number) {
    // 1. 기본 데이터(URL 등) 확보를 위한 초기 요청이 필요할 수 있으나,
    // comcigan-parser는 스크립트 내에 하드코딩된 Base64 문자열을 디코딩해서 URL 규칙을 찾음.
    // 여기서는 가장 일반적인 URL 패턴 (`/sv`)을 사용 시도.

    const timetableUrl = `${BASE_URL}/sv?st=${schoolCode}`;

    const response = await fetch(timetableUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) throw new Error('Timetable request failed');

    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr'); // 컴시간은 EUC-KR 사용
    const text = decoder.decode(buffer);
    const cleanText = text.replace(/\0/g, '');

    // 응답 데이터 구조 분석 (JSON)
    /*
      응답 구조 예시:
      {
        "성적": ...,
        "일과시간": ...,
        "자료481": [ ...학년별/반별 시간표 데이터... ], 
        ...
      }
      '자료481' 키값은 바뀔 수 있음 (comcigan-parser는 이를 동적으로 찾음)
    */

    const rawData = JSON.parse(cleanText);

    // 시간표 데이터가 있는 키 찾기 (값 배열의 차원이 높은 것) - comcigan-parser 방식
    let timetableKey = '';
    for (const key in rawData) {
        const value = rawData[key];
        // 1학년 1반 시간표가 있을 법한 구조 확인 (3차원 배열 이상)
        if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
            timetableKey = key;
            break;
        }
    }

    if (!timetableKey) {
        throw new Error('Timetable data key not found');
    }

    const allTimetables = rawData[timetableKey];

    // 학년/반 인덱싱 (데이터는 [학년][반][요일][교시] 형태일 가능성 높음)
    // comcigan-parser: response[key][grade][class][weekday][period]

    if (!allTimetables[grade] || !allTimetables[grade][classNum]) {
        return new Response(JSON.stringify({ error: 'Data not found for this class' }), { status: 404 });
    }

    const classData = allTimetables[grade][classNum];

    // 데이터 정제
    // 반환 형식: { [weekday]: { [period]: { subject: string, teacher: string } } }
    const result: any = {};

    // 0: 일요일, 1: 월요일 ...
    // 보통 평일은 1~5
    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayData = classData[weekday];
        result[weekday] = {};

        if (Array.isArray(dayData)) {
            for (let period = 1; period < dayData.length; period++) {
                // 각 교시 데이터는 숫자 코드일 수도 있고 문자열일 수도 있음
                // comcigan-parser는 숫자 코드를 과목명으로 매핑하는 별도 로직이 있음 ('자료492' 등 참조)
                // 여기서는 rawData 전체에서 과목명 매핑 테이블을 찾아야 함

                const periodData = dayData[period];
                result[weekday][period] = periodData; // 일단 원본 값 저장
            }
        }
    }

    // 과목명/선생님명 매핑
    // comcigan-parser 로직: "자료492"(과목명), "자료245"(선생님명) .. 키 이름은 가변적
    /*
       매핑 테이블 찾기 로직:
       - 배열이면서 문자열을 포함하고 있는 것을 찾음
    */
    let subjectMap: string[] = [];
    let teacherMap: string[] = [];

    // 휴리스틱: 문자열 배열이면서 길이가 적당한 것을 찾음
    for (const key in rawData) {
        const arr = rawData[key];
        if (Array.isArray(arr) && typeof arr[0] === 'string') {
            // 과목명 등일 가능성
            // 보통 과목명이 먼저 나오거나 길이가 더 긺
            if (arr.length > 50) { // 대충 기준
                if (!subjectMap.length) subjectMap = arr;
                else if (!teacherMap.length) teacherMap = arr;
            }
        }
    }

    // 매핑 적용
    const finalResult: any = [];

    for (let weekday = 1; weekday <= 5; weekday++) {
        for (let period = 1; period <= 7; period++) { // 7교시까지 가정
            const cell = result[weekday]?.[period];
            if (!cell) continue;

            // cell 구조: 보통 [과목코드 + (선생님코드 * 1000) 같은 방식] 아닐 경우 정수 하나
            // comcigan-parser: code % 100 = 과목, floor(code / 100) = 선생님 (버전마다 다를 수 있음)
            // 최신 버전은 4자리 수: 뒤 2~3자리가 과목, 앞자리가 교사?
            /* 
               comcigan-parser의 Parsing 로직:
               th = Math.floor(code / 100); // 선생님 인덱스
               sb = code - th * 100; // 과목 인덱스
            */

            let subject = '';
            let teacher = '';

            if (typeof cell === 'number') {
                const teacherIdx = Math.floor(cell / 100);
                const subjectIdx = cell % 100;

                subject = subjectMap[subjectIdx] || 'Unknown';
                teacher = teacherMap[teacherIdx] || '';
            }

            finalResult.push({
                grade,
                classNum,
                weekday,
                classTime: period,
                subject,
                teacher
            });
        }
    }

    return new Response(JSON.stringify(finalResult), {
        headers: { 'Content-Type': 'application/json' }
    });
}
