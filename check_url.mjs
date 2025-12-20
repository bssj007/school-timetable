
const url = 'http://xn--s39aj90b0nb2xw6xh.kr/';

async function check() {
    console.log(`Checking ${url}...`);
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    const text = decoder.decode(buf);
    console.log('--- Body ---');
    console.log(text);
    console.log('--- End ---');
}

check().catch(console.error);
