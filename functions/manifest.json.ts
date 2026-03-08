export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database configuration missing' }), { status: 500 });
    }

    try {
        const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('pwa_app_title', 'pwa_app_icon_url')").all();

        const settings: any = {};
        if (rows && rows.results) {
            rows.results.forEach((row: any) => {
                settings[row.key] = row.value;
            });
        }

        const appTitle = settings['pwa_app_title'] || '성지고 시간표';
        const appIconUrl = settings['pwa_app_icon_url'] || '/icon.svg';

        const manifest = {
            "name": appTitle,
            "short_name": appTitle,
            "description": "부산성지고등학교 시간표 및 수행평가 관리 서비스",
            "start_url": "/",
            "display": "standalone",
            "background_color": "#ffffff",
            "theme_color": "#ffffff",
            "icons": [
                {
                    "src": appIconUrl,
                    "sizes": "192x192 512x512",
                    "type": appIconUrl.startsWith('data:image/svg') ? 'image/svg+xml' : (appIconUrl.startsWith('data:image/png') ? 'image/png' : 'image/png'),
                    "purpose": "any maskable"
                }
            ]
        };

        return new Response(JSON.stringify(manifest), {
            headers: {
                'Content-Type': 'application/manifest+json; charset=utf-8'
            }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
