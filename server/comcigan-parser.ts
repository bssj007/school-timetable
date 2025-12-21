import axios from 'axios';
import iconv from 'iconv-lite';
import { URL } from 'url';
import { InsertTimetable } from '../drizzle/schema';

const HOST = 'http://컴시간학생.kr';

interface SchoolSearchResult {
    code: number;
    region: string;
    name: string;
}

export type { SchoolSearchResult };

export class ComciganParser {
    private baseUrl: string | null = null;
    private url: string | null = null;
    private extractCode: string | null = null;
    private scData: string[] | null = null;
    private pageSource: string | null = null;

    async init() {
        // 1. Access the main host
        console.log(`[Comcigan] Accessing ${HOST}...`);
        const response = await axios.get(HOST, {
            responseType: 'arraybuffer',
            timeout: 10000,
        });

        const body = iconv.decode(Buffer.from(response.data), 'EUC-KR');

        // 2. Find the frame
        const frameMatch = body.match(/<frame [^>]*src=['"]([^'"]*)['"][^>]*>/i);
        if (!frameMatch) {
            throw new Error('Cannot find frame');
        }

        const frameHref = frameMatch[1];
        console.log(`[Comcigan] Found frame href: ${frameHref}`);

        this.url = frameHref;
        const urlObj = new URL(frameHref);
        this.baseUrl = urlObj.origin;
        console.log(`[Comcigan] Base URL: ${this.baseUrl}`);

        // 3. Access the inner URL
        console.log(`[Comcigan] Accessing inner URL: ${this.url}`);
        const innerResponse = await axios.get(this.url, {
            responseType: 'arraybuffer',
            timeout: 10000,
        });

        const innerBody = iconv.decode(Buffer.from(innerResponse.data), 'EUC-KR');
        this.pageSource = innerBody;

        // 4. Extract codes
        const idx = innerBody.indexOf('school_ra(sc)');
        const idx2 = innerBody.indexOf("sc_data('");

        if (idx === -1 || idx2 === -1) {
            throw new Error('Cannot find identification codes in source');
        }

        const extractSchoolRa = innerBody.substr(idx, 50).replace(' ', '');
        const schoolRaMatch = extractSchoolRa.match(/url:'.(.*?)'/);

        const extractScData = innerBody.substr(idx2, 30).replace(' ', '');
        const scDataMatch = extractScData.match(/\(.*\)/);

        if (schoolRaMatch) {
            this.extractCode = schoolRaMatch[1];
            console.log(`[Comcigan] Extracted Code: ${this.extractCode}`);
        } else {
            throw new Error('Cannot find school_ra value');
        }

        if (scDataMatch) {
            this.scData = scDataMatch[0].replace(/[()]/g, '').replace(/'/g, '').split(',');
            console.log(`[Comcigan] SC Data: ${this.scData}`);
        } else {
            throw new Error('Cannot find sc_data value');
        }
    }

    async searchSchool(keyword: string): Promise<SchoolSearchResult[]> {
        if (!this.extractCode || !this.baseUrl) throw new Error('Not initialized');

        const hexString = iconv.encode(keyword, 'euc-kr').toString('hex').replace(/(..)/g, '%$1');
        const searchUrl = this.baseUrl + this.extractCode + hexString;

        console.log(`[Comcigan] Searching school: ${keyword}`);

        const response = await axios.get(searchUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
        });

        const responseBody = iconv.decode(Buffer.from(response.data), 'utf-8');
        const jsonString = responseBody.substring(0, responseBody.lastIndexOf('}') + 1);

        const parseResult = JSON.parse(jsonString);
        const searchResults = parseResult['학교검색'];

        if (!searchResults || searchResults.length === 0) {
            return [];
        }

        return searchResults.map((data: any[]) => ({
            code: data[3],
            region: data[1],
            name: data[2],
        }));
    }

    async getTimetableData(schoolCode: number): Promise<any> {
        if (!this.scData || !this.baseUrl || !this.extractCode) {
            throw new Error('Not initialized');
        }

        // Prepare URL for data
        const s7 = this.scData[0] + schoolCode;
        const rawQuery = s7 + '_0_' + this.scData[2];
        const base64Query = Buffer.from(rawQuery).toString('base64');
        const sc3 = this.extractCode.split('?')[0] + '?' + base64Query;

        const dataUrl = this.baseUrl + sc3;
        console.log(`[Comcigan] Fetching timetable data from: ${dataUrl}`);

        const response = await axios.get(dataUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
        });


        // Try UTF-8 first, as the JSON response is likely UTF-8 encoded
        let responseBody = iconv.decode(Buffer.from(response.data), 'utf-8');
        let jsonString = responseBody.substring(0, responseBody.lastIndexOf('}') + 1);

        // If JSON parse fails or Korean is garbled, try EUC-KR
        try {
            const testParse = JSON.parse(jsonString);
            // Quick test: check if keys are readable
            const keys = Object.keys(testParse);
            if (keys.some(k => k.includes('�') || k.match(/[^\x00-\x7F가-힣0-9]/))) {
                // Garbled, try EUC-KR
                responseBody = iconv.decode(Buffer.from(response.data), 'EUC-KR');
                jsonString = responseBody.substring(0, responseBody.lastIndexOf('}') + 1);
            }
        } catch (e) {
            // Try EUC-KR
            responseBody = iconv.decode(Buffer.from(response.data), 'EUC-KR');
            jsonString = responseBody.substring(0, responseBody.lastIndexOf('}') + 1);
        }

