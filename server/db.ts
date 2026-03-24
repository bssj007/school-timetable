import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { InsertUser, users, performanceAssessments, InsertPerformanceAssessment, meals } from "../drizzle/schema";
import path from "path";
import fs from "fs";

let _db: any = null;

export async function getDb() {
  if (!_db) {
    try {
      // Find D1 sqlite file in .wrangler dir
      const d1Dir = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
      
      if (!fs.existsSync(d1Dir)) {
          console.error(`[Database] D1 directory not found: ${d1Dir}`);
          return null;
      }

      const files = fs.readdirSync(d1Dir);
      const sqliteFile = files.find(f => f.endsWith(".sqlite"));
      
      if (!sqliteFile) {
        console.error("[Database] No SQLite file found in wrangler state directory.");
        return null;
      }
      
      const dbPath = path.join(d1Dir, sqliteFile);
      const sqlite = new Database(dbPath);
      _db = drizzle(sqlite);
      console.log("[Database] Connected to D1:", dbPath);
    } catch (error) {
      console.error("[Database] Error connecting to D1:", error);
      _db = null;
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
