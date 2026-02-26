const comciganData = {
    "1": [0, 1500, 1600, 1700],
    "2": [0, 2000, 2100, 2200],
    "3": [0, 3000, 3100, 3200],
    "4": [0],
    "5": [0, 5000, 5100, 5200]
};
const keys = Object.keys(comciganData);
let result = [];
for (let w = 1; w <= 5; w++) {
    const classData = comciganData[w];
    const maxPeriod = classData ? classData.length - 1 : 0;
    const loopLimit = Math.min(7, maxPeriod);
    for (let period = 1; period <= loopLimit; period++) {
        result.push({ weekday: w, classTime: period, code: classData[period] });
    }
}
const uiData = result.map(i => ({ ...i, weekday: i.weekday - 1 }));

const timetableByDay = {};
uiData.forEach((item) => {
    if (!timetableByDay[item.weekday]) {
        timetableByDay[item.weekday] = [];
    }
    timetableByDay[item.weekday].push(item);
});

console.log("UI DATA Mapping:");
const weekdaysUI = ["Mon", "Tue", "Wed", "Thu", "Fri"];
for (let i = 0; i < 5; i++) {
    const dayItems = timetableByDay[i] || [];
    console.log(`Day ${i} (${weekdaysUI[i]}) has ${dayItems.length} items`);
}
