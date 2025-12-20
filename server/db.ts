import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, timetables, InsertTimetable, performanceAssessments, InsertPerformanceAssessment } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// 시간표 데이터 조회 함수
export async function getTimetableData(grade: number, classNum: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get timetable: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(timetables)
      .where(
        and(
          eq(timetables.grade, grade),
          eq(timetables.class, classNum)
        )
      );
    return result;
  } catch (error) {
    console.error("[Database] Failed to get timetable:", error);
    return [];
  }
}

// 시간표 데이터 저장 함수
export async function saveTimetableData(data: InsertTimetable[]) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save timetable: database not available");
    return;
  }

  try {
    // 기존 데이터 삭제
    if (data.length > 0) {
      const first = data[0];
      await db
        .delete(timetables)
        .where(
          and(
            eq(timetables.grade, first.grade),
            eq(timetables.class, first.class)
          )
        );
    }
    // 새 데이터 삽입
    if (data.length > 0) {
      await db.insert(timetables).values(data);
    }
  } catch (error) {
    console.error("[Database] Failed to save timetable:", error);
    throw error;
  }
}

// 수행평가 데이터 조회 함수
export async function getPerformanceAssessments(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get assessments: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(performanceAssessments)
      .where(eq(performanceAssessments.userId, userId));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get assessments:", error);
    return [];
  }
}

// 수행평가 데이터 생성 함수
export async function createPerformanceAssessment(data: InsertPerformanceAssessment) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create assessment: database not available");
    return null;
  }

  try {
    const result = await db.insert(performanceAssessments).values(data);
    return result;
  } catch (error) {
    console.error("[Database] Failed to create assessment:", error);
    throw error;
  }
}

// 수행평가 데이터 수정 함수
export async function updatePerformanceAssessment(id: number, data: Partial<InsertPerformanceAssessment>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update assessment: database not available");
    return null;
  }

  try {
    const result = await db
      .update(performanceAssessments)
      .set(data)
      .where(eq(performanceAssessments.id, id));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update assessment:", error);
    throw error;
  }
}

// 수행평가 데이터 삭제 함수
export async function deletePerformanceAssessment(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete assessment: database not available");
    return null;
  }

  try {
    const result = await db
      .delete(performanceAssessments)
      .where(eq(performanceAssessments.id, id));
    return result;
  } catch (error) {
    console.error("[Database] Failed to delete assessment:", error);
    throw error;
  }
}
