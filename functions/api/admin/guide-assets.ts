import { verifyAdminPassword } from "../../../server/adminPW";

const CHUNK_SIZE = 500000; // 500KB chunk size to strictly stay within D1 / SQLite parameter boundaries

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // 1. Admin Auth Check
    const password = request.headers.get("X-Admin-Password");
    if (!verifyAdminPassword(password, env)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
        });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        // Ensure tables exist
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

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        // ─────────────────────────────────────────────────────────────────────
        // 2. GET: List Assets & Current Bindings
        // ─────────────────────────────────────────────────────────────────────
        if (request.method === "GET") {
            // Distinct metadata from chunk 0
            const { results: assets } = await env.DB.prepare(`
                SELECT id, name, mime_type, size, created_at 
                FROM pwa_guide_assets 
                WHERE chunk_index = 0 
                ORDER BY created_at DESC
            `).all();

            const settingRow = await env.DB.prepare(
                "SELECT value FROM system_settings WHERE key = 'iphone_pwa_guide_bindings'"
            ).first();

            let bindings: Record<string, string> = {};
            if (settingRow && settingRow.value) {
                try {
                    bindings = JSON.parse(settingRow.value);
                } catch {
                    bindings = {};
                }
            }

            return new Response(JSON.stringify({
                assets: assets || [],
                bindings
            }), { headers: { "Content-Type": "application/json" } });
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. POST: Bulk Upload Assets
        // ─────────────────────────────────────────────────────────────────────
        if (request.method === "POST") {
            const body = await request.json();
            const rawAssets = Array.isArray(body?.assets) 
                ? body.assets 
                : (body?.asset ? [body.asset] : []);

            if (rawAssets.length === 0) {
                return new Response(JSON.stringify({ error: "No assets provided" }), { 
                    status: 400,
                    headers: { "Content-Type": "application/json" } 
                });
            }

            const insertStmt = env.DB.prepare(`
                INSERT OR REPLACE INTO pwa_guide_assets 
                (id, chunk_index, name, mime_type, size, data, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `);

            const batch = [];
            const uploadedList = [];

            for (const item of rawAssets) {
                const assetId = item.id || `gif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                const name = item.name || "guide.gif";
                const mimeType = item.mime_type || item.mimeType || "image/gif";
                const dataUrl = item.dataUrl || item.data || "";
                const size = item.size || (dataUrl ? Math.round(dataUrl.length * 0.75) : 0);

                if (!dataUrl) continue;

                // Split into chunks
                const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_SIZE));
                for (let i = 0; i < totalChunks; i++) {
                    const chunkData = dataUrl.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                    batch.push(insertStmt.bind(assetId, i, name, mimeType, size, chunkData));
                }

                uploadedList.push({ id: assetId, name, size, mime_type: mimeType });
            }

            if (batch.length > 0) {
                await env.DB.batch(batch);
            }

            return new Response(JSON.stringify({ 
                success: true, 
                uploaded: uploadedList 
            }), { headers: { "Content-Type": "application/json" } });
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. DELETE: Remove an Asset and Auto-Unbind
        // ─────────────────────────────────────────────────────────────────────
        if (request.method === "DELETE") {
            const url = new URL(request.url);
            let targetId = url.searchParams.get("id");
            if (!targetId) {
                try {
                    const body = await request.json();
                    targetId = body?.id;
                } catch {}
            }

            if (!targetId) {
                return new Response(JSON.stringify({ error: "Asset ID required" }), { 
                    status: 400,
                    headers: { "Content-Type": "application/json" } 
                });
            }

            // 1. Delete all chunks of this asset
            await env.DB.prepare("DELETE FROM pwa_guide_assets WHERE id = ?").bind(targetId).run();

            // 2. Unbind from system_settings if bound
            const settingRow = await env.DB.prepare(
                "SELECT value FROM system_settings WHERE key = 'iphone_pwa_guide_bindings'"
            ).first();

            let bindings: Record<string, string> = {};
            let hasChanged = false;
            if (settingRow && settingRow.value) {
                try {
                    bindings = JSON.parse(settingRow.value);
                    for (const [deviceKey, boundId] of Object.entries(bindings)) {
                        if (boundId === targetId) {
                            bindings[deviceKey] = "";
                            hasChanged = true;
                        }
                    }
                } catch {}
            }

            if (hasChanged) {
                await env.DB.prepare(
                    "INSERT OR REPLACE INTO system_settings (key, value) VALUES ('iphone_pwa_guide_bindings', ?)"
                ).bind(JSON.stringify(bindings)).run();
            }

            return new Response(JSON.stringify({ 
                success: true, 
                deletedId: targetId,
                updatedBindings: bindings 
            }), { headers: { "Content-Type": "application/json" } });
        }

        // ─────────────────────────────────────────────────────────────────────
        // 5. PUT/PATCH: Save Device Bindings Directly (Auto-save)
        // ─────────────────────────────────────────────────────────────────────
        if (request.method === "PUT" || request.method === "PATCH") {
            const body = await request.json();
            const bindings = body?.bindings;

            if (typeof bindings !== "object" || bindings === null) {
                return new Response(JSON.stringify({ error: "Invalid bindings object" }), { 
                    status: 400,
                    headers: { "Content-Type": "application/json" } 
                });
            }

            await env.DB.prepare(
                "INSERT OR REPLACE INTO system_settings (key, value) VALUES ('iphone_pwa_guide_bindings', ?)"
            ).bind(JSON.stringify(bindings)).run();

            return new Response(JSON.stringify({ 
                success: true, 
                bindings 
            }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response("Method not allowed", { status: 405 });

    } catch (e: any) {
        console.error('[Admin Guide Assets API Error]', e);
        return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { 
            status: 500,
            headers: { "Content-Type": "application/json" } 
        });
    }
};
