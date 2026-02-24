const BASE_URL = "http://comci.net:4082";
const HEADERS = {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://comci.net:4082/st',
};
const SEARCH_HEX = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED";

async function fullFlow() {
    try {
        const initRes = await fetch(`${BASE_URL}/st`, { headers: HEADERS });
        const initHtml = new TextDecoder('euc-kr').decode(await initRes.arrayBuffer());
        const prefix = initHtml.match(/sc_data\('([^']+)'/)[1];

        // Do search exactly like production to see what code we get
        const searchUrl = `${BASE_URL}/${prefix}${SEARCH_HEX}`;
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        let searchJson = new TextDecoder('utf-8').decode(await searchRes.arrayBuffer());
        searchJson = searchJson.replace(/\0/g, '');

        let code1 = "36179";
        let code2 = "93342";
        if (searchJson.trim() === '.' || searchJson.trim() === '') {
            console.log("Search returned dot, using fallback codes");
        } else {
            const jsonString = searchJson.substring(searchJson.indexOf('{'), searchJson.lastIndexOf("}") + 1);
            const data = JSON.parse(jsonString);
            const target = data["학교검색"].find(s => s[2] === "부산성지고");
            if (target) {
                code1 = target[3];
                code2 = target[4];
            }
        }
        console.log(`Using Code1=${code1}, Code2=${code2}`);

        const grade = 1;
        const param = `${prefix}${code2}_0_${grade}`;
        const b64 = Buffer.from(param).toString('base64');
        const timetableUrl = `${BASE_URL}/${code1}?${b64}`;

        const timeRes = await fetch(timetableUrl, { headers: HEADERS });
        const timeText = new TextDecoder('utf-8').decode(await timeRes.arrayBuffer());
        const clean = timeText.replace(/\0/g, '');
        const timeJsonParams = clean.substring(clean.indexOf('{'), clean.lastIndexOf("}") + 1);
        const rawData = JSON.parse(timeJsonParams);

        const keys = Object.keys(rawData);
        const timetableProps = keys.filter(k => {
            const val = rawData[k];
            return Array.isArray(val) && val[grade] && val[grade][1] && Array.isArray(val[grade][1]);
        });

        let timedataProp = "";
        for (let i = timetableProps.length - 1; i >= 0; i--) {
            const prop = timetableProps[i];
            const gradeData = rawData[prop][grade];
            if (!gradeData || !gradeData[1]) continue;

            const class1Data = gradeData[1];
            let hasData = false;
            for (let w = 1; w <= 5; w++) {
                if (class1Data[w] && Array.isArray(class1Data[w])) {
                    if (class1Data[w].some((code) => typeof code === 'number' && code > 0)) {
                        hasData = true;
                        break;
                    }
                }
            }

            if (hasData) {
                timedataProp = prop;
                break;
            }
        }
        if (!timedataProp && timetableProps.length > 0) {
            timedataProp = timetableProps[timetableProps.length - 1];
        }

        console.log("timetableProps:", timetableProps);
        console.log("selected timedataProp:", timedataProp);

        const data = rawData[timedataProp];
        console.log("Has data[grade]?", !!(data && data[grade]));
        if (data && data[grade]) {
            console.log("Keys in data[grade]:", Object.keys(data[grade]));
        }

    } catch (e) {
        console.error("Error:", e);
    }
}
fullFlow();
