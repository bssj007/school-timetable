import fs from 'fs';

async function run() {
    console.log("Fetching RAW directly from allorigins...");
    const url = "https://api.allorigins.win/raw?url=" + encodeURIComponent("http://comci.net:4082/36179?NzM2MjlfOTMzNDJfMF8x");
    const res = await fetch(url);
    const text = await res.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf("}") + 1);
    const data = JSON.parse(jsonString);
    fs.writeFileSync('output_proxy_raw.json', JSON.stringify(data, null, 2));
    console.log("Saved raw proxy payload to output_proxy_raw.json", Object.keys(data).length, "keys");
}
run();