        return JSON.parse(jsonString);
    }

    parseTimetable(
        data: any,
        grade: number,
        classNum: number
    ): InsertTimetable[] {
        const timetable: InsertTimetable[] = [];

        // Extract metadata
        // Keys are EUC-KR encoded, so we need to find them by pattern
        const dataKeys = Object.keys(data);

        // Find keys by looking for patterns
        // Teachers: 자료446
        // Subjects: 자료492
        // Schedule: 자료481
        const teacherKey = dataKeys.find(k => k.includes('446'));
        const subjectKey = dataKeys.find(k => k.includes('492'));
        const scheduleKey = dataKeys.find(k => k.includes('481'));


        const teachers = teacherKey ? data[teacherKey] : [];
        const subjects = subjectKey ? data[subjectKey] : [];
        const scheduleData = scheduleKey ? data[scheduleKey] : null;
        const bunri = data['분리'] !== undefined ? data['분리'] : 100; // Get 분리 value, default 100


        if (!scheduleData || !Array.isArray(scheduleData) || scheduleData.length < 3) {
            throw new Error('Invalid schedule data structure');
        }

        // Get class schedule
        // Structure: 자료481[grade-1=마지막(3학년)][class-1][day-1][period]
        const gradeData = scheduleData[grade];
        if (!gradeData || gradeData.length < 2) {
            console.warn(`No data for grade ${grade}`);
            return timetable;
        }

        const classData = gradeData[classNum];
        if (!classData || classData.length < 2) {
            console.warn(`No data for grade ${grade} class ${classNum}`);
            return timetable;
        }

        // Parse each day (Monday=1 to Friday=5)
        for (let weekday = 1; weekday <= 5; weekday++) {
            const dayData = classData[weekday];
            if (!dayData || !Array.isArray(dayData)) {
                continue;
            }

            // First element is the number of periods
            const periodCount = dayData[0];

            // Parse each period
            for (let period = 1; period <= periodCount; period++) {
                if (period >= dayData.length) break;

                const cellData = dayData[period];
                if (!cellData || cellData === 0) continue;

                // Based on actual Comcigan source code:
                // When 분리 = 1000:
                //   mTh(mm, 1000) = mm % 1000 = Teacher code
                //   mSb(mm, 1000) = floor(mm / 1000) = Subject code
                // When 분리 = 100:
                //   mTh(mm, 100) = floor(mm / 100) = Teacher code  
                //   mSb(mm, 100) = mm % 100 = Subject code

                let teacherCode: number;
                let subjectCode: number;

                if (bunri === 100) {
                    teacherCode = Math.floor(cellData / bunri);
                    subjectCode = cellData % bunri;
                } else { // bunri === 1000 or other
                    teacherCode = cellData % bunri;
                    subjectCode = Math.floor(cellData / bunri);
                }

                const subject = subjects[subjectCode] || '알 수 없음';
                const teacher = teachers[teacherCode] || '알 수 없음';

                // Clean up teacher name (remove trailing *)
                const cleanTeacher = teacher.replace(/\*$/, '');

                timetable.push({
                    schoolCode: 0, // Will be filled later
                    schoolName: '', // Will be filled later
                    region: '', // Will be filled later
                    grade,
                    class: classNum,
                    weekday: weekday - 1, // Convert to 0-indexed (0=Mon, 4=Fri)
                    classTime: period,
                    subject,
                    teacher: cleanTeacher,
                });
            }
        }

        return timetable;
    }
}

// Singleton instance
let parserInstance: ComciganParser | null = null;

export async function getParser(): Promise<ComciganParser> {
    if (!parserInstance) {
        parserInstance = new ComciganParser();
        await parserInstance.init();
    }
    return parserInstance;
}

/**
 * Search schools by name
 */
export async function searchSchools(schoolName: string): Promise<SchoolSearchResult[]> {
    const parser = await getParser();
    return parser.searchSchool(schoolName);
}

/**
 * Fetch timetable from Comcigan
 */
export async function fetchTimetableFromComcigan(
    schoolName: string,
    grade: number,
    classNum: number
): Promise<InsertTimetable[]> {
    try {
        console.log(`[Comcigan] Fetching timetable: ${schoolName} ${grade}학년 ${classNum}반`);

        // 1. Search school
        const schools = await searchSchools(schoolName);
        if (schools.length === 0) {
            throw new Error(`학교를 찾을 수 없습니다: ${schoolName}`);
        }

        const school = schools[0];
        console.log(`[Comcigan] Found school: ${school.name} (${school.code})`);

        // 2. Get timetable data
        const parser = await getParser();
        const data = await parser.getTimetableData(school.code);

        // 3. Parse timetable
        const timetableData = parser.parseTimetable(data, grade, classNum);

        // 4. Fill in school info
        for (const entry of timetableData) {
            entry.schoolCode = school.code;
            entry.schoolName = school.name;
            entry.region = school.region;
        }

        console.log(`[Comcigan] Fetched ${timetableData.length} timetable entries`);
        return timetableData;

    } catch (error) {
        console.error('[Comcigan] Error:', error);
        throw new Error(`시간표 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
}
