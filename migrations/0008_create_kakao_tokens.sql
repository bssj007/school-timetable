-- Create kakao_tokens table if not exists
CREATE TABLE IF NOT EXISTS kakao_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kakaoId TEXT NOT NULL UNIQUE,
    accessToken TEXT NOT NULL,
    refreshToken TEXT,
    updatedAt TEXT DEFAULT (datetime('now')) NOT NULL
);

-- Index for faster lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_kakao_tokens_kakaoId ON kakao_tokens(kakaoId);
