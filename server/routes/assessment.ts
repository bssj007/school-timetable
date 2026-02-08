import { Router } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

const router = Router();

// GET /: List assessments (filtered)
router.get("/", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const grade = req.query.grade || '1';
    const classNum = req.query.classNum || '1';

    try {
        const [results] = await db.execute(sql`
            SELECT * FROM performanceAssessments 
            WHERE grade = ${grade} AND classNum = ${classNum} 
            ORDER BY dueDate ASC, id DESC
        `);
        res.json(results);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /: Create assessment
router.post("/", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const { subject, title, dueDate, description, grade, classNum, classTime } = req.body;

    if (!subject || !title || !dueDate || !grade || !classNum) {
        return res.status(400).send("Missing fields");
    }

    // Check duplicates
    if (classTime) {
        const [existing]: any = await db.execute(sql`
            SELECT id FROM performanceAssessments 
            WHERE grade = ${grade} AND classNum = ${classNum} AND dueDate = ${dueDate} AND classTime = ${classTime}
        `);
        if (existing && existing.length > 0) {
            return res.status(409).json({ error: "Conflict" });
        }
    }

    // IP Logic
    // In Express, req.ip or req.connection.remoteAddress
    // We can also check headers if behind proxy
    const ip = (req.headers['cf-connecting-ip'] as string) || req.ip || '127.0.0.1';

    try {
        const result = await db.execute(sql`
            INSERT INTO performanceAssessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, lastModifiedIp)
            VALUES (${subject}, ${title}, ${description || ''}, ${dueDate}, ${grade}, ${classNum}, ${classTime || null}, 0, ${ip})
        `);
        res.json({ success: true, result });

        // Log access
        // Ideally this should be middleware, but for simplicity here:
        await db.execute(sql`
             INSERT INTO access_logs (ip, endpoint, method) VALUES (${ip}, '/api/assessment', 'POST')
        `);

    } catch (err: any) {
        console.error("Insert failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /: Delete
router.delete("/", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB Unavailable" });

    const id = req.query.id;
    if (!id) return res.status(400).send("Missing ID");

    try {
        await db.execute(sql`DELETE FROM performanceAssessments WHERE id = ${id}`);
        res.json({ success: true });

        // Log access
        const ip = (req.headers['cf-connecting-ip'] as string) || req.ip || '127.0.0.1';
        await db.execute(sql`
            INSERT INTO access_logs (ip, endpoint, method) VALUES (${ip}, '/api/assessment', 'DELETE')
       `);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export const assessmentRouter = router;
