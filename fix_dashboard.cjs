const fs = require('fs');
let content = fs.readFileSync('client/src/pages/Dashboard.tsx', 'utf8');

// 현재 블록 찾기
const startMarker = 'flex flex-row flex-nowrap items-center justify-center gap-1.5 overflow-hidden leading-tight">';
const endMarker = '</div>';

const startIdx = content.indexOf(startMarker);
if (startIdx < 0) { console.log('START NOT FOUND'); process.exit(1); }

// startIdx에서 div 시작점 찾기 (앞으로)
const divStart = content.lastIndexOf('<div', startIdx);
// 해당 div의 닫는 </div> 찾기
const afterStart = startIdx + startMarker.length;
const divEnd = content.indexOf(endMarker, afterStart) + endMarker.length;

const oldBlock = content.slice(divStart, divEnd);
console.log('Old block:\n', oldBlock);

const newBlock = `<div className="text-[10px] md:text-xs text-gray-500 mt-0.5 w-full px-1 text-center overflow-hidden leading-tight">
                                           <span className="whitespace-nowrap print:text-[1.8cqh]">
                                             {[
                                               (!isCancelledByFreePeriod && displayTeacher) ? displayTeacher : null,
                                               (settings?.show_target_class_main_menu !== false && displayClassName) ? displayClassName : null
                                             ].filter(Boolean).join('\u00a0')}
                                           </span>
                                         </div>`;

content = content.slice(0, divStart) + newBlock + content.slice(divEnd);

fs.writeFileSync('client/src/pages/Dashboard.tsx', content, 'utf8');
console.log('Done. Length:', content.length);
