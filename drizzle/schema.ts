import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 시간표 데이터 테이블
 * 컴시간알리미 API에서 가져온 시간표 정보를 저장합니다.
 */
export const timetables = mysqlTable("timetables", {
  id: int("id").autoincrement().primaryKey(),
  schoolCode: int("schoolCode").notNull(), // 학교 코드
  schoolName: varchar("schoolName", { length: 255 }).notNull(), // 학교 이름
  region: varchar("region", { length: 100 }).notNull(), // 지역
  grade: int("grade").notNull(), // 학년
  class: int("class").notNull(), // 반
  weekday: int("weekday").notNull(), // 요일 (0: 월 ~ 4: 금)
  classTime: int("classTime").notNull(), // 교시
  teacher: varchar("teacher", { length: 100 }), // 선생님 이름
  subject: varchar("subject", { length: 100 }), // 과목명
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Timetable = typeof timetables.$inferSelect;
export type InsertTimetable = typeof timetables.$inferInsert;

/**
 * 수행평가 데이터 테이블
 * 사용자가 입력한 수행평가 정보를 저장합니다.
 */
export const performanceAssessments = mysqlTable("performanceAssessments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 작성자 ID
  assessmentDate: varchar("assessmentDate", { length: 10 }).notNull(), // 수행평가 날짜 (YYYY-MM-DD)
  subject: varchar("subject", { length: 100 }).notNull(), // 과목명
  content: text("content").notNull(), // 수행평가 내용
  classTime: int("classTime"), // 교시 (선택사항)
  weekday: int("weekday"), // 요일 (선택사항)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PerformanceAssessment = typeof performanceAssessments.$inferSelect;
export type InsertPerformanceAssessment = typeof performanceAssessments.$inferInsert;
