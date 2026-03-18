import { adminPassword } from "../../../server/adminPW";

const BASE_URL = "http://comci.net:4082";
const SEARCH_HEX = "%BA%CE%BB%EA%BC%BA%C1%F6%B0%ED"; // 부산성지고 EUC-KR Hex
const FALLBACK_CODE2 = "93342";

const HEADERS: any = {
    'Accept': '*/*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'http://comci.net:4082/st',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
};

const PROXIES = [
    '', // Direct connection
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];

async function decodeEucKr(response: Response): Promise<string> {
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    return decoder.decode(buffer);
}

async function fetchWithTimeout(url: string, options: any = {}, timeout = 5000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchWithProxy(targetUrl: string, headers: any = HEADERS, isEucKr: boolean = false) {
    let lastError;
    for (const proxy of PROXIES) {
        try {
            const fullUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
            const res = await fetchWithTimeout(fullUrl, { headers }, 5000);
            if (res.ok) {
                if (isEucKr) return await decodeEucKr(res);
                const buf = await res.arrayBuffer();
                const txt = new TextDecoder('utf-8').decode(buf);
                return txt.replace(/\0/g, '');
            }
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error('Connection failed through all proxies');
}

async function getPrefix() {
    const html = await fetchWithProxy(`${BASE_URL}/st`, HEADERS, true);
    const match = html.match(/sc_data\('([^']+)'/);
    if (!match) throw new Error("Failed to extract sc_data prefix");
    return match[1];
}

async function getSchoolCode(prefix: string) {
    try {
        const searchUrl = `${BASE_URL}/${prefix}${SEARCH_HEX}`;
        const jsonText = await fetchWithProxy(searchUrl, HEADERS, false);

        if (jsonText.trim() === '.' || jsonText.trim().length === 0) {
            throw new Error("Empty search response");
        }

        const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
        const data = JSON.parse(jsonString);

        const schools = data["학교검색"] || [];
        const target = schools.find((s: any) => s[2] === "부산성지고");

        if (!target) throw new Error("School not found in search result");

        return { code1: target[3], code2: target[4] };
    } catch (e) {
        return { code1: "36179", code2: FALLBACK_CODE2 };
    }
}

export const onRequest = async (context: any) => {
    const { request } = context;

    if (request.method !== 'POST') {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        // 1. Auth Check
        const password = request.headers.get("X-Admin-Password");
        if (password !== adminPassword) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const body = await request.json();
        const schoolName = body.schoolName || "부산성지고";
        const mode = body.mode || 'live';

        if (mode === 'cache' && context.env.DB) {
            try {
                const row = await context.env.DB.prepare("SELECT response_json FROM timetable_cache WHERE cache_key = 'raw_data'").first();
                if (row && row.response_json) {
                    const rawData = JSON.parse(row.response_json as string);
                    return new Response(JSON.stringify({ success: true, data: rawData, cached: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            } catch (e) {
                console.warn("[Comcigan Debug] Cache mode requested but failed to load raw_data from cache, falling back to live:", e);
            }
        }

        // 2. Fetch from Comcigan
        const prefix = await getPrefix();
        const { code1, code2 } = await getSchoolCode(prefix);

        // Grade 1 is enough to fetch the whole school schedule json
        const param = `${prefix}${code2}_0_1`;
        const b64 = btoa(param);
        const targetUrl = `${BASE_URL}/${code1}?${b64}`;

        const jsonText = await fetchWithProxy(targetUrl, HEADERS, false);
        const jsonString = jsonText.substring(jsonText.indexOf('{'), jsonText.lastIndexOf("}") + 1);
        const rawData = JSON.parse(jsonString);

        return new Response(JSON.stringify({ success: true, data: rawData }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
