-- 수행평가 테이블에 마지막 수정자 IP 추가
ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT;

-- 접속 로그에 HTTP 메서드 추가 (생성/수정/삭제 구분용)
ALTER TABLE access_logs ADD COLUMN method TEXT;
