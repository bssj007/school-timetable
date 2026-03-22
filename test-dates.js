const https = require('https');
const http = require('http');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const h = url.startsWith('https') ? https : http;
        h.get(url, {
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Referer': 'http://comci.net:4082/st',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            if (res.statusCode === 200) {
                let chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            } else {
                reject(new Error(`Failed with status ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function analyze() {
    try {
        const proxyUrl = "https://api.allorigins.win/raw?url=";
        const searchHex = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"; // 부산성지고
        
        console.log("Fetching prefix...");
        const html = await fetchUrl(proxyUrl + encodeURIComponent("http://comci.net:4082/st"));
        const match = html.match(/sc_data\('([^']+)'/);
        const prefix = match[1];
        
        console.log("Fetching school code...");
        const searchJson = await fetchUrl(proxyUrl + encodeURIComponent(`http://comci.net:4082/${prefix}${searchHex}`));
        const jsonString = searchJson.substring(searchJson.indexOf('{'), searchJson.lastIndexOf("}") + 1);
        const codeData = JSON.parse(jsonString);
        const target = codeData["학교검색"].find(s => s[2] === "부산성지고");
        const code1 = target[3];
        const code2 = target[4];
        
        console.log("Fetching timetable raw data...");
        const b64 = Buffer.from(`${prefix}${code2}_0_1`).toString('base64');
        const dataJsonStr = await fetchUrl(proxyUrl + encodeURIComponent(`http://comci.net:4082/${code1}?${b64}`));
        const finalJsonString = dataJsonStr.substring(dataJsonStr.indexOf('{'), dataJsonStr.lastIndexOf("}") + 1);
        const rawData = JSON.parse(finalJsonString);
        
        const keys = Object.keys(rawData);
        console.log("All properties:", keys);
        
        const timeInfoProp = keys.find(k => Array.isArray(rawData[k]) && rawData[k].length === 8 && typeof rawData[k][1] === 'number');
        console.log("timeInfoProp:", timeInfoProp);
        if (timeInfoProp) {
            console.log("timeInfoData:", rawData[timeInfoProp]);
        }
        
        if (rawData['일자']) console.log("일자:", rawData['일자']);
        if (rawData['시작일']) console.log("시작일:", rawData['시작일']);
        
        const timetableProps = keys.filter(k => Array.isArray(rawData[k]) && rawData[k][1] && rawData[k][1][1] && Array.isArray(rawData[k][1][1]));
        console.log("Timetable datasets:", timetableProps);
        
        for (const k of timetableProps) {
            let dataCount = 0;
            const gradeData = rawData[k][1];
            if (gradeData) {
                for (let c = 1; c < gradeData.length; c++) {
                    const classData = gradeData[c];
                    if (classData) {
                        for (let w = 1; w <= 5; w++) {
                            if (classData[w] && Array.isArray(classData[w])) {
                                dataCount += classData[w].filter(x => typeof x === 'number' && x > 0).length;
                            }
                        }
                    }
                }
            }
            console.log(`- ${k}: Gr1 data count = ${dataCount}`);
            
            let g2Count = 0;
            const g2Data = rawData[k][2];
            if (g2Data) {
                for (let c = 1; c < g2Data.length; c++) {
                    const classData = g2Data[c];
                    if (classData) {
                        for (let w = 1; w <= 5; w++) {
                            if (classData[w] && Array.isArray(classData[w])) {
                                g2Count += classData[w].filter(x => typeof x === 'number' && x > 0).length;
                            }
                        }
                    }
                }
            }
            console.log(`- ${k}: Gr2 data count = ${g2Count}`);
        }
        
        // Find other date arrays
        const arrays = keys.filter(k => Array.isArray(rawData[k])).map(k => ({ key: k, head: rawData[k].slice(0,3) }));
        console.log("Array props looking for dates:", arrays.filter(a => typeof a.head[0] === 'string' && a.head[0].includes('-')));
        
    } catch (e) {
        console.error(e);
    }
}
analyze();
