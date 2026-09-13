import { Router } from "express";
import { getDb } from "../db";
import { verifyAdminPassword } from "../adminPW";
import { sql } from "drizzle-orm";

const CHUNK_SIZE = 500000;

// Public streaming router
export const publicGuideAssetsRouter = Router();

publicGuideAssetsRouter.get("/", async (req, res) => {
    const id = req.query.id as string;
    if (!id) {
        return res.status(400).send("Asset ID missing");
    }

    const db = await getDb();
    if (!db) return res.status(500).send("DB Unavailable");

    try {
        await db.run(sql`
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
        `);

        const rows: any = await db.all(sql`
            SELECT chunk_index, mime_type, data 
            FROM pwa_guide_assets 
            WHERE id = ${id} 
            ORDER BY chunk_index ASC
        `);

        if (!rows || rows.length === 0) {
            return res.status(404).send("Asset not found");
        }

        const mimeType = rows[0].mime_type || "image/gif";
        const fullData = rows.map((r: any) => r.data).join("");

        const match = fullData.match(/^data:([^;]+);base64,(.+)$/);
        const base64Data = match ? match[2] : fullData;

        const buffer = Buffer.from(base64Data, "base64");

        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.send(buffer);

    } catch (err: any) {
        console.error("[Express Guide Asset Error]", err);
        return res.status(500).send(err.message);
    }
});

// Admin management router
export const adminGuideAssetsRouter = Router();

adminGuideAssetsRouter.use((req, res, next) => {
    const cookieMatch = req.headers.cookie?.match(/(?:^|;\s*)(?:admin_password|sj_admin_password)=([^;]*)/);
    const cookiePassword = cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;
    const authHeader = (req.headers["x-admin-password"] as string) || cookiePassword;
    if (!verifyAdminPassword(authHeader)) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
});

// GET: list assets & bindings
adminGuideAssetsRouter.get("/", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    try {
        await db.run(sql`
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
        `);

        await db.run(sql`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        const assets: any = await db.all(sql`
            SELECT id, name, mime_type, size, created_at 
            FROM pwa_guide_assets 
            WHERE chunk_index = 0 
            ORDER BY created_at DESC
        `);

        const settingRow: any = await db.get(sql`
            SELECT value FROM system_settings WHERE key = 'iphone_pwa_guide_bindings'
        `);

        let bindings = {};
        if (settingRow && settingRow.value) {
            try {
                bindings = JSON.parse(settingRow.value);
            } catch {}
        }

        res.json({
            assets: assets || [],
            bindings
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST: bulk upload assets
adminGuideAssetsRouter.post("/", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const rawAssets = Array.isArray(req.body?.assets)
        ? req.body.assets
        : (req.body?.asset ? [req.body.asset] : []);

    if (rawAssets.length === 0) {
        return res.status(400).json({ error: "No assets provided" });
    }

    try {
        await db.run(sql`
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
        `);

        const uploadedList = [];

        for (const item of rawAssets) {
            const assetId = item.id || `gif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            const name = item.name || "guide.gif";
            const mimeType = item.mime_type || item.mimeType || "image/gif";
            const dataUrl = item.dataUrl || item.data || "";
            const size = item.size || (dataUrl ? Math.round(dataUrl.length * 0.75) : 0);

            if (!dataUrl) continue;

            const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_SIZE));
            for (let i = 0; i < totalChunks; i++) {
                const chunkData = dataUrl.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                await db.run(sql`
                    INSERT OR REPLACE INTO pwa_guide_assets 
                    (id, chunk_index, name, mime_type, size, data, created_at) 
                    VALUES (${assetId}, ${i}, ${name}, ${mimeType}, ${size}, ${chunkData}, datetime('now'))
                `);
            }

            uploadedList.push({ id: assetId, name, size, mime_type: mimeType });
        }

        res.json({ success: true, uploaded: uploadedList });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: delete asset and auto-unbind
adminGuideAssetsRouter.delete("/", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const targetId = (req.query.id as string) || req.body?.id;
    if (!targetId) {
        return res.status(400).json({ error: "Asset ID required" });
    }

    try {
        await db.run(sql`DELETE FROM pwa_guide_assets WHERE id = ${targetId}`);

        const settingRow: any = await db.get(sql`
            SELECT value FROM system_settings WHERE key = 'iphone_pwa_guide_bindings'
        `);

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
            await db.run(sql`
                INSERT OR REPLACE INTO system_settings (key, value) 
                VALUES ('iphone_pwa_guide_bindings', ${JSON.stringify(bindings)})
            `);
        }

        res.json({ success: true, deletedId: targetId, updatedBindings: bindings });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT/PATCH: save bindings
adminGuideAssetsRouter.put("/", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const bindings = req.body?.bindings;
    if (typeof bindings !== "object" || bindings === null) {
        return res.status(400).json({ error: "Invalid bindings object" });
    }

    try {
        await db.run(sql`
            INSERT OR REPLACE INTO system_settings (key, value) 
            VALUES ('iphone_pwa_guide_bindings', ${JSON.stringify(bindings)})
        `);

        res.json({ success: true, bindings });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
