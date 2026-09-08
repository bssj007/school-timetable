import http from 'http';

async function run() {
    const buf = await new Promise((resolve, reject) => {
        http.get('http://comci.net:4082/st', res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });

    const html = new TextDecoder('euc-kr').decode(buf);
    const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    const script1 = scriptMatches[1][1];

    const targetFuncs = ['일자설정하기', 'sc_data', 'new_change', 'nal_change', 'baSplit'];
    for (const tf of targetFuncs) {
        const idx = script1.indexOf(`function ${tf}`);
        if (idx !== -1) {
            console.log(`\n=== Function ${tf} ===`);
            console.log(script1.substring(idx, idx + 1000));
        }
    }
}

run();
