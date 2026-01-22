# 💬 카카오톡 알림 설정 가이드

## 📋 개요
수행평가 하루 전 자동으로 카카오톡 메시지를 받을 수 있습니다!
- **알림 시간**: 매일 오전 9시
- **알림 조건**: 내일 수행평가가 있는 경우

---

## 🔧 Kakao Developers 설정 (관리자용)

### 1. 애플리케이션 설정
```
https://developers.kakao.com/console 접속

1. 내 애플리케이션 > school-timetable 선택
2. 플랫폼 설정 > Web 플랫폼 추가
   - 사이트 도메인: 
     https://school-timetable.pages.dev
     (필요시 프리뷰 도메인도 추가: https://school-timetable-8ln.pages.dev 등)

3. Redirect URI 설정:
   https://school-timetable.pages.dev/callback
   
   ⚠️ 프리뷰 환경 테스트를 위해서는 해당 도메인의 콜백도 추가해야 합니다:
   https://school-timetable-8ln.pages.dev/callback
```

### 4. 동의항목 설정:
   - 카카오톡 메시지 전송: 필수 동의
   - 친구 목록 조회: 선택 동의

### 5. 비즈니스 설정 > 메시지 템플릿 등록 (선택)

### 2. REST API 키 확인
```
현재 사용 중인 키: bad8ca2530fb7a47eaf2e14ba1d2bb94
위치: functions/api/kakao/[[path]].ts 및 functions/callback.ts
```

---

## 👤 사용자 가이드

### 1. 카카오 로그인
```
1. 사이트 접속: https://school-timetable.pages.dev
2. 우측 상단 "카카오 알림 연동" 버튼 클릭
3. 카카오 로그인 후 동의
4. 자동으로 사이트로 돌아옴
```

### 2. 수행평가 등록
```
1. 시간표에서 과목 클릭
2. 수행평가 정보 입력
3. 저장
```

### 3. 알림 받기
```
- 매일 오전 9시 자동 체크
- 내일 수행평가가 있으면 카카오톡 메시지 전송
```

---

## 📱 알림 메시지 예시

```
📝 내일 수행평가 알림!

과목: 국어
내용: 시 암송하기
날짜: 2024-12-22
교시: 3교시

열심히 준비하세요! 화이팅 💪

[바로가기: 학교 시간표 위키]
```

---

## 🔧 트러블슈팅

### 알림이 안 와요
1. **카카오 로그인 확인**
   - "카카오 알림 연동" 버튼 다시 클릭
   - 로그인 상태 확인

2. **수행평가 날짜 확인**
   - 알림은 하루 전에만 발송
   - 내일 날짜인지 확인

3. **DB 확인 (관리자)**
   ```sql
   SELECT * FROM users WHERE notificationEnabled = 1;
   ```

### Redirect URI 오류 (404 Not Found)
- `https://.../callback` 경로가 존재하지 않는 것처럼 보이는 경우, `functions/callback.ts` 파일이 배포되었는지 확인하세요.
- Kakao Developers Console에 해당 도메인의 Redirect URI가 등록되어 있는지 확인하세요.

---

## 🚀 배포 체크리스트

### Cloudflare Pages Functions
- `functions/api/kakao/[[path]].ts`: 로그인 시작 (Redirect URI 생성)
- `functions/callback.ts`: 로그인 콜백 처리 (토큰 발급)

### Cloudflare D1 마이그레이션
```sql
-- 1. users 테이블 생성
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
```
