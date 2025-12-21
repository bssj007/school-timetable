
const BASE_URL = "http://comci.net:4082";
// "부산성지고" EUC-KR Hex String
const SEARCH_KEYWORD_HEX = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED";

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'http://comci.net:4082/st',
    'Accept': '*/*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'X-Requested-With': 'XMLHttpRequest'
};

async function polyfillEucKrDecoder(buffer) {
    // Node.js TextDecoder supports euc-kr
    return new TextDecoder('euc-kr').decode(buffer);
}

async function fullFlow() {
    try {
        console.log("=== 1. Init: Fetching Prefix from /st ===");
        const initRes = await fetch(`${BASE_URL}/st`, { headers: HEADERS });
        const initBuf = await initRes.arrayBuffer();
        const initHtml = await polyfillEucKrDecoder(initBuf);

        // Extract sc_data('73629_', ...)
        const match = initHtml.match(/sc_data\('([^']+)'/);
        if (!match) throw new Error("Prefix not found in /st");

        const prefix = match[1]; // "73629_"
        console.log(`   -> Prefix: ${prefix}`);

        console.log("=== 2. Search: Fetching School Code ===");
        const searchUrl = `${BASE_URL}/${prefix}${SEARCH_KEYWORD_HEX}`;
        console.log(`   -> POST URL: ${searchUrl}`);

        // Search usually returns JSON-like text
        // E.g. {"학교명":["부산성지고","..."],"학교코드":[36179,...],"코드2":[93342,...]}
        // Wait, parser implementation used simple fetch
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        const searchBuf = await searchRes.arrayBuffer();
        const searchText = new TextDecoder('utf-8').decode(searchBuf); // Search result is usually UTF-8 or EUC-KR? 
        // Let's assume UTF-8 first, if broken try EUC-KR
        // Remove nulls
        let cleanSearch = searchText.replace(/\0/g, '');
        // Usually looks like: { "학교검색": [ ... ] }
        console.log(`   -> Search Raw (First 100): ${cleanSearch.substring(0, 100)}`);

        // Comcigan search result format is tricky.
        // Usually: {"학교검색":[[...],[...],...]}
        // Let's parse it safely
        const searchData = JSON.parse(cleanSearch.substring(cleanSearch.indexOf('{'), cleanSearch.lastIndexOf("}") + 1));

        // Find our school
        // Structure: searchData["학교검색"] = [ [Region, Name, Code1, Code2], ... ]
        // Or similar.
        const schools = searchData["학교검색"];
        console.log(`   -> Found ${schools.length} schools`);

        const target = schools.find(s => s[2] === "부산성지고");
        if (!target) {
            console.log("   -> Dumping schools:", JSON.stringify(schools));
            throw new Error("School not found!");
        }

        // target: [Region, Code1(36179?), Name?, Code2(93342?)]
        // Let's inspect target
        console.log(`   -> Target Found: ${JSON.stringify(target)}`);

        const region = target[0];
        const schoolName = target[2];
        const code1 = target[3]; // 36179 (Education Office Code?)
        const code2 = target[4]; // 93342 (Comcigan Code?)

        console.log(`   -> Code1: ${code1}, Code2: ${code2}`);

        console.log("=== 3. Fetching Timetable ===");
        const grade = 1;
        // Construct Param: prefix + code2 + "_0_" + grade
        // prefix includes underscore? "73629_"
        const finalParam = `${prefix}${code2}_0_${grade}`;
        const b64 = Buffer.from(finalParam).toString('base64');
        const timetableUrl = `${BASE_URL}/${code1}?${b64}`;

        console.log(`   -> URL: ${timetableUrl}`);

        const timeRes = await fetch(timetableUrl, { headers: HEADERS });
        const timeBuf = await timeRes.arrayBuffer();
        const timeText = new TextDecoder('utf-8').decode(timeBuf);
        const timeJsonParams = timeText.replace(/\0/g, '').substring(timeText.indexOf('{'), timeText.lastIndexOf("}") + 1);
        const rawData = JSON.parse(timeJsonParams);

        console.log("   -> Success! Keys:", Object.keys(rawData));

        // Print 1st class (Mon 1)
        const keys = Object.keys(rawData);
        const dataKey = keys.find(k => k.startsWith('자료') && Array.isArray(rawData[k]) && rawData[k][grade]);
        const subjectsKey = keys.find(k => k.startsWith('자료') && JSON.stringify(rawData[k]).includes('국어'));

        if (dataKey && subjectsKey) {
            const subjects = rawData[subjectsKey];
            const mon1 = rawData[dataKey][grade][1][1][1];
            const sIdx = mon1 % 100;
            console.log(`   -> Grade 1 Class 1 Mon 1: ${mon1} (${subjects[sIdx]})`);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

fullFlow();
