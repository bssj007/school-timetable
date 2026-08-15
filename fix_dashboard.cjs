const fs = require('fs');
let content = fs.readFileSync('client/src/pages/Dashboard.tsx', 'utf8');

// 1) 빈 조건 블록 + <> 래퍼 제거
// 찾을 패턴: {!isCancelledByFreePeriod && displayTeacher && (\n   \n)} 부분
const emptyBlockRegex = /\{!isCancelledByFreePeriod\s*&&\s*displayTeacher\s*&&\s*\(\s*\n\s*\n?\s*\)\}/;
const match = content.match(emptyBlockRegex);
if (match) {
  console.log('Found empty block:', JSON.stringify(match[0]));
  content = content.replace(emptyBlockRegex, '');
  console.log('Empty block removed');
} else {
  console.log('Empty block NOT found via regex');
}

// <> ... </> 래퍼도 제거 (displayClassName span만 남기기)
const fragmentRegex = /\n\s*<>\s*\n(\s*<span className="shrink-0 font-medium text-gray-600[^"]*">\s*\n\s*\{displayClassName\}\s*\n\s*<\/span>)\s*\n\s*<\/>/;
const fragMatch = content.match(fragmentRegex);
if (fragMatch) {
  console.log('Found fragment wrapper');
  content = content.replace(fragmentRegex, '\n' + fragMatch[1]);
  console.log('Fragment wrapper removed');
} else {
  console.log('Fragment wrapper NOT found');
  // 현재 상태 출력
  const idx = content.indexOf('shrink-0 font-medium');
  if (idx >= 0) {
    console.log('Context around shrink-0:', JSON.stringify(content.slice(idx-200, idx+200)));
  }
}

// 2) 배지 div에 flex 추가
if (!content.includes('print:hidden flex')) {
  content = content.replace(
    '<div className="absolute bottom-0 right-0 print:hidden">',
    '<div className="absolute bottom-0 right-0 print:hidden flex">'
  );
  console.log('Added flex to badge div');
}

fs.writeFileSync('client/src/pages/Dashboard.tsx', content, 'utf8');
console.log('Done.');
