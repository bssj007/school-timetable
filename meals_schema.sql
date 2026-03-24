CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  calories TEXT,
  origins TEXT,
  type TEXT,
  sysId TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);
