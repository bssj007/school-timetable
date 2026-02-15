import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
// ... imports ...

async function startServer() {
  // Run migrations on startup (Local Dev)
  await runMigrations();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // [Middleware] IP & Profile Tracking (Port from _middleware.ts)
  app.use(async (req, res, next) => {
    try {
      const db = await getDb();
      if (!db) return next();

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';

      // Cookie Parsing
      let grade: any = null, classNum: any = null, studentNumber: any = null;
      let kakaoId: any = null, kakaoNickname: any = null;

      const cookies = req.headers.cookie || '';
      if (cookies) {
        const getCookie = (name: string) => {
          const match = cookies.match(new RegExp('(^| )' + name + '=([^;]+)'));
          return match ? decodeURIComponent(match[2]) : null;
        };

        try {
          const configStr = getCookie('school_timetable_config');
          if (configStr) {
            const config = JSON.parse(configStr);
            grade = config.grade;
            classNum = config.classNum;
            studentNumber = config.studentNumber;
          }
        } catch (e) { }

        kakaoId = getCookie('kakao_id');
        kakaoNickname = getCookie('kakao_nickname'); // simple cookie, or parse from json if needed. 
        // Logic in _middleware.ts parsed kakao_user_data json or used separate cookies?
        // _middleware.ts: used separate cookies 'kakao_id', 'kakao_nickname'.
      }

      // 1. Log Access
      // Async fire-and-forget to not block request
      (async () => {
        try {
          await db.execute(sql`
                INSERT INTO access_logs (ip, userAgent, method, endpoint, grade, classNum, studentNumber, kakaoId, kakaoNickname)
                VALUES (${ip}, ${userAgent}, ${req.method}, ${req.path}, ${grade}, ${classNum}, ${studentNumber}, ${kakaoId}, ${kakaoNickname})
             `);

          // 2. Student Profile (4-digit ID)
          let studentId: number | null = null;
          if (grade && classNum && studentNumber) {
            const g = parseInt(grade), c = parseInt(classNum), n = parseInt(studentNumber);
            if (!isNaN(g) && !isNaN(c) && !isNaN(n)) {
              studentId = parseInt(`${g}${c}${n.toString().padStart(2, '0')}`);
              await db.execute(sql`
                        INSERT INTO student_profiles (student_id, updatedAt)
                        VALUES (${studentId}, NOW())
                        ON DUPLICATE KEY UPDATE updatedAt = NOW()
                     `);
            }
          }

          // 3. IP Profile
          // Upsert IP Profile
          // MySQL ON DUPLICATE KEY UPDATE
          // We want to increment modificationCount only if it's a modification request
          const isModification = ['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method) && req.path.startsWith('/api/assessment');

          let modCountExpr = sql`modificationCount`;
          if (isModification) {
            modCountExpr = sql`modificationCount + 1`;
          }

          // If studentId found, update it. If not, preserve existing?
          // SQL: student_id = VALUES(student_id) if studentId is not null?
          // Easier to just update.

          const updateSet: any = sql`
                lastAccess = NOW(),
                userAgent = VALUES(userAgent),
                modificationCount = ${modCountExpr},
                kakaoId = COALESCE(VALUES(kakaoId), kakaoId),
                kakaoNickname = COALESCE(VALUES(kakaoNickname), kakaoNickname)
             `;

          if (studentId) {
            await db.execute(sql`
                  INSERT INTO ip_profiles (ip, student_id, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent)
                  VALUES (${ip}, ${studentId}, ${kakaoId}, ${kakaoNickname}, NOW(), ${isModification ? 1 : 0}, ${userAgent})
                  ON DUPLICATE KEY UPDATE 
                    lastAccess = NOW(),
                    student_id = VALUES(student_id),
                    userAgent = VALUES(userAgent),
                    modificationCount = ${modCountExpr},
                    kakaoId = COALESCE(VALUES(kakaoId), kakaoId),
                    kakaoNickname = COALESCE(VALUES(kakaoNickname), kakaoNickname)
               `);
          } else {
            await db.execute(sql`
                  INSERT INTO ip_profiles (ip, kakaoId, kakaoNickname, lastAccess, modificationCount, userAgent)
                  VALUES (${ip}, ${kakaoId}, ${kakaoNickname}, NOW(), ${isModification ? 1 : 0}, ${userAgent})
                  ON DUPLICATE KEY UPDATE 
                    lastAccess = NOW(),
                    userAgent = VALUES(userAgent),
                    modificationCount = ${modCountExpr},
                    kakaoId = COALESCE(VALUES(kakaoId), kakaoId),
                    kakaoNickname = COALESCE(VALUES(kakaoNickname), kakaoNickname)
               `);
          }

        } catch (e) { console.error("Tracking Error:", e); }
      })();

    } catch (e) { console.error("Middleware Init Error:", e); }
    next();
  });

  // Custom API Routes (Local Dev Emulation)
  app.use("/api/admin", adminRouter);
  app.use("/api/assessment", assessmentRouter);
  app.use("/api/my-ip", myIpRouter);

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
