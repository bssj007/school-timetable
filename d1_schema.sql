-- D1 데이터베이스 초기화 스키마
DROP TABLE IF EXISTS performance_assessments;
DROP TABLE IF EXISTS users;

-- 사용자 테이블 (카카오 인증)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kakaoId TEXT UNIQUE NOT NULL,
  kakaoAccessToken TEXT,
  kakaoRefreshToken TEXT,
  nickname TEXT,
  grade INTEGER NOT NULL,
  classNum INTEGER NOT NULL,
  notificationEnabled INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS performance_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  dueDate TEXT NOT NULL,
  grade INTEGER NOT NULL,
  classNum INTEGER NOT NULL,
  classTime INTEGER,
  isDone INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- 예시 데이터 (1학년 1반)
INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime) 
VALUES ('국어', '시 암송하기', '1차', '2024-12-31', 1, 1, 1);
