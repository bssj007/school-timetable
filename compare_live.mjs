import fs from 'fs';

const rawProxy = JSON.parse(fs.readFileSync('output_proxy_raw.json', 'utf8'));
const liveApi = JSON.parse(fs.readFileSync('output_live_api_get.json', 'utf8'));

console.log("From AllOrigins Raw JSON:");
console.log("자료481 2학년 1반 월요일:", rawProxy["자료481"][2][1][1]);
console.log("자료147 2학년 1반 월요일:", rawProxy["자료147"][2][1][1]);
console.log("자료481 2학년 1반 목요일:", rawProxy["자료481"][2][1][4]);
console.log("자료147 2학년 1반 목요일:", rawProxy["자료147"][2][1][4]);

console.log("\nFrom Cloudflare Live API (data for class 1, Mon & Thu):");
const monClasses = liveApi.data.filter(d => d.class === 1 && d.weekday === 0);
const thuClasses = liveApi.data.filter(d => d.class === 1 && d.weekday === 3);

console.log("Mon (Weekday 0):", monClasses.map(c => `${c.classTime}: ${c.subject}`));
console.log("Thu (Weekday 3):", thuClasses.map(c => `${c.classTime}: ${c.subject}`));
