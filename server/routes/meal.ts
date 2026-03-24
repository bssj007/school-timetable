import express from "express";
import { getMeals } from "../db";

export const mealRouter = express.Router();

mealRouter.get("/", async (req, res) => {
  try {
    const rawMeals = await getMeals();
    
    // Group by date
    const grouped: Record<string, { lunch: string[], dinner: string[], createdAt: Date }> = {};

    rawMeals.forEach((m: any) => {
      const date = m.date.replace(/\//g, "-");
      if (!grouped[date]) {
        grouped[date] = { lunch: [], dinner: [], createdAt: m.createdAt };
      }
      
      const items = (m.content || "").split("\n").map((s: string) => s.trim()).filter((line: string) => line !== "");
      if (m.type === "석식") {
        grouped[date].dinner = items;
      } else {
        grouped[date].lunch = items;
      }
      
      const d = m.createdAt instanceof Date ? m.createdAt : new Date(typeof m.createdAt === 'string' ? m.createdAt.replace(' ', 'T') : m.createdAt);
      if (!isNaN(d.getTime()) && d > grouped[date].createdAt) {
        grouped[date].createdAt = d;
      }
    });

    const meals = Object.entries(grouped).map(([date, data]) => ({
      date,
      lunch: data.lunch,
      dinner: data.dinner,
      updated_at: data.createdAt.toISOString()
    }));

    let lastUpdated: string | null = new Date().toISOString();
    if (rawMeals.length > 0) {
      const timestamps = rawMeals.map(m => {
        const d = m.createdAt instanceof Date ? m.createdAt : new Date(typeof m.createdAt === 'string' ? m.createdAt.replace(' ', 'T') : m.createdAt);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      });
      const maxTime = Math.max(...timestamps);
      if (maxTime > 0) {
        lastUpdated = new Date(maxTime).toISOString();
      }
    }

    res.json({ meals, lastUpdated });
  } catch (error) {
    console.error("Meal Route Error:", error);
    res.status(500).json({ error: "식단 데이터를 조회하는 중 오류가 발생했습니다." });
  }
});
