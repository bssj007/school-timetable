
/**
 * Cloudflare Pages Function - 부산성지고등학교 전용 컴시간알리미 API
 */

// 프록시 목록
const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    ''
];

const BASE_URL = 'http://comci.kr:4081';

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
            const grade = parseInt(url.searchParams.get('grade') || '0');
            const classNum = parseInt(url.searchParams.get('classNum') || '0');

            // 부산성지고등학교 자동 검색 및 조회
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

// 1. 초기화 (init) - 필수 데이터 확보
async function init() {
    const response = await fetchWithProxy(`${BASE_URL}/st`);
    const body = await decodeResponse(response);

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

// 2. 부산성지고등학교 시간표 조회 (통합 로직)
async function getBusanSeongjiTimetable(grade: number, classNum: number) {
    // Step 1: 초기화
    const { schoolRa, scData } = await init();

    // Step 2: 부산성지고등학교 검색 (EUC-KR Hex Hardcoded)
    // "부산성지고등학교" -> %BA%CE%BB%EA%BC%BA%C1%F6%B0%ED%B5%EE%C7%D0%B1%B3
    const encodedKeyword = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED%B5%EE%C7%D0%B1%B3";
    const searchUrl = `${BASE_URL}${schoolRa}${encodedKeyword}`;

    const searchRes = await fetchWithProxy(searchUrl);
    const searchText = await decodeResponse(searchRes);
    const searchJsonString = searchText.substring(0, searchText.lastIndexOf("}") + 1);
    const searchData = JSON.parse(searchJsonString);

    if (!searchData["학교검색"] || searchData["학교검색"].length === 0) {
        throw new Error("부산성지고등학교 검색 실패");
    }

    // 학교 코드 추출 (보통 인덱스 3)
    const schoolCode = searchData["학교검색"][0][3];
    console.log('Detected School Code:', schoolCode);

    // Step 3: 시간표 데이터 요청 URL 생성
    const widthCode = scData[0] + schoolCode; // scData[0] + schoolCode
    const complexCode = widthCode + "_" + "0" + "_" + scData[2];
    const base64Code = btoa(complexCode); // Simple btoa work for ASCII numbers

    const targetUrlPart = schoolRa.split('?')[0] + '?' + base64Code;
    const fullUrl = `${BASE_URL}${targetUrlPart}`;

    // Step 4: 시간표 데이터 Fetch
    const response = await fetchWithProxy(fullUrl);
    const text = await decodeResponse(response);
    const jsonString = text.substring(0, text.lastIndexOf("}") + 1);
    const rawData = JSON.parse(jsonString);

    // Step 5: 파싱 (선생님/과목/데이터 찾기)
    let subjectProp = "";
    let teacherProp = "";
    let timedataProp = "";

    // 성씨 리스트로 선생님 프로퍼티 찾기
    const firstNames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장"];

    for (const k of Object.keys(rawData)) {
        const val = rawData[k];
        if (typeof val === "object" && k.indexOf("자료") !== -1) {
            if (k.indexOf("긴") !== -1) {
                subjectProp = k;
            } else if (Array.isArray(val)) {
                // 선생님 리스트인지 확인
                let matchCount = 0;
                val.forEach((name: any) => {
                    if (typeof name === 'string' && firstNames.some(f => name.startsWith(f))) matchCount++;
                });

                if (matchCount > 5) { // 5명 이상이면 선생님 리스트로 간주
                    teacherProp = k;
                }

                // 1학년 1반 데이터가 존재하는지 확인 (시간표 데이터)
                if (val[grade] && val[grade][classNum] && val[grade][classNum][1]) {
                    timedataProp = k;
                }
            }
        }
    }

    // Fallback: 못 찾았으면 문자열 배열 길이로 추측
    if (!subjectProp || !teacherProp) {
        const stringArrays = Object.values(rawData).filter(v => Array.isArray(v) && typeof v[0] === 'string') as string[][];
        stringArrays.sort((a, b) => b.length - a.length);
        // 긴게 과목, 그 다음이 선생님 (일반적 경향)
        if (!subjectProp && stringArrays.length > 0) subjectProp = Object.keys(rawData).find(key => rawData[key] === stringArrays[0]) || "";
        if (!teacherProp && stringArrays.length > 1) teacherProp = Object.keys(rawData).find(key => rawData[key] === stringArrays[1]) || "";
    }

    // Fallback: 시간표 데이터 키를 못 찾았으면
    if (!timedataProp) {
        // 3차원 배열 구조를 가진 키를 찾음
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
        throw new Error(`데이터를 찾을 수 없습니다. (Grade: ${grade}, Class: ${classNum})`);
    }

    const classData = data[grade][classNum];
    const result: any[] = [];

    // Step 6: 결과 JSON 생성
    for (let weekday = 1; weekday <= 5; weekday++) {
        const dayHours = timeInfo ? timeInfo[grade][weekday] : 7; // 시수 정보 없으면 7교시 가정
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
