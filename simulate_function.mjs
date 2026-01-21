
import { onRequest } from './functions/api/kakao/[[path]].ts';

const runTest = async (path) => {
    const request = {
        url: `https://school-timetable.pages.dev${path}`
    };

    const context = {
        request,
        env: {}
    };

    console.log(`Testing path: ${path}`);
    try {
        const response = await onRequest(context);
        console.log(`Status: ${response.status}`);
        // Mock response.text() if it's not available in the test environment (which it should be in Node 20+)
        if (response.text) {
            const text = await response.text();
            console.log(`Body: ${text}`);
        }
    } catch (e) {
        console.error(e);
    }
    console.log('---');
};

// Test cases
await runTest('/api/kakao/callback?code=test');
await runTest('/api/kakao/callback');
await runTest('/api/kakao/login');
