import fs from 'fs';

async function run() {
    console.log("Fetching GET with Cache Bust...");
    const res = await fetch("https://0b67e491.school-timetable-8ln.pages.dev/api/comcigan?type=timetable&grade=2&classNum=all&bust=" + Date.now(), {
        headers: {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
    });
    if (!res.ok) {
        console.log("HTTP Error:", res.status);
        console.log("Body:", await res.text());
        return;
    }
    const data = await res.json();
    fs.writeFileSync('output_live_api_busted.json', JSON.stringify(data, null, 2));

    const class1Data = data.data.filter(d => d.class === 1);
    const byDay = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    for (const d of class1Data) {
        byDay[d.weekday].push(`${d.classTime}교시: ${d.subject}`);
    }

    console.log("Dataset:", data.debugTokens.timedataProp);
    for (let w = 0; w < 5; w++) {
        console.log(`Weekday ${w} (0=Mon): ${byDay[w].length} classes`);
        if (byDay[w].length > 0) {
            console.log("  " + byDay[w].join(", "));
        }
    }
}
run();
