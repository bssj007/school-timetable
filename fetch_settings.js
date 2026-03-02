const password = "admin";
fetch("http://localhost:5173/api/admin/settings", {
    headers: { "X-Admin-Password": password }
}).then(r => r.json()).then(data => {
    if (data.manual_plan_v2) {
        const parsed = JSON.parse(data.manual_plan_v2);
        console.log("Groups keys:", Object.keys(parsed.groups || {}));
        console.log("Timetables keys (first 10):", Object.keys(parsed.timetables || {}).slice(0, 10));
    } else {
        console.log("No manual_plan_v2");
    }
}).catch(e => console.error(e));
