const fs = require('fs');
let content = fs.readFileSync('client/src/pages/TeacherPage.tsx', 'utf8');

// 복수 케이스: 강의반(codes.join) → uniqueNames 또는 (codes.join)
content = content
  .replaceAll('`강의반(${codes.join(\', \')})`', "uniqueNames.length > 0 ? uniqueNames.join(', ') : `(${codes.join(', ')})`")
  // 나머지 남은 단순 복수 fallback
  .replaceAll(': `강의반(${codes.join(\', \')})`', ": `(${codes.join(', ')})`");

// 단수 케이스: 강의반(codes[0]) → (codes[0])
content = content.replaceAll('`강의반(${codes[0]})`', '`(${codes[0]})`');

fs.writeFileSync('client/src/pages/TeacherPage.tsx', content, 'utf8');

const remaining = (content.match(/강의반/g) || []).length;
console.log('Done. Remaining 강의반:', remaining);
// 어디에 남아있는지
let i = 0;
while (true) {
  i = content.indexOf('강의반', i);
  if (i < 0) break;
  console.log('at', i, ':', JSON.stringify(content.slice(i, i+60)));
  i++;
}
