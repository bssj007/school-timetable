export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (!env.DB) {
        return new Response('Database configuration missing', { status: 500 });
    }

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return new Response('Asset ID missing', { status: 400 });
        }

        // 1. Ensure table exists
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS pwa_guide_assets (
                id TEXT,
                chunk_index INTEGER,
                name TEXT,
                mime_type TEXT,
                size INTEGER,
                data TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (id, chunk_index)
            )
        `).run();

        // 2. Fetch chunks ordered by index
        const { results } = await env.DB.prepare(
            "SELECT chunk_index, mime_type, data FROM pwa_guide_assets WHERE id = ? ORDER BY chunk_index ASC"
        ).bind(id).all();

        if (!results || results.length === 0) {
            return new Response('Asset not found', { status: 404 });
        }

        const mimeType = results[0].mime_type || 'image/gif';
        let fullData = results.map((r: any) => r.data).join('');

        // If stored as data URL, extract base64 payload
        const match = fullData.match(/^data:([^;]+);base64,(.+)$/);
        const base64Data = match ? match[2] : fullData;

        // Convert base64 to binary buffer
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return new Response(bytes.buffer, {
            headers: {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (e: any) {
        console.error('[Guide Asset API Error]', e);
        return new Response('Error loading guide asset: ' + e.message, { status: 500 });
    }
};
