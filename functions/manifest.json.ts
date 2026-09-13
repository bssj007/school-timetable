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
        const secChUaMobile = context.request.headers.get('sec-ch-ua-mobile');
        const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(userAgent);
        const isDesktop = secChUaMobile === '?0' || (!isMobileUA && /Windows NT|Macintosh|Linux/i.test(userAgent));

        // 데스크톱 환경에서는 PWA 정보를 제공하지 않음 (브라우저 주소줄 설치 문구 및 아이콘 차단)
        if (isDesktop) {
            return new Response(JSON.stringify({ error: 'PWA manifest not available on desktop' }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'Vary': 'User-Agent, Sec-CH-UA-Mobile'
                }
            });
        }

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

        const manifestUrl = new URL('/manifest.json', context.request.url).toString();

        const manifest: any = {
            "id": "/",
            "name": appTitle,
            "short_name": appTitle,
            "description": "부산성지고등학교 시간표 및 수행평가 관리 서비스",
            "start_url": "/?mode=pwa",
            "display": isSamsungBrowser ? "minimal-ui" : "standalone",
            // display_override lets Samsung Internet show both "Add to apps" and "Add to Home screen"
            ...(isSamsungBrowser ? { "display_override": ["standalone", "minimal-ui"] } : {}),
            "orientation": "portrait",
            "categories": ["education", "productivity"],
            "prefer_related_applications": false,
            "related_applications": [
                {
                    "platform": "webapp",
                    "url": manifestUrl
                }
            ],
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
