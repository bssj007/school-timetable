# ✅ Git 설정 완료!

## 완료된 작업

- ✅ Git 초기화
- ✅ 사용자 설정 (bssj007 / uzokingkong4@gmail.com)
- ✅ 파일 추가 (120개 파일)
- ✅ 첫 커밋 완료

## 다음 단계: GitHub 리포지토리 생성

### 1. GitHub에서 새 리포지토리 생성

1. https://github.com/new 접속
2. Repository name: `school-timetable` 입력
3. **Public** 선택
4. **Initialize this repository with a README 체크 해제** (중요!)
5. "Create repository" 클릭

### 2. GitHub에 푸시

리포지토리 생성 후 아래 명령어 실행:

```bash
git remote add origin https://github.com/bssj007/school-timetable.git
git branch -M main
git push -u origin main
```

또는 PowerShell에서:

```powershell
git remote add origin https://github.com/bssj007/school-timetable.git
git branch -M main
git push -u origin main
```

### 3. GitHub 인증

푸시 시 인증 요구되면:
- **Username**: bssj007
- **Password**: GitHub Personal Access Token 사용
  (비밀번호 대신 토큰 필요)

#### Personal Access Token 생성:
1. https://github.com/settings/tokens
2. "Generate new token (classic)" 클릭
3. Note: "school-timetable"
4. Expiration: 90 days
5. Scopes: `repo` 체크
6. "Generate token" 클릭
7. 생성된 토큰 복사 (한 번만 표시됨!)

### 4. Cloudflare Pages 배포

GitHub 업로드 완료 후:

1. https://pages.cloudflare.com/ 접속
2. "Create a project" 클릭
3. "Connect to Git" → GitHub 연동
4. 리포지토리 선택: `school-timetable`
5. 빌드 설정:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist/public`
6. "Save and Deploy" 클릭

## 완료!

배포 URL: `https://school-timetable.pages.dev`

---

**현재 상태:**
- ✅ Git 설정 완료
- ⏳ GitHub 리포지토리 생성 필요
- ⏳ GitHub 푸시 필요
- ⏳ Cloudflare Pages 배포 필요
