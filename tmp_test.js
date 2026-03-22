async function run() {
    try {
        const HEADERS = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': 'http://comci.net:4082/st'
        };

        const prefix = '79946'; // common fallback
        let code1 = "36179";
        let code2 = "21568";
        
        // First try to fetch the prefix dynamically
        try {
            const htmlArr = await fetch('http://comci.net:4082/st', { headers: HEADERS }).then(r => r.arrayBuffer());
            const text = new TextDecoder('euc-kr').decode(htmlArr);
            const match = text.match(/sc_data\('([^']+)'/);
            if (match) {
                let actualPrefix = match[1];
                let searchUrl = `http://comci.net:4082/${actualPrefix}?${Buffer.from("부산성지고").toString('base64')}`;
                let searchHtml = await fetch(searchUrl, { headers: HEADERS }).then(r => r.text());
                if (searchHtml && searchHtml.includes('{')) {
                    let jsonStr = searchHtml.substring(searchHtml.indexOf('{'), searchHtml.lastIndexOf('}') + 1);
                    let data = JSON.parse(jsonStr);
                    let target = data['학교검색'].find(s => s[2] === "부산성지고");
                    if (target) {
                        code1 = target[3];
                        code2 = target[4];
                        param = `${actualPrefix}${code2}_0_1`;
                    }
                }
            }
        } catch(e) { }

        let param = `80145${code2}_0_1`; // hardcoded guess if above fails
        let b64 = Buffer.from(param).toString('base64');
        let targetUrl = `http://comci.net:4082/${code1}?${b64}`;

        let timetableResp = await fetch(targetUrl, { headers: HEADERS }).then(r => r.text());
        if (!timetableResp.includes('{')) {
            console.log("Could not find table JSON. Dumping raw text:", timetableResp.substring(0, 100));
            return;
        }
        let finalJson = timetableResp.substring(timetableResp.indexOf('{'), timetableResp.lastIndexOf('}') + 1);
        let parsed = JSON.parse(finalJson.replace(/\0/g, ''));
        
        console.log("일자 ARRAY:", parsed['일자']);
        
        let keys = Object.keys(parsed).filter(k => k.startsWith('자료') && !isNaN(parseInt(k.replace('자료', ''))));
        keys.sort((a,b)=>parseInt(a.replace('자료', '')) - parseInt(b.replace('자료', '')));
        
        console.log("TIMETABLE KEYS:", keys);
        keys.forEach((k, idx) => {
            let arr = parsed[k];
            let hasData = Array.isArray(arr) && arr[1] && arr[1][1] && Array.isArray(arr[1][1]);
            console.log(`[${idx}] ${k}: hasData=${hasData}`);
            if (hasData) {
                console.log(`     Data Exists. Length=${arr.length}`);
            }
        });
    } catch (e) {
        console.error(e);
    }
}
run();
