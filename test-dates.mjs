import http from 'http';

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        http.get(url, {
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
function fetchUrlEucKr(url) {
    return new Promise((resolve, reject) => {
        http.get(url, {
            headers: {
                'Accept': '*/*',
                'Referer': 'http://comci.net:4082/st',
                'User-Agent': 'Mozilla/5.0'
            }
        }, (res) => {
            if (res.statusCode === 200) {
                let chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => {
                    const iconv = require('iconv-lite');
                    resolve(iconv.decode(Buffer.concat(chunks), 'euc-kr'));
                });
            } else {
                reject(new Error(`Failed with status ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function analyze() {
    try {
        const searchHex = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"; // 부산성지고
        
        console.log("Fetching prefix...");
        let html;
        try {
            const { execSync } = await import('child_process');
            html = execSync('curl -s http://comci.net:4082/st -H "Referer: http://comci.net:4082/st"').toString('utf-8');
        } catch (e) {
            console.log("cURL failed, trying fetch");
            html = await fetchUrl("http://comci.net:4082/st");
        }
        
        const match = html.match(/sc_data\('([^']+)'/);
        const prefix = match[1];
        
        console.log("Fetching school code...");
        const searchJson = await fetchUrl(`http://comci.net:4082/${prefix}${searchHex}`);
        const jsonString = searchJson.substring(searchJson.indexOf('{'), searchJson.lastIndexOf("}") + 1);
        const codeData = JSON.parse(jsonString);
        const target = codeData["학교검색"].find(s => s[2] === "부산성지고");
        const code1 = target[3];
        const code2 = target[4];
        
        console.log("Fetching timetable raw data...");
        const b64 = Buffer.from(`${prefix}${code2}_0_1`).toString('base64');
        const dataJsonStr = await fetchUrl(`http://comci.net:4082/${code1}?${b64}`);
        const finalJsonString = dataJsonStr.substring(dataJsonStr.indexOf('{'), dataJsonStr.lastIndexOf("}") + 1);
        const rawData = JSON.parse(finalJsonString);
        
        const keys = Object.keys(rawData);
        console.log("All properties:", keys);
        
        if (rawData['일자']) console.log("일자 (Dates):", rawData['일자']);
        if (rawData['시작일']) console.log("시작일 (Start Date):", rawData['시작일']);
        
        const timetableProps = keys.filter(k => Array.isArray(rawData[k]) && rawData[k][1] && rawData[k][1][1] && Array.isArray(rawData[k][1][1]));
        console.log("Timetable datasets:", timetableProps);
        
    } catch (e) {
        console.error(e);
    }
}
analyze();
