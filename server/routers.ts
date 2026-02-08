import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getTimetableData, getPerformanceAssessments, createPerformanceAssessment, updatePerformanceAssessment, deletePerformanceAssessment, saveTimetableData } from "../server/db";
import { fetchTimetableFromComcigan, searchSchools } from "./comcigan";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  timetable: router({
    get: publicProcedure.query(async () => {
      // 성지고 1학년 1반 시간표 데이터 조회
      return getTimetableData(1, 1);
    }),

    // 컴시간알리미에서 시간표 가져오기
    fetchFromComcigan: publicProcedure
      .input((val: unknown) => {
        if (typeof val !== "object" || val === null) throw new Error("Invalid input");
        const obj = val as Record<string, unknown>;
        return {
          schoolName: String(obj.schoolName),
          grade: Number(obj.grade),
          classNum: Number(obj.classNum),
        };
      })
      .mutation(async ({ input }) => {
        try {
          console.log('[Router] Fetching from Comcigan:', input);

          // 컴시간알리미에서 데이터 가져오기
          const timetableData = await fetchTimetableFromComcigan(
            input.schoolName,
            input.grade,
            input.classNum
          );

          console.log('[Router] Fetched data count:', timetableData.length);

          // 데이터베이스에 저장
          await saveTimetableData(timetableData);

          return {
            success: true,
            message: `${input.schoolName} ${input.grade}학년 ${input.classNum}반 시간표를 성공적으로 가져왔습니다.`,
            count: timetableData.length,
          };
        } catch (error) {
          console.error('[Router] 시간표 가져오기 실패:', error);
          throw new Error(error instanceof Error ? error.message : '시간표 가져오기 실패');
        }
      }),

    // 학교 검색
    searchSchools: publicProcedure
      .input((val: unknown) => {
        if (typeof val !== "object" || val === null) throw new Error("Invalid input");
        const obj = val as Record<string, unknown>;
        return String(obj.schoolName);
      })
      .query(async ({ input: schoolName }) => {
        try {
          const schools = await searchSchools(schoolName);
          return schools;
        } catch (error) {
          console.error('[Router] 학교 검색 실패:', error);
          throw new Error(error instanceof Error ? error.message : '학교 검색 실패');
        }
      }),
  }),

  assessment: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // 사용자의 수행평가 목록 조회
      return getPerformanceAssessments(ctx.user.id);
    }),
    create: protectedProcedure
      .input(
        (val: unknown) => {
          if (typeof val !== "object" || val === null) throw new Error("Invalid input");
          const obj = val as Record<string, unknown>;
          return {
            assessmentDate: String(obj.assessmentDate),
            subject: String(obj.subject),
            content: String(obj.content),
            classTime: typeof obj.classTime === "number" ? obj.classTime : undefined,
            weekday: typeof obj.weekday === "number" ? obj.weekday : undefined,
          };
        }
      )
      .mutation(async ({ ctx, input }) => {
        return createPerformanceAssessment({
          userId: ctx.user.id,
          assessmentDate: input.assessmentDate,
          subject: input.subject,
          content: input.content,
          classTime: input.classTime,
          weekday: input.weekday,
        });
      }),
    update: protectedProcedure
      .input(
        (val: unknown) => {
          if (typeof val !== "object" || val === null) throw new Error("Invalid input");
          const obj = val as Record<string, unknown>;
          return {
            id: Number(obj.id),
            assessmentDate: typeof obj.assessmentDate === "string" ? obj.assessmentDate : undefined,
            subject: typeof obj.subject === "string" ? obj.subject : undefined,
            content: typeof obj.content === "string" ? obj.content : undefined,
            classTime: typeof obj.classTime === "number" ? obj.classTime : undefined,
            weekday: typeof obj.weekday === "number" ? obj.weekday : undefined,
          };
        }
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updatePerformanceAssessment(id, data);
      }),
    delete: protectedProcedure
      .input((val: unknown) => {
        if (typeof val !== "object" || val === null) throw new Error("Invalid input");
        const obj = val as Record<string, unknown>;
        return Number(obj.id);
      })
      .mutation(async ({ input: id }) => {
        return deletePerformanceAssessment(id);
      }),
  }),

  admin: router({
    checkPassword: publicProcedure
      .input((val: unknown) => {
        if (typeof val !== "object" || val === null) throw new Error("Invalid input");
        const obj = val as Record<string, unknown>;
        return String(obj.password);
      })
      .mutation(async ({ input: password }) => {
        try {
          // Read password from file
          // Assuming the server is running from the root of the project or server directory.
          // Let's try to resolve the path relative to this file or process.cwd()
          // Given the structure, server/adminPW exists.
          
          const fs = await import('fs/promises');
          const path = await import('path');
          
          // Construct path to adminPW. 
          // If we are in server/routers.ts, and adminPW is in server/adminPW.
          // process.cwd() usually points to the root in typical setups, or server if cd'd in.
          // Let's try an absolute path logic or relative to __dirname equivalents if possible, 
          // but for now let's assume standard execution from project root and file is at server/adminPW
          // Or if running from server folder.
          
          // Let's try to find it. 
          let passwordFilePool = ['server/adminPW', 'adminPW']; 
          let currentPassword = '';
          
          for (const filePath of passwordFilePool) {
             try {
                const content = await fs.readFile(filePath, 'utf-8');
                currentPassword = content.trim();
                break;
             } catch (e) {
                // ignore
             }
          }
          
          if (!currentPassword) {
             // Fallback or error
             console.error("Could not read adminPW file");
             return { success: false, message: "Server configuration error" };
          }

          if (password === currentPassword) {
            return { success: true };
          } else {
            return { success: false, message: "Incorrect password" };
          }
        } catch (error) {
          console.error("Admin password check error", error);
          return { success: false, message: "Error verifying password" };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
