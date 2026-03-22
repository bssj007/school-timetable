-- 컴시간 라이브 데이터셋 통합 마이그레이션 SQL (Cloudflare D1)
-- 사용법: Cloudflare 대시보드에서 D1 콘솔 터미널에 아래 쿼리들을 순차적으로 복사/붙여넣기 하거나
-- 터미널에서 `npx wrangler d1 execute school-timetable --remote --file=migration.sql` 등을 실행하세요.

-- 1. 선택과목 설정(elective_config) 데이터셋 변경 (MANUAL_PLAN 등 수동시간표 제외)
UPDATE elective_config 
SET dataset = 'COMCIGAN', updatedAt = datetime('now')
WHERE dataset NOT IN ('MANUAL_PLAN', 'SEMESTER_PLAN', 'COMCIGAN', '');

-- 2. 수행평가 데이터셋 변경
UPDATE performance_assessments 
SET dataset = 'COMCIGAN'
WHERE dataset NOT IN ('MANUAL_PLAN', 'SEMESTER_PLAN', 'COMCIGAN', '');

-- 3. 학생 프로필 - 원시 문자열 형태인 과거 데이터셋 ('자료481' 등) 변환
UPDATE student_profiles
SET dataset = 'COMCIGAN', updatedAt = datetime('now')
WHERE json_valid(dataset) = 0 
  AND dataset NOT IN ('MANUAL_PLAN', 'SEMESTER_PLAN', 'COMCIGAN', '');

-- 4. 학생 프로필 - JSON 배열 형태인 데이터셋 (["자료147", "MANUAL_PLAN"] -> ["COMCIGAN", "MANUAL_PLAN"])
-- SQLite JSON1 확장 함수를 사용하여, 자료XXX 포맷들을 모두 COMCIGAN으로 안전하게 매핑 치환합니다.
UPDATE student_profiles
SET dataset = (
    SELECT json_group_array(
        CASE 
            WHEN value NOT IN ('MANUAL_PLAN', 'SEMESTER_PLAN', 'COMCIGAN') AND value != '' THEN 'COMCIGAN'
            ELSE value 
        END
    )
    FROM (
        SELECT value FROM json_each(student_profiles.dataset) ORDER BY key ASC
    )
), updatedAt = datetime('now')
WHERE json_valid(dataset) = 1 AND json_type(dataset) = 'array';
