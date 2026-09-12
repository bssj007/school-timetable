import { Router } from "express";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { verifyAdminPassword } from "../adminPW";

export const testDbQueryRouter = Router();

// CORS Middleware
testDbQueryRouter.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Admin-Password");
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
});

// Helper to check bypass switch from system_settings
async function checkBypassStatus(db: any): Promise<boolean> {
    try {
        await db.run(sql`CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT)`);
        const row = await db.get(sql`SELECT value FROM system_settings WHERE key = 'test_db_agent_query_enabled'`);
        return row && (row.value === 'true' || row.value === '1');
    } catch {
        return false;
    }
}

// Authentication / Bypass Guard
testDbQueryRouter.use(async (req, res, next) => {
    const db = await getDb();
    if (!db) {
        return res.status(500).json({ error: "Database not available" });
    }

    const isBypassed = await checkBypassStatus(db);
    if (isBypassed) {
        // Password bypassed!
        return next();
    }

    // If not bypassed, require admin password
    const adminPw = (req.headers["x-admin-password"] as string) || (req.query.admin_password as string);
    if (!verifyAdminPassword(adminPw)) {
        return res.status(401).json({
            error: "Unauthorized: Agent Query Access is currently disabled. Please enable it with the switch in Admin > Data Import/Export (데이터 출입).",
            status: "disabled"
        });
    }
    next();
});

testDbQueryRouter.get("/", async (req, res) => {
    const db = await getDb();
    const sqlParam = (req.query.sql as string) || (req.query.q as string);

    if (!sqlParam) {
        const fullUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}`;
        return res.json({
            success: true,
            status: "active",
            bypassed: true,
            message: "Test DB Agent Query API is active and ready for queries.",
            usage: {
                GET: `${fullUrl}?sql=SELECT+name+FROM+sqlite_schema+WHERE+type='table'`,
                POST: {
                    endpoint: fullUrl,
                    headers: { "Content-Type": "application/json" },
                    body: { sql: "SELECT * FROM system_settings LIMIT 10" }
                }
            }
        });
    }

    try {
        const results = await db.all(sql.raw(sqlParam));
        return res.json({ success: true, results });
    } catch (err: any) {
        return res.status(400).json({ success: false, error: err.message, sql: sqlParam });
    }
});

testDbQueryRouter.post("/", async (req, res) => {
    const db = await getDb();
    const body = req.body || {};

    if (body.action === "list_tables") {
        try {
            const results = await db.all(sql`SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name;`);
            return res.json({ success: true, tables: results.map((r: any) => r.name) });
        } catch (err: any) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    if (body.exec && typeof body.exec === "string") {
        try {
            await db.run(sql.raw(body.exec));
            return res.json({ success: true, message: "Executed successfully." });
        } catch (err: any) {
            return res.status(400).json({ success: false, error: err.message });
        }
    }

    const querySql = body.sql || body.query;
    if (!querySql || typeof querySql !== "string") {
        return res.status(400).json({ error: "Missing 'sql' field in request body" });
    }

    try {
        const results = await db.all(sql.raw(querySql));
        return res.json({ success: true, results });
    } catch (err: any) {
        return res.status(400).json({ success: false, error: err.message, sql: querySql });
    }
});
