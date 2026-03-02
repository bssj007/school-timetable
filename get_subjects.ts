async function checkPort(port: number) {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/admin/settings`, {
            headers: { 'X-Admin-Password': 'yourmom69' }
        });
        if (res.ok) {
            console.log(`Success on port ${port}`);
            const data = await res.json();
            if (data.manual_semester_plan) {
                const plan = JSON.parse(data.manual_semester_plan);
                console.log("Subjects:");
                console.log(JSON.stringify(plan.subjects, null, 2));
            } else {
                console.log("No manual_semester_plan found.");
            }
        } else {
            console.log(`Port ${port} responded with ${res.status}`);
        }
    } catch (e: any) {
        console.log(`Port ${port} failed: ${e.message}`);
    }
}

async function main() {
    await checkPort(5173);
    await checkPort(3000);
}
main();
