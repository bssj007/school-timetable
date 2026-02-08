-- 관리자 기능을 위한 테이블 추가

-- 차단된 사용자 관리
CREATE TABLE IF NOT EXISTS blocked_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL, -- IP or KakaoId
  type TEXT NOT NULL, -- 'IP' or 'KAKAO_ID'
  reason TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);

-- 접속 로그 (IP 추적용)
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  kakaoId TEXT,
  kakaoNickname TEXT,
  endpoint TEXT,
  accessedAt TEXT DEFAULT (datetime('now'))
);
