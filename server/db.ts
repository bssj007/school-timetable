import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { InsertUser, users, performanceAssessments, InsertPerformanceAssessment, meals } from "../drizzle/schema";
import path from "path";
import fs from "fs";

let _db: any = null;
let _sqlite: any = null;

export function getRawSqliteDb() {
  if (!_sqlite) {
    try {
      const d1Dir = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
      if (!fs.existsSync(d1Dir)) {
        fs.mkdirSync(d1Dir, { recursive: true });
      }
      const files = fs.readdirSync(d1Dir);
      let sqliteFile = files.find(f => f.endsWith(".sqlite"));
      if (!sqliteFile) {
        sqliteFile = "local-d1.sqlite";
      }
      const dbPath = path.join(d1Dir, sqliteFile);
      _sqlite = new Database(dbPath);
      console.log("[Database] Connected to Raw SQLite:", dbPath);
    } catch (e) {
      console.error("[Database] Error connecting to Raw SQLite:", e);
      return null;
    }
  }
  return _sqlite;
}

export async function getDb() {
  if (!_db) {
    const sqlite = getRawSqliteDb();
    if (sqlite) {
      _db = drizzle(sqlite);
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(users).values(user).onConflictDoUpdate({
    target: users.openId,
    set: {
      name: user.name,
      email: user.email,
      loginMethod: user.loginMethod,
      lastSignedIn: user.lastSignedIn ?? new Date(),
      role: user.role,
    }
  }).run();
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1).all();
  return result.length > 0 ? result[0] : undefined;
}

export async function getPerformanceAssessments(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(performanceAssessments).all();
  } catch (error) {
    return [];
  }
}

export async function getMeals() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(meals).all();
  } catch (error) {
    console.error("[Database] Failed to get meals:", error);
    return [];
  }
}
