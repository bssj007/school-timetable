-- D1 데이터베이스 초기화 스키마
DROP TABLE IF EXISTS performance_assessments;

CREATE TABLE IF NOT EXISTS performance_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  dueDate TEXT NOT NULL,
  grade INTEGER NOT NULL,
  classNum INTEGER NOT NULL,
  classTime INTEGER,
  isDone INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now'))
);

-- 예시 데이터 (1학년 1반)
INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum) 
VALUES ('국어', '시 암송하기', '교과서 34p 참고', '2024-12-31', 1, 1);
