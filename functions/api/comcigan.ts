
/**
 * Cloudflare Pages Function - 컴시간알리미 API 프록시 (Ported from comcigan-parser-edited)
 */

// 프록시 목록
const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    ''
];

const BASE_URL = 'http://comci.kr:4081'; // 포트 4081 확인됨

// 유틸: EUC-KR 디코딩 및 쓰레기 제거
async function decodeResponse(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    let text = decoder.decode(buffer);
    return text.replace(/\0/g, '');
}

// 유틸: 프록시 Fetch
async function fetchWithProxy(targetUrl: string) {
    let lastError;
    for (const proxy of PROXIES) {
        try {
            const fullUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
            const response = await fetch(fullUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (response.ok) return response;
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error('All proxies failed');
}

// 메인 핸들러
export const onRequest = async (context: any) => {
    const url = new URL(context.request.url);
    const type = url.searchParams.get('type');

    try {
        if (type === 'timetable') {
            const schoolCode = parseInt(url.searchParams.get('schoolCode') || '0');
            const grade = parseInt(url.searchParams.get('grade') || '0');
            const classNum = parseInt(url.searchParams.get('classNum') || '0');

            if (!schoolCode) throw new Error('School code required');

            return await getTimetable(schoolCode, grade, classNum);
        }
        return new Response('Invalid type', { status: 400 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 1. 초기화 (init) - 필수 데이터 확보
async function init() {
    const response = await fetchWithProxy(`${BASE_URL}/st`);
    const body = await decodeResponse(response);

    // school_ra(sc) 찾기
    const idx = body.indexOf("school_ra(sc)");
    const idx2 = body.indexOf("sc_data('");

    if (idx === -1 || idx2 === -1) throw new Error("Init failed: Source code changed");

    const extractSchoolRa = body.substring(idx, idx + 50).replace(/ /g, "");
    const schoolRaMatch = extractSchoolRa.match(/url:'.(.*?)'/);

    const extractScData = body.substring(idx2, idx2 + 30).replace(/ /g, "");
    const scDataMatch = extractScData.match(/\(.*?\)/);

    if (!schoolRaMatch || !scDataMatch) throw new Error("Init failed: Data extraction failed");

    const schoolRa = schoolRaMatch[1];
    const scData = scDataMatch[0].replace(/[()']/g, "").split(",");

    return { schoolRa, scData };
}

// 2. 시간표 조회
async function getTimetable(schoolCode: number, grade: number, classNum: number) {
    // Step 1: 초기화 데이터 가져오기
    const { schoolRa, scData } = await init();

    // Step 2: URL 생성 (Base64 인코딩)
    // 로직: code = scData[0] + "_" + "0" + "_" + scData[2]
    //     : url = schoolRa 앞부분 + "?" + Base64(code)
    // 그런데... 성지고 코드를 어디에 넣지?
    // 원본 parser 로직을 보면 'getTimetable' 호출 시 schoolCode를 인자로 안 받음.
    // 대신 'setSchool'에서 '_extractCode' + hexString으로 검색 후,
    // 그 결과에서 무언가를 얻어서 s7 변수를 만듦.

    // 원본: const s7 = this._scData[0] + this._searchData[0][3];
    // 즉, 검색 결과의 3번째 인덱스가 학교 고유 코드임.
    // 우리는 학교 코드(7530560)를 이미 알고 있음. 이것이 _searchData[0][3]와 같은 것인가?
    // 아마도 그럴 것임. (컴시간 학교 코드는 보통 5자리~7자리 숫자)

    const widthCode = scData[0] + schoolCode; // 원본: scData[0] + searchData[3]
    const complexCode = widthCode + "_" + "0" + "_" + scData[2];

    // Base64 인코딩 (btoa는 브라우저/Workers 전용)
    const base64Code = btoa(unescape(encodeURIComponent(complexCode)));
    // 주의: 한글이 없으므로 btoa만으로 충분할 수 있으나, 안전하게 처리.
    // 숫자+문자 조합이므로 btoa 바로 사용 가능.

    const targetUrlPart = schoolRa.split('?')[0] + '?' + base64(complexCode);

    const fullUrl = `${BASE_URL}${targetUrlPart}`;
    console.log('Fetching Timetable URL:', fullUrl);

    const response = await fetchWithProxy(fullUrl);
    const text = await decodeResponse(response);

    // JSON 파싱
    const jsonString = text.substring(0, text.lastIndexOf("}") + 1);
    const rawData = JSON.parse(jsonString);

    // 데이터 분석
    // 1. 과목/교사/시간표 프로퍼티 찾기
    let subjectProp = "";
    let teacherProp = "";
    let timedataProp = "";

    const firstNames = ["김", "박", "이", "송", "최", "정", "강"]; // 성씨 리스트

    for (const k of Object.keys(rawData)) {
        const val = rawData[k];
        if (typeof val === "object" && k.indexOf("자료") !== -1) {
            if (k.indexOf("긴") !== -1) {
                subjectProp = k; // "자료...긴..." -> 과목
            } else {
                // 교사 찾기
                let teacherCount = 0;
                let isList = false;
                if (Array.isArray(val)) {
                    val.forEach((name: string) => {
                        if (typeof name === 'string' && firstNames.some(f => name.includes(f))) teacherCount++;
                    });
                    if (teacherCount >= 5) { // 5명 이상이면 교사 리스트로 간주
                        teacherProp = k;
                    }

                    // 시간표 데이터 찾기
                    // 3차원 배열이고 숫자 합이 크면 시간표
                    // val[1][1]...
                    // 간단히 체크: 값을 순회해서 배열 구조 확인
                    // 원본: total > threshold
                    // 우리는: grade(1)의 class(1) 데이터가 존재하는지 확인
                    if (val[grade] && val[grade][classNum]) {
                        timedataProp = k;
                    }
                }
            }
        }
    }

    // Fallback
    // 선생님/과목 못 찾았으면 길이로 추정
    const stringArrays = Object.values(rawData).filter(v => Array.isArray(v) && typeof v[0] === 'string') as string[][];
    if (!subjectProp && stringArrays.length > 0) {
        stringArrays.sort((a, b) => b.length - a.length);
        // 가장 긴게 과목일 확률 높음 (아닐 수도 있음, 교사가 더 많을 수도..)
        // 원본 로직이 더 정확함. 일단 원본 로직 실패 시 안 됨.
    }

    const teachers = rawData[teacherProp];
    const subjects = rawData[subjectProp];
    const data = rawData[timedataProp];
    const timeInfo = rawData["요일별시수"];

    if (!data || !data[grade] || !data[grade][classNum]) {
        throw new Error("Data not found for this class");
    }

    const classData = data[grade][classNum];
    const result: any[] = [];

    // 파싱
    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayHours = timeInfo[grade][weekday]; // 해당 요일 시수
        for (let period = 1; period <= dayHours; period++) {
            const code = classData[weekday][period];
            // code는 숫자(ex: 1234)
            // 3자리: T S S (1자리 교사, 2자리 과목)
            // 4자리: TT SS (2자리 교사, 2자리 과목)

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
        schoolCode, data: result
    }), { headers: { 'Content-Type': 'application/json' } });
}

function base64(str: string) {
    // Node.js Buffer 대신 workers 호환 btoa 사용
    // 한글이 포함되지 않은 문자열(숫자+_)이라 안전
    return btoa(str);
}
