import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { accessLogs, studentProfiles, ipProfiles } from "../../drizzle/schema";
import { adminRouter } from "../routes/admin";
import { assessmentRouter } from "../routes/assessment";
import { myIpRouter } from "../routes/my-ip";
import { mealRouter } from "../routes/meal";
import { testDbQueryRouter } from "../routes/test-db-query";
import { notificationsRouter, adminNotificationsRouter } from "../routes/notifications";
import { runMigrations } from "./migrate";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { sql } from "drizzle-orm";
import { parseUA } from "../lib/uaDetect";

async function startServer() {
  // Run migrations on startup (Local Dev)
  await runMigrations();

  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // [Middleware] IP & Profile Tracking
  app.use(async (req, res, next) => {
    try {
      const db = await getDb();
      if (!db) return next();

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';
      const ua = parseUA(userAgent); // UA 파싱 (browserDetect.ts Layer 2 서버 포트)

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
        kakaoNickname = getCookie('kakao_nickname');
      }

      // Async tracking
      (async () => {
        try {
          // 1. Access Log
          await db.insert(accessLogs).values({
            ip,
            userAgent,
            method: req.method,
            endpoint: req.path,
            grade: grade?.toString(),
            classNum: classNum?.toString(),
            studentNumber: studentNumber?.toString(),
            kakaoId,
            kakaoNickname,
            // UA 파싱 결과
            deviceType: ua.deviceType,
            browserKey: ua.browserKey,
            os: ua.os ?? null,
            isInApp: ua.isInApp ? 1 : 0,
          } as any).run();

          let studentId: number | null = null;
          if (grade && classNum && studentNumber) {
            const g = parseInt(grade), c = parseInt(classNum), n = parseInt(studentNumber);
            if (!isNaN(g) && !isNaN(c) && !isNaN(n)) {
              studentId = parseInt(`${g}${c}${n.toString().padStart(2, '0')}`);
              
              // 2. Student Profile
              await db.insert(studentProfiles).values({
                studentId,
                updatedAt: new Date()
              }).onConflictDoUpdate({
                target: studentProfiles.studentId,
                set: { updatedAt: new Date() }
              }).run();
            }
          }

          // 3. IP Profile
          const isModification = ['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method) && req.path.startsWith('/api/assessment');
          
          await db.insert(ipProfiles).values({
            ip,
            studentId,
            kakaoId,
            kakaoNickname,
            lastAccess: new Date(),
            modificationCount: isModification ? 1 : 0,
            userAgent,
            // UA 파싱 결과
            deviceType: ua.deviceType,
            browserKey: ua.browserKey,
            os: ua.os ?? null,
            isInApp: ua.isInApp ? 1 : 0,
          } as any).onConflictDoUpdate({
            target: ipProfiles.ip,
            set: {
              lastAccess: new Date(),
              studentId: studentId ?? undefined,
              userAgent,
              deviceType: ua.deviceType,
              browserKey: ua.browserKey,
              os: ua.os ?? null,
              isInApp: ua.isInApp ? 1 : 0,
              kakaoId: kakaoId || sql`kakaoId`,
              kakaoNickname: kakaoNickname || sql`kakaoNickname`,
              modificationCount: isModification ? sql`modificationCount + 1` : sql`modificationCount`
            }
          }).run();

        } catch (e) { 
          // console.error("Tracking Error:", e); // Silent to avoid clutter
        }
      })();

    } catch (e) { }
    next();
  });

  app.use("/api/admin/notifications", adminNotificationsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/assessment", assessmentRouter);
  app.use("/api/my-ip", myIpRouter);
  app.use("/api/meal", mealRouter);
  app.use("/api/test-db/query", testDbQueryRouter);

  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
