import fs from 'fs';

async function run() {
    console.log("Fetching GET...");
    const res = await fetch("https://0b67e491.school-timetable-8ln.pages.dev/api/comcigan?type=timetable&grade=2&classNum=all", {
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
    fs.writeFileSync('output_live_api_get.json', JSON.stringify(data, null, 2));
    console.log("Saved live API GET response to output_live_api_get.json. Total elements:", data.data?.length);
}
run();
