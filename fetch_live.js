async function run() {
    const res = await fetch("https://bssm.app/api/comcigan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolName: "부산성지고", grade: 2, classNum: "all" })
    });
    const data = await res.json();
    require('fs').writeFileSync('output_live_api.json', JSON.stringify(data, null, 2));
    console.log("Saved live API response to output_live_api.json");
}
run();
