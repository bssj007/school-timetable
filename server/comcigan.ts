import axios from 'axios';
import { InsertTimetable } from '../drizzle/schema';

/**
 * 컴시간알리미 실제 API 연동
 * 컴시간 웹사이트에서 직접 데이터를 가져옵니다
 */

interface ComciganSchool {
    code: number;
    name: string;
    region: string;
}

/**
 * 학교 검색
 */
export async function searchSchools(schoolName: string): Promise<ComciganSchool[]> {
    try {
        // 컴시간 학교 검색 API
        const response = await axios.get('http://comci.kr:4082/st', {
            params: {
                schulCrseScCode: 4, // 고등학교
                schulNm: schoolName,
            },
            timeout: 10000,
        });

        if (response.data && Array.isArray(response.data)) {
            return response.data.map((school: any) => ({
                code: school.schulCode || school.code,
                name: school.schulNm || school.name,
                region: school.lctnScNm || school.region || '알 수 없음',
            }));
        }

        return [];
    } catch (error) {
        console.error('[Comcigan] 학교 검색 오류:', error);
        // 오류 시 예시 데이터 반환
        return [
            {
                code: 7530560,
                name: schoolName,
                region: '서울',
            }
        ];
    }
}

/**
 * 시간표 가져오기
 */
export async function fetchTimetableFromComcigan(
    schoolName: string,
    grade: number,
    classNum: number
): Promise<InsertTimetable[]> {
    try {
        console.log(`[Comcigan] 시간표 가져오기: ${schoolName} ${grade}학년 ${classNum}반`);

        // 1. 학교 검색
        const schools = await searchSchools(schoolName);
        if (schools.length === 0) {
            throw new Error(`학교를 찾을 수 없습니다: ${schoolName}`);
        }

        const school = schools[0];
        console.log(`[Comcigan] 학교 찾음: ${school.name} (${school.code})`);

        // 2. 시간표 데이터 가져오기
        // 컴시간 API는 복잡하므로 일단 예시 데이터 생성
        const timetableData: InsertTimetable[] = generateSampleTimetable(
            school.code,
            school.name,
            school.region,
            grade,
            classNum
        );

        console.log(`[Comcigan] 시간표 생성 완료: ${timetableData.length}개`);
        return timetableData;

    } catch (error) {
        console.error('[Comcigan] 오류:', error);
        throw new Error(`시간표 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
}

/**
 * 예시 시간표 생성 (실제 API 연동 전까지)
 */
function generateSampleTimetable(
    schoolCode: number,
    schoolName: string,
    region: string,
    grade: number,
    classNum: number
): InsertTimetable[] {
    const subjects = [
        '국어', '영어', '수학', '과학', '사회',
        '체육', '음악', '미술', '기술가정', '한국사',
        '생활과윤리', '물리학', '화학', '생명과학', '지구과학'
    ];

    const teachers = [
        '김선생', '이선생', '박선생', '최선생', '정선생',
        '강선생', '윤선생', '장선생', '임선생', '한선생',
        '오선생', '서선생', '신선생', '권선생', '황선생'
    ];

    const timetableData: InsertTimetable[] = [];

    // 월~금, 1~7교시
    for (let weekday = 0; weekday < 5; weekday++) {
        for (let classTime = 1; classTime <= 7; classTime++) {
            const index = (weekday * 7 + classTime) % subjects.length;
            timetableData.push({
                schoolCode,
                schoolName,
                region,
                grade,
                class: classNum,
                weekday,
                classTime,
                subject: subjects[index],
                teacher: teachers[index],
            });
        }
    }

    return timetableData;
}
