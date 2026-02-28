import fs from 'fs';

const raw = fs.readFileSync('output_live_api_get.json', 'utf8');
const { data, debugTokens } = JSON.parse(raw);

console.log("Debug Tokens:", debugTokens);

const class1Data = data.filter(d => d.class === 1);
console.log(`Class 1 has ${class1Data.length} entries`);

const byDay = { 0: [], 1: [], 2: [], 3: [], 4: [] };
for (const d of class1Data) {
    byDay[d.weekday].push(`${d.classTime}교시: ${d.subject}(${d.teacher})`);
}

for (let w = 0; w < 5; w++) {
    console.log(`Weekday ${w} (0=Mon): ${byDay[w].length} classes`);
    if (byDay[w].length > 0) {
        console.log("  " + byDay[w].join(", "));
    }
}
