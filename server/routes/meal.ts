import express from "express";
import { getMeals } from "../db";

export const mealRouter = express.Router();

mealRouter.get("/", async (req, res) => {
  try {
    const rawMeals = await getMeals();
    console.log(`[Meal API] Fetched ${rawMeals.length} records from DB`);
    
    // Group by date
    const grouped: Record<string, { lunch: string[], dinner: string[], createdAt: Date }> = {};

    rawMeals.forEach((m: any) => {
      if (!m.date) return;
      
      // Clean date format (handle YYYY/MM/DD and YYYY-MM-DD)
      const date = m.date.replace(/\//g, "-").trim();
      
      if (!grouped[date]) {
        grouped[date] = { 
            lunch: [], 
            dinner: [], 
            createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt) 
        };
      }
      
      const lines = (m.content || "").split("\n")
        .map((s: string) => s.trim())
        .filter((line: string) => line !== "" && line !== "식단 정보 없음");

      if (m.type === "석식") {
        grouped[date].dinner = lines;
      } else {
        grouped[date].lunch = lines;
      }
      
      // Update max createdAt
      const ts = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
      if (!isNaN(ts.getTime()) && ts > grouped[date].createdAt) {
        grouped[date].createdAt = ts;
      }
    });

    const meals = Object.entries(grouped).map(([date, data]) => ({
      date,
      lunch: data.lunch,
      dinner: data.dinner,
      updated_at: data.createdAt.toISOString()
    }));

    // Find latest lastUpdated
    let lastUpdated: string | null = new Date().toISOString();
    if (rawMeals.length > 0) {
      const timestamps = rawMeals.map(m => {
        const d = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      });
      const maxTime = Math.max(...timestamps);
      if (maxTime > 0) {
        lastUpdated = new Date(maxTime).toISOString();
      }
    }

    console.log(`[Meal API] Returning ${meals.length} grouped days.`);
    res.json({ meals, lastUpdated });
  } catch (error) {
    console.error("Meal Route Error:", error);
    res.status(500).json({ error: "식단 데이터를 조회하는 중 오류가 발생했습니다." });
  }
});
