import { Router } from "express";
import { sql } from "drizzle-orm";
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

// GET /assessments: Get all assessments for admin view
router.get("/assessments", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    try {
        const [results] = await db.execute(sql`
            SELECT * FROM performanceAssessments 
            ORDER BY grade ASC, classNum ASC, dueDate ASC
        `);
        res.json(results);
    } catch (err: any) {
        console.error("[Admin Assessments] Query failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /assessments: Bulk delete assessments
router.delete("/assessments", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Invalid IDs" });
    }

    try {
        // Build WHERE IN clause
        const placeholders = ids.map(() => '?').join(',');
        await db.execute(sql.raw(`DELETE FROM performanceAssessments WHERE id IN (${placeholders})`, ids));

        res.json({ success: true, count: ids.length });
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

// POST /migrate_db: Manual Trigger
router.all("/migrate_db", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    try {
        console.log("[Admin] Force Migration Triggered");

        // Force Drop for simplified schema
        await db.execute(sql`DROP TABLE IF EXISTS ip_profiles`);
        await db.execute(sql`DROP TABLE IF EXISTS student_profiles`); // Constraint might require dropping ip_profiles first

        const { runMigrations } = await import("../_core/migrate");
        await runMigrations();

        res.json({ success: true, message: "Migration (v5) completed." });
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /users: Get active users (from ip_profiles) and blocked users
router.get("/users", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    try {
        const [profiles]: any = await db.execute(sql`
            SELECT 
                ip, 
                student_id,
                kakaoId, 
                kakaoNickname, 
                lastAccess, 
                modificationCount, 
                instructionDismissed
            FROM ip_profiles 
            ORDER BY lastAccess DESC
            LIMIT 100
        `);

        // Parse student_id to Grade/Class/Num for frontend compatibility
        const parsedProfiles = profiles.map((p: any) => {
            let grade = null, classNum = null, studentNumber = null;
            if (p.student_id) {
                const s = p.student_id.toString();
                if (s.length === 4) {
                    grade = parseInt(s[0]);
                    classNum = parseInt(s[1]);
                    studentNumber = parseInt(s.substring(2));
                }
            }
            return {
                ...p,
                grade,
                classNum,
                studentNumber
            };
        });

        const [blocked] = await db.execute(sql`SELECT * FROM blocked_users ORDER BY createdAt DESC`);

        res.json({
            activeUsers: parsedProfiles,
            blockedUsers: blocked
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/users/notify", async (req, res) => {
    const { ip, kakaoId, message } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        console.log(`[KakaoTalk Notification] IP: ${ip}, KakaoID: ${kakaoId}, Message: ${message}`);
        res.json({
            success: true,
            message: "Notification sent (placeholder - implement KakaoTalk API)"
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export const adminRouter = router;
