export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database configuration missing' }), { status: 500 });
    }

    try {
        const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('pwa_app_title', 'pwa_app_icon_url', 'site_favicon_url')").all();

        const settings: any = {};
        if (rows && rows.results) {
            rows.results.forEach((row: any) => {
                settings[row.key] = row.value;
            });
        }

        const appTitle = settings['pwa_app_title'] || '성지수행';
        const appIconUrl = settings['pwa_app_icon_url'] || settings['site_favicon_url'] || '/icon.svg';

        // For SVG icons, the "sizes": "any" is the most robust way to ensure WebAPK accepts it.
        // For PNGs, 192x192 and 512x512 are strictly required.
        const isSvg = appIconUrl.startsWith('data:image/svg') || appIconUrl.endsWith('.svg');
        const iconType = isSvg ? 'image/svg+xml' : 'image/png';

        const userAgent = context.request.headers.get('user-agent') || context.request.headers.get('User-Agent') || '';
        const isSamsungBrowser = /SamsungBrowser/i.test(userAgent);

        const icons = isSvg
            ? [
                {
                    "src": "/api/app-icon",
                    "sizes": "any",
                    "type": "image/svg+xml",
                    "purpose": "any"
                },
                {
                    "src": "/api/app-icon",
                    "sizes": "any",
                    "type": "image/svg+xml",
                    "purpose": "maskable"
                }
            ]
            : [
                {
                    "src": "/api/app-icon",
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any"
                },
                {
                    "src": "/api/app-icon",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "any"
                },
                {
                    "src": "/api/app-icon",
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "maskable"
                },
                {
                    "src": "/api/app-icon",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "maskable"
                }
            ];

        const manifest: any = {
            "id": "/",
            "name": appTitle,
            "short_name": appTitle,
            "description": "부산성지고등학교 시간표 및 수행평가 관리 서비스",
            "start_url": "/",
            "display": isSamsungBrowser ? "minimal-ui" : "standalone",
            // minimal-ui (without display_override) makes Samsung Internet show only "Add to Home screen"
            // instead of "Add to apps" (which triggers WebAPK + Play Protect warning)
            "orientation": "portrait",
            "categories": ["education", "productivity"],
            "prefer_related_applications": false,
            "background_color": "#ffffff",
            "theme_color": "#ffffff",
            "icons": icons
        };



        return new Response(JSON.stringify(manifest), {
            headers: {
                'Content-Type': 'application/manifest+json; charset=utf-8',
                'Cache-Control': 'public, max-age=600',
                'Vary': 'User-Agent'
            }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
