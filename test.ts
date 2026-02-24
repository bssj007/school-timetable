import { fetchRawTimetableFromComcigan } from './server/comcigan';

async function run() {
    try {
        const res = await fetchRawTimetableFromComcigan("부산성지고");
        console.log("SUCCESS:", Object.keys(res).length, "keys found in data.");
    } catch (e) {
        console.error("ERROR FETCHING:", e);
    }
}
run();
