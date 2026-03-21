import * as fs from 'fs';

async function testFetch() {
    try {
        const fetchWithProxy = async (targetUrl: string, headers: Record<string, string>, isEucKr: boolean) => {
            const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, { headers });
            if (res.ok) {
                if (isEucKr) {
                    const buf = await res.arrayBuffer();
                    return new TextDecoder('euc-kr').decode(buf);
                }
                const buf = await res.arrayBuffer();
                return new TextDecoder('utf-8').decode(buf).replace(/\0/g, '');
            }
            throw new Error(`Failed: ${res.status}`);
        };

        const HEADERS = {
            'Accept': '*/*',
            'Accept-Language': 'ko-KR,ko;q=0.9',
            'Referer': 'http://comci.net:4082/st',
            'User-Agent': 'Mozilla/5.0'
        };

        const html = await fetchWithProxy('http://comci.net:4082/st', HEADERS, true);
        const match = html.match(/sc_data\('([^']+)'/);
        if (!match) throw new Error("Could not find prefix string");
        const prefix = match[1];
        
        const SEARCH_HEX = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED";
        const searchJson = await fetchWithProxy(`http://comci.net:4082/${prefix}${SEARCH_HEX}`, HEADERS, false);
        const jsonString = searchJson.substring(searchJson.indexOf('{'), searchJson.lastIndexOf("}") + 1);
        const data = JSON.parse(jsonString);
        
        const target = data["학교검색"].find((s: string[]) => s[2] === "부산성지고");
        const code1 = target[3];
        const code2 = target[4];
        
        const param = `${prefix}${code2}_0_1`;
        const b64 = Buffer.from(param).toString('base64');
        const targetUrl = `http://comci.net:4082/${code1}?${b64}`;
        
        const resText = await fetchWithProxy(targetUrl, HEADERS, false);
        const stringJson = resText.substring(resText.indexOf('{'), resText.lastIndexOf("}") + 1);
        const rawData = JSON.parse(stringJson);
        
        console.log("일자:", rawData['일자']);
        console.log("시작일:", rawData['시작일']);
        
        const keys = Object.keys(rawData);
        const timetableProps = keys.filter(k => Array.isArray(rawData[k]) && rawData[k][1] && rawData[k][1][1] && Array.isArray(rawData[k][1][1]));
        console.log("Timetable Datasets:", timetableProps);
        
    } catch(e) { console.error(e); }
}
testFetch();
