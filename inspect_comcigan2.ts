import https from 'https';

const BASE_URL = 'https://comci.kr:4082';

async function fetchWithProxy(url: string, headers: any) {
    return new Promise<string>((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function inspect() {
    try {
        console.log("Fetching prefix...");
        const jsonText = await fetchWithProxy(`${BASE_URL}/st`, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "*/*"
        });
        const match = jsonText.match(/sc_data\('([^']+)'\)/);
        if (!match) throw new Error("Prefix not found");
        const prefix = match[1];

        console.log(`Prefix: ${prefix}`);

        console.log("Fetching school info for '충현고등학교'...");
        const schoolQueryBase64 = Buffer.from("충현고등학교").toString('base64');
        const schoolJson = await fetchWithProxy(`${BASE_URL}/${prefix}?${schoolQueryBase64}`, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        });

        const schoolDataStr = schoolJson.substring(schoolJson.indexOf('{'), schoolJson.lastIndexOf("}") + 1);
        const parsed = JSON.parse(schoolDataStr);
        const schoolObj = parsed['학교명'].find((s: any) => s[2] === "충현고등학교");
        const code1 = schoolObj[3];
        const code2 = schoolObj[4];
        console.log(`Code1: ${code1}, Code2: ${code2}`);

        const param = `${prefix}${code2}_0_3`; // Grade 3
        const b64 = Buffer.from(param).toString('base64');
        const targetUrl = `${BASE_URL}/${code1}?${b64}`;

        console.log("Fetching timetable data...");
        const timetableJson = await fetchWithProxy(targetUrl, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        });
        const jsonString = timetableJson.substring(timetableJson.indexOf('{'), timetableJson.lastIndexOf("}") + 1);
        const rawData = JSON.parse(jsonString);

        console.log("Raw Data Keys:", Object.keys(rawData));

        const keys = Object.keys(rawData);
        const teacherProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].some((s: any) => typeof s === 'string' && s.endsWith('*'))) || "";

        const keywords = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학", "체육", "음악", "미술", "진로", "운동", "독서", "문학"];
        let subjectProp = keys.find(k => {
            const val = rawData[k];
            if (!Array.isArray(val)) return false;
            for (let i = 0; i < Math.min(val.length, 100); i++) {
                if (typeof val[i] === 'string' && keywords.some(kw => val[i].includes(kw))) return true;
            }
            return false;
        }) || "";

        console.log(`Deduced teacherProp: ${teacherProp}, subjectProp: ${subjectProp}`);

        const timetableProps = keys.filter(k => {
            const val = rawData[k];
            // Just check if class 1 exists for the grade to find the timedata property
            return Array.isArray(val) && val[3] && val[3][1] && Array.isArray(val[3][1]);
        });
        console.log(`Timetable properties found:`, timetableProps);

        const firstTimetableProp = timetableProps.length > 0 ? timetableProps[0] : "";
        const lastTimetableProp = timetableProps.length > 0 ? timetableProps[timetableProps.length - 1] : "";

        console.log(`Original Timetable Prop: ${firstTimetableProp}`);
        console.log(`Changed Timetable Prop: ${lastTimetableProp}`);

        // Print differences for Grade 3 Class 5
        console.log("\n--- Grade 3 Class 5 (Original) ---");
        const origData = rawData[firstTimetableProp][3][5];
        if (origData) {
            for (let d = 1; d <= 5; d++) {
                let row = `Day ${d}: `;
                if (origData[d]) {
                    for (let p = 1; p <= 7; p++) {
                        row += origData[d][p] + " ";
                    }
                }
                console.log(row);
            }
        }

        console.log("\n--- Grade 3 Class 5 (Changed) ---");
        const changedData = rawData[lastTimetableProp][3][5];
        if (changedData) {
            for (let d = 1; d <= 5; d++) {
                let row = `Day ${d}: `;
                if (changedData[d]) {
                    for (let p = 1; p <= 7; p++) {
                        row += changedData[d][p] + " ";
                    }
                }
                console.log(row);
            }
        }

    } catch (e) {
        console.error(e);
    }
}

inspect();
