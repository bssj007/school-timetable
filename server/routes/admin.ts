import { Router } from "express";
import { sql, eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import { adminPassword } from "../adminPW";

const router = Router();

// Authentication Middleware
router.use((req, res, next) => {
    const authHeader = req.headers['x-admin-password'];
    if (authHeader !== adminPassword) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
});

// GET /users: Get active users and blocked users
router.get("/users", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    try {
        // 1. Recent Logs
        // Native MySQL query for logs
        const [logs] = await db.execute(sql`
      SELECT 
        ip, 
        kakaoId, 
        kakaoNickname, 
        COUNT(*) as requestCount, 
        SUM(CASE WHEN method IN ('POST', 'DELETE') THEN 1 ELSE 0 END) as modificationCount,
        MAX(accessedAt) as lastAccess 
      FROM access_logs 
      WHERE accessedAt > DATE_SUB(NOW(), INTERVAL 1 DAY)
      GROUP BY ip
      ORDER BY lastAccess DESC
    `);

        // 2. Blocked Users
        const [blocked] = await db.execute(sql`SELECT * FROM blocked_users ORDER BY createdAt DESC`);

        res.json({
            activeUsers: logs,
            blockedUsers: blocked
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /users: Block a user
router.post("/users", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const { identifier, type, reason } = req.body;

    try {
        // Check if existing
        // Note: mysql2 execute returns [rows, fields]
        const [existing]: any = await db.execute(sql`SELECT id FROM blocked_users WHERE identifier = ${identifier} AND type = ${type}`);

        if (existing && existing.length > 0) {
            return res.json({ message: "Already blocked" });
        }

        await db.execute(sql`INSERT INTO blocked_users (identifier, type, reason) VALUES (${identifier}, ${type}, ${reason || 'Admin Blocked'})`);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /users: Unblock
router.delete("/users", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const { id } = req.body;
    try {
        await db.execute(sql`DELETE FROM blocked_users WHERE id = ${id}`);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export const adminRouter = router;
