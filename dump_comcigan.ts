import fs from 'fs';
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
            "User-Agent": "Mozilla/5.0"
        });
        const match = jsonText.match(/sc_data\('([^']+)'\)/);
        if (!match) throw new Error("Prefix not found");
        const prefix = match[1];

        console.log(`Prefix: ${prefix}`);

        console.log("Fetching school info for '충현고등학교'...");
        const schoolQueryBase64 = Buffer.from("충현고등학교").toString('base64');
        const schoolJson = await fetchWithProxy(`${BASE_URL}/${prefix}?${schoolQueryBase64}`, {
            "User-Agent": "Mozilla/5.0"
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
            "User-Agent": "Mozilla/5.0"
        });

        fs.writeFileSync("comcigan_dump.json", timetableJson.substring(timetableJson.indexOf('{'), timetableJson.lastIndexOf("}") + 1));
        console.log("Dumped to comcigan_dump.json");
    } catch (e) {
        console.error(e);
    }
}

inspect();
