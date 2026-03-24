import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { InsertUser, users, performanceAssessments, InsertPerformanceAssessment, meals } from "../drizzle/schema";
import path from "path";
import fs from "fs";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db) {
    try {
      // Local D1 path mapping
      const d1Dir = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
      const files = fs.readdirSync(d1Dir);
      const sqliteFile = files.find(f => f.endsWith(".sqlite"));
      
      if (!sqliteFile) {
        throw new Error("No SQLite file found in wrangler state");
      }
      
      const dbPath = path.join(d1Dir, sqliteFile);
      const sqlite = new Database(dbPath);
      _db = drizzle(sqlite);
      console.log("[Database] Connected to local D1:", dbPath);
    } catch (error) {
      console.warn("[Database] Failed to connect to local D1:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(users).values(user).onConflictDoUpdate({
      target: users.openId,
      set: {
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        lastSignedIn: user.lastSignedIn ?? new Date(),
        role: user.role,
      }
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPerformanceAssessments(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(performanceAssessments); // simplified
  } catch (error) {
    return [];
  }
}

export async function getMeals() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(meals);
  } catch (error) {
    console.error("[Database] Failed to get meals:", error);
    return [];
  }
}
