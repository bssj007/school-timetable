import fs from 'fs';

async function run() {
    console.log("Fetching RAW POST...");
    const res = await fetch("https://0b67e491.school-timetable-8ln.pages.dev/api/admin/raw_comcigan", {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Admin-Password": "yourmom69"
        },
        body: JSON.stringify({ schoolName: "부산성지고" })
    });

    if (!res.ok) {
        console.log("HTTP Error:", res.status);
        console.log("Body:", await res.text());
        return;
    }

    const data = await res.json();
    fs.writeFileSync('output_live_raw.json', JSON.stringify(data.data, null, 2));
    console.log("Saved raw payload to output_live_raw.json");
}
run();
