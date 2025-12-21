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
   - 사이트 도메인: https://school-timetable.pages.dev

3. Redirect URI 설정:
   https://school-timetable.pages.dev/api/kakao/callback

4. 동의항목 설정:
   - 카카오톡 메시지 전송: 필수 동의
   - 친구 목록 조회: 선택 동의

5. 비즈니스 설정 > 메시지 템플릿 등록 (선택)
```

### 2. REST API 키 확인
```
현재 사용 중인 키: bad8ca2530fb7a47eaf2e14ba1d2bb94
위치: functions/api/kakao/[[path]].ts
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

### 토큰 만료 시
```
- 카카오 access token은 6시간 유효
- refresh token으로 자동 갱신 필요
- 현재는 수동 재로그인 필요
```

---

## 🚀 배포 체크리스트

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

-- 2. performance_assessments에 userId 추가
ALTER TABLE performance_assessments ADD COLUMN userId INTEGER;
```

### Cloudflare Pages Cron 활성화

⚠️ **중요**: Cloudflare Pages는 wrangler.toml에서 cron 설정을 지원하지 않습니다.
대신 직접 Dashboard에서 설정해야 합니다:

```
1. Cloudflare Dashboard 접속
   https://dash.cloudflare.com

2. Workers & Pages > school-timetable 선택

3. Settings > Functions > Cron Triggers 탭

4. Add Cron Trigger 클릭
   - Cron expression: 0 0 * * *
   - 설명: Daily assessment reminder at 9 AM KST
   
5. 저장

참고: UTC 0시 = KST 9시
```

또는 현재는 **Cloudflare Pages에서 scheduled handlers (_scheduled.ts)를 완전히 지원하지 않습니다**.
대안:
- External cron service (cron-job.org, EasyCron 등) 사용
- Cloudflare Worker로 별도 배포
```

---

## 📊 시스템 흐름도

```
[사용자]
   ↓
[카카오 로그인] → OAuth 인증
   ↓
[토큰 저장] → D1 Database (users 테이블)
   ↓
[수행평가 등록] → performance_assessments 테이블 (userId 포함)
   ↓
[매일 오전 9시] → Cloudflare Cron Trigger
   ↓
[내일 수행평가 조회] → SQL Query
   ↓
[카카오 메시지 전송] → Kakao API
   ↓
[사용자 카카오톡 수신] 💬
```

---

## 🔐 보안 고려사항

1. **토큰 저장**
   - Access token은 DB에 암호화 없이   저장 (주의!)
   - 프로덕션에서는 암호화 권장

2. **권한 관리**
   - 사용자는 자신의 수행평가만 조회
   - userId로 데이터 격리

3. **토큰 갱신**
   - Refresh token 활용 필요
   - 만료 시 자동 재발급 로직 추가 예정

---

## 📚 참고 자료

- [Kakao Developers 문서](https://developers.kakao.com/docs)
- [Kakao 메시지 API](https://developers.kakao.com/docs/latest/ko/message/rest-api)
- [Cloudflare Workers Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
