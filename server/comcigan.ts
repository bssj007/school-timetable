/**
 * 컴시간알리미 실제 API 연동
 * 컴시간 웹사이트에서 직접 데이터를 가져옵니다
 */

export {
    searchSchools,
    fetchTimetableFromComcigan,
} from './comcigan-parser';

export type { SchoolSearchResult } from './comcigan-parser';

// Re-export the parser class if needed
export { ComciganParser, getParser } from './comcigan-parser';

