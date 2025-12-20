# Git & GitHub 설정 가이드

## 1. Git 초기화

```bash
git init
git add .
git commit -m "Initial commit"
```

## 2. GitHub 리포지토리 생성

1. https://github.com/new 접속
2. Repository name: `school-timetable`
3. Public 선택
4. Create repository 클릭

## 3. GitHub 연결

```bash
git remote add origin https://github.com/your-username/school-timetable.git
git branch -M main
git push -u origin main
```

## 4. Cloudflare Pages 배포

1. https://pages.cloudflare.com/ 접속
2. "Create a project" 클릭
3. GitHub 연동
4. 리포지토리 선택: `school-timetable`
5. 빌드 설정:
   - Build command: `npm run build`
   - Build output directory: `dist/public`
6. "Save and Deploy" 클릭

## 완료!

배포 URL: `https://school-timetable.pages.dev`
