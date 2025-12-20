
const GOLDEN_URL = "http://comci.net:4082/36179?NzM2MjlfOTMzNDJfMF8x";

async function checkIndex() {
    const response = await fetch(GOLDEN_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = new TextDecoder('utf-8').decode(await response.arrayBuffer());
    const rawData = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf("}") + 1));

    const data = rawData['자료481'];
    const subjects = rawData['자료492'];

    console.log(`Data Length (Grades?): ${data.length}`);

    for (let g = 0; g < data.length; g++) {
        if (!data[g]) {
            console.log(`Grade ${g}: null/undefined`);
            continue;
        }
        console.log(`Grade ${g}: ${Array.isArray(data[g]) ? data[g].length + ' classes' : 'Not Array'}`);

        // Print 1st class of this grade
        if (Array.isArray(data[g]) && data[g][1] && data[g][1][1]) {
            const code = data[g][1][1][1]; // Grade g, Class 1, Mon, 1st
            const sIdx = code % 100;
            console.log(`  -> Class 1, Mon 1st: ${code} (${subjects[sIdx]})`);
        }
    }
}

checkIndex();
