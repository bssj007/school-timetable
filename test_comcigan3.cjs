const fs = require('fs');

async function testFetch() {
    const code1 = 36179;
    const code2 = 93342;
    const grade = 2;
    const BASE_URL = "http://comci.net:4082";

    try {
        const stRes = await fetch("http://comci.net:4082/st", {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const stHtml = await stRes.text();
        const match = stHtml.match(/sc_data\('([^']+)'/);
        const prefix = match ? match[1] : '';

        const param = `${prefix}${code2}_0_${grade}`;
        const b64 = Buffer.from(param).toString('base64');
        const targetUrl = `${BASE_URL}/${code1}?${b64}`;
        console.log("Fetching:", targetUrl);

        const jsonTextRes = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        let jsonText = await jsonTextRes.text();

        const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
        const rawData = JSON.parse(jsonString);

        const teacherProp = Object.keys(rawData).find(k => Array.isArray(rawData[k]) && rawData[k].some((s) => typeof s === 'string' && s.endsWith('*'))) || "";
        const teachers = rawData[teacherProp] || [];

        let subjectProp = Object.keys(rawData).find(k => {
            const val = rawData[k];
            if (!Array.isArray(val)) return false;
            let kc = 0;
            if (val[1] && typeof val[1] === 'string') kc++;
            if (val[2] && typeof val[2] === 'string') kc++;
            return kc > 0 && k !== teacherProp;
        }) || "";
        const subjects = rawData[subjectProp] || [];
        const bunri = rawData['분리'] !== undefined ? rawData['분리'] : 100;

        console.log("Subjects:", subjects.length);
        console.log("Teachers:", teachers.length);
        console.log("bunri:", bunri);

        const timetableProps = Object.keys(rawData).filter(k => {
            const val = rawData[k];
            return Array.isArray(val) && val[grade] && val[grade][1] && Array.isArray(val[grade][1]);
        });

        console.log("Timetable props:", timetableProps);

        for (const prop of timetableProps) {
            console.log(`\n\n=== Prop: ${prop} ===`);
            const class1Data = rawData[prop][2][1];
            if (!class1Data) continue;
            for (let w = 1; w <= 5; w++) {
                console.log(`Day ${w}:`);
                const day = class1Data[w];
                if (!day || !Array.isArray(day)) {
                    console.log("  No data or not array:", day);
                    continue;
                }
                for (let p = 1; p < day.length; p++) {
                    const code = day[p];
                    if (!code) {
                        console.log(`  ${p}: Empty`);
                        continue;
                    }
                    let tIdx = 0, sIdx = 0;
                    if (bunri === 100) {
                        tIdx = Math.floor(code / bunri);
                        sIdx = code % bunri;
                    } else {
                        tIdx = code % bunri;
                        sIdx = Math.floor(code / bunri);
                    }
                    const s = subjects[sIdx] ? subjects[sIdx].replace(/_/g, "") : "";
                    const t = teachers[tIdx] || "";
                    console.log(`  ${p}: code=${code} -> ${s} (${t})`);
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}
testFetch();
