import { Router } from "express";

const router = Router();

// GET /: Returns the client's IP address
router.get("/", (req, res) => {
    // Check for Cloudflare header first, then fall back to Express's req.ip
    const ip = (req.headers['cf-connecting-ip'] as string) ||
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        req.ip ||
        '127.0.0.1';

    res.json({ ip });
});

export const myIpRouter = router;
