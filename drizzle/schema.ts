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
  grade: int("grade"),
  class: int("class"),
  studentNumber: int("studentNumber"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 시스템 설정 테이블
 * 관리자 설정을 저장합니다.
 */
export const systemSettings = mysqlTable("system_settings", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

/**
 * 수행평가 데이터 테이블
 * 사용자가 입력한 수행평가 정보를 저장합니다.
 */
/**
 * 수행평가 데이터 테이블
 * 사용자가 입력한 수행평가 정보를 저장합니다.
 */
export const performanceAssessments = mysqlTable("performance_assessments", {
  id: int("id").autoincrement().primaryKey(),
  subject: varchar("subject", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: varchar("dueDate", { length: 20 }).notNull(), // YYYY-MM-DD
  grade: int("grade").notNull(),
  classNum: int("classNum").notNull(),
  classTime: int("classTime"),
  isDone: int("isDone").default(0),
  lastModifiedIp: varchar("lastModifiedIp", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PerformanceAssessment = typeof performanceAssessments.$inferSelect;
export type InsertPerformanceAssessment = typeof performanceAssessments.$inferInsert;

export const blockedUsers = mysqlTable("blocked_users", {
  id: int("id").autoincrement().primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(), // IP or KakaoID
  type: mysqlEnum("type", ["IP", "KakaoID"]).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accessLogs = mysqlTable("access_logs", {
  id: int("id").autoincrement().primaryKey(),
  ip: varchar("ip", { length: 45 }).notNull(),
  kakaoId: varchar("kakaoId", { length: 255 }),
  kakaoNickname: varchar("kakaoNickname", { length: 255 }),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  method: varchar("method", { length: 10 }),
  userAgent: text("userAgent"),
  grade: varchar("grade", { length: 10 }),
  classNum: varchar("classNum", { length: 10 }),
  studentNumber: varchar("studentNumber", { length: 10 }),
  accessedAt: timestamp("accessedAt").defaultNow().notNull(),
});

export const kakaoTokens = mysqlTable("kakao_tokens", {
  id: int("id").autoincrement().primaryKey(),
  kakaoId: varchar("kakaoId", { length: 255 }).notNull().unique(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const notificationLogs = mysqlTable("notification_logs", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 50 }).notNull(), // 'DAILY_REMINDER', 'NEW_ASSESSMENT'
  targetDate: varchar("target_date", { length: 20 }), // YYYY-MM-DD
  status: varchar("status", { length: 20 }).notNull(), // 'SUCCESS', 'FAILED'
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
