import { integer as int, sqliteTable as mysqlTable, text, text as varchar, text as mysqlEnum } from "drizzle-orm/sqlite-core";

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
  id: int("id").primaryKey({ autoIncrement: true }),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId").notNull().unique(),
  name: text("name"),
  email: varchar("email"),
  loginMethod: varchar("loginMethod"),
  role: mysqlEnum("role").default("user").notNull(),
  grade: int("grade"),
  class: int("class"),
  studentNumber: int("studentNumber"),
  createdAt: int("createdAt", { mode: 'timestamp' }).defaultNow().notNull(),
  updatedAt: int("updatedAt", { mode: 'timestamp' }).defaultNow().notNull(),
  lastSignedIn: int("lastSignedIn", { mode: 'timestamp' }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 시스템 설정 테이블
 * 관리자 설정을 저장합니다.
 */
export const systemSettings = mysqlTable("system_settings", {
  key: varchar("key").primaryKey(),
  value: text("value"),
  updatedAt: int("updatedAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

/**
 * 수행평가 데이터 테이블
 * 사용자가 입력한 수행평가 정보를 저장합니다.
 */
export const performanceAssessments = mysqlTable("performance_assessments", {
  id: int("id").primaryKey({ autoIncrement: true }),
  subject: varchar("subject").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  dueDate: varchar("dueDate").notNull(), // YYYY-MM-DD
  grade: int("grade").notNull(),
  classNum: int("classNum").notNull(),
  classTime: int("classTime"),
  isDone: int("isDone").default(0),
  dataset: varchar("dataset").default("").notNull(),
  lastModifiedIp: varchar("lastModifiedIp"),
  createdAt: int("createdAt", { mode: 'timestamp' }).defaultNow().notNull(),
  updatedAt: int("updatedAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export type PerformanceAssessment = typeof performanceAssessments.$inferSelect;
export type InsertPerformanceAssessment = typeof performanceAssessments.$inferInsert;

export const blockedUsers = mysqlTable("blocked_users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  identifier: varchar("identifier").notNull(), // IP or KakaoID
  type: mysqlEnum("type").notNull(),
  reason: text("reason"),
  createdAt: int("createdAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export const accessLogs = mysqlTable("access_logs", {
  id: int("id").primaryKey({ autoIncrement: true }),
  ip: varchar("ip").notNull(),
  kakaoId: varchar("kakaoId"),
  kakaoNickname: varchar("kakaoNickname"),
  endpoint: varchar("endpoint").notNull(),
  method: varchar("method"),
  userAgent: text("userAgent"),
  grade: varchar("grade"),
  classNum: varchar("classNum"),
  studentNumber: varchar("studentNumber"),
  accessedAt: int("accessedAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export const kakaoTokens = mysqlTable("kakao_tokens", {
  id: int("id").primaryKey({ autoIncrement: true }),
  kakaoId: varchar("kakaoId").notNull().unique(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  updatedAt: int("updatedAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export const notificationLogs = mysqlTable("notification_logs", {
  id: int("id").primaryKey({ autoIncrement: true }),
  type: varchar("type").notNull(), // 'DAILY_REMINDER', 'NEW_ASSESSMENT'
  targetDate: varchar("target_date"), // YYYY-MM-DD
  status: varchar("status").notNull(), // 'SUCCESS', 'FAILED'
  message: text("message"),
  createdAt: int("createdAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export const electiveConfig = mysqlTable("elective_config", {
  id: int("id").primaryKey({ autoIncrement: true }),
  grade: int("grade").notNull(),
  subject: varchar("subject").notNull(),
  originalTeacher: varchar("originalTeacher").notNull(),
  classCode: varchar("classCode"), // A, B, C...
  fullTeacherName: varchar("fullTeacherName"),
  updatedAt: int("updatedAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export type ElectiveConfig = typeof electiveConfig.$inferSelect;
export type InsertElectiveConfig = typeof electiveConfig.$inferInsert;

export const meals = mysqlTable("meals", {
  id: int("id").primaryKey({ autoIncrement: true }),
  date: varchar("date").notNull(), // YYYY/MM/DD or YYYY-MM-DD
  content: text("content").notNull(),
  calories: varchar("calories"),
  origins: text("origins"),
  type: varchar("type").default("중식"),
  sysId: varchar("sysId").default("bssj-h"),
  createdAt: int("createdAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export type Meal = typeof meals.$inferSelect;
export type InsertMeal = typeof meals.$inferInsert;

export const studentProfiles = mysqlTable("student_profiles", {
  studentId: int("student_id").primaryKey(),
  electives: text("electives"),
  updatedAt: int("updatedAt", { mode: 'timestamp' }).defaultNow().notNull(),
});

export const ipProfiles = mysqlTable("ip_profiles", {
  ip: varchar("ip").primaryKey(),
  studentId: int("student_id"),
  kakaoId: varchar("kakaoId"),
  kakaoNickname: varchar("kakaoNickname"),
  lastAccess: int("lastAccess", { mode: 'timestamp' }).defaultNow().notNull(),
  modificationCount: int("modificationCount").default(0),
  userAgent: text("userAgent"),
});
