export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response('Database configuration missing', { status: 500 });
    }

    try {
        const rows = await env.DB.prepare("SELECT key, value FROM system_settings WHERE key IN ('pwa_app_icon_url', 'site_favicon_url')").all();

        const settings: any = {};
        if (rows && rows.results) {
            rows.results.forEach((row: any) => {
                settings[row.key] = row.value;
            });
        }

        const iconDataUri = settings['pwa_app_icon_url'] || settings['site_favicon_url'];

        if (!iconDataUri || !iconDataUri.startsWith('data:image/')) {
            // Fallback to default SVG if no custom icon or invalid format
            const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="#3DDC84" rx="128"/><path d="M174.5 352.5c-16.5 0-30-13.5-30-30s13.5-30 30-30 30 13.5 30 30-13.5 30-30 30m163 0c-16.5 0-30-13.5-30-30s13.5-30 30-30 30 13.5 30 30-13.5 30-30 30m23.5-165l28-48a5 5 0 00-6.5-7l-29 49.5C322.5 168.5 291 160 256 160s-66.5 8.5-94.5 22.5l-29-49.5a5 5 0 00-6.5 7l28 48C110 216 80 263.5 80 320h352c0-56.5-30-104-74-132.5" fill="#fff"/></svg>`;
            return new Response(defaultSvg, {
                headers: { 'Content-Type': 'image/svg+xml' }
            });
        }

        // Parse data URI
        const matches = iconDataUri.match(/^data:([a-zA-Z0-9-+\/]+);base64,(.+)$/);

        if (matches && matches.length === 3) {
            const mimeType = matches[1];
            const base64Data = matches[2];

            // Convert base64 to binary buffer
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            return new Response(bytes.buffer, {
                headers: { 'Content-Type': mimeType }
            });
        } else if (iconDataUri.startsWith('data:image/svg+xml;utf8,')) {
            // Not base64, raw svg string
            const svgContent = decodeURIComponent(iconDataUri.replace('data:image/svg+xml;utf8,', ''));
            return new Response(svgContent, {
                headers: { 'Content-Type': 'image/svg+xml' }
            });
        }

        return new Response('Invalid icon format', { status: 400 });

    } catch (e: any) {
        return new Response('Error: ' + e.message, { status: 500 });
    }
}
