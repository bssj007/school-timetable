import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('output_proxy_raw.json', 'utf8'));

const datasets = ['자료481', '자료147', '자료542', '자료245'];

for (const ds of datasets) {
    if (!raw[ds] || !raw[ds][2]) {
        console.log(`\nDataset ${ds} is missing or empty for grade 2`);
        continue;
    }

    console.log(`\nDataset ${ds} 2학년 1반 periodCounts:`);
    for (let w = 1; w <= 5; w++) {
        const counts = raw[ds][2][1][w]?.[0] || 0;
        console.log(`  Weekday ${w}: ${counts}`);
    }
}
