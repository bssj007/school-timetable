const fs = require('fs');

async function test() {
    try {
        const res = await fetch("http://127.0.0.1:5173/api/timetable?type=timetable&grade=2&classNum=1&targetDate=2026-03-27");
        const json = await res.json();
        console.log(JSON.stringify(json.debugTokens, null, 2));
    } catch (e) {
        console.log("Error:", e);
    }
}

test();
