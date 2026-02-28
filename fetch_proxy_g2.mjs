import fs from 'fs';

async function run() {
    console.log("Fetching RAW directly from allorigins for grade 2...");
    // 73629_93342_0_2 -> base64 -> NzM2MjlfOTMzNDJfMF8y
    const targetUrl = "http://comci.net:4082/36179?NzM2MjlfOTMzNDJfMF8y";
    const url = "https://api.allorigins.win/raw?url=" + encodeURIComponent(targetUrl);
    const res = await fetch(url);
    const text = await res.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf("}") + 1);
    const data = JSON.parse(jsonString);
    fs.writeFileSync('output_proxy_raw_g2.json', JSON.stringify(data, null, 2));
    console.log("Saved raw proxy payload to output_proxy_raw_g2.json");
}
run();
