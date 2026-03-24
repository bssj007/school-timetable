import { meals, Meal, InsertMeal } from '../drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from './db';

/**
 * Scrapes meal data from the school website for a given year and month.
 * @param year YYYY
 * @param month MM (1-12)
 * @param sysId
 * @param dietTy '중식' | '석식'
 * @returns Array of meal data
 */
export async function scrapeMeals(year: number, month: number, sysId: string = 'bssj-h', dietTy: string = '중식') {
    const monthStr = month.toString().padStart(2, '0');
    const monthFirst = `${year}/${monthStr}/01`;
    
    // Get last day of month
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnmt = `${year}/${monthStr}/${lastDay}`;

    console.log(`[Scraper] Fetching ${dietTy} for ${year}/${monthStr} (${monthFirst} ~ ${monthEnmt})`);

    const response = await fetch("https://school.busanedu.net/bssj-h/dv/dietView/selectDvList.do", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sysId: sysId,
            dietTy: dietTy,
            monthFirst: monthFirst,
            monthEnmt: monthEnmt
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch meals: ${response.statusText}`);
    }

    const data: any[] = await response.json();
    
    // The first element is usually {resultAt: "Y"}
    return data.filter(item => item.dietSeq && item.dietSeq !== 'holiday').map(item => ({
        date: item.dietDate,
        content: item.dietCn,
        calories: item.dietCal,
        origins: item.orgplce,
        type: item.dietTy || '중식',
        sysId: item.sysId || sysId
    }));
}

/**
 * Updates the database with meal data for the current and next month.
 * Can take an optional 'env' for Cloudflare Worker context, or use local 'getDb()'.
 */
export async function updateMealDatabase(env?: any) {
    const db = await (env?.DB ? (async () => {
        // This is a bit of a hack to support both D1 via drizzle-orm/d1 
        // and local better-sqlite3 via server/db.ts
        const { drizzle } = await import('drizzle-orm/d1');
        return drizzle(env.DB);
    })() : getDb());

    if (!db) {
        console.error("[Scraper] Database not available.");
        return;
    }
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    // Fetch current and next month
    const monthsToFetch = [
        { y: currentYear, m: currentMonth },
        { y: currentMonth === 12 ? currentYear + 1 : currentYear, m: currentMonth === 12 ? 1 : currentMonth + 1 }
    ];

    const mealTypes = ['중식', '석식'];

    for (const { y, m } of monthsToFetch) {
        for (const type of mealTypes) {
            try {
                const fetchedMeals = await scrapeMeals(y, m, 'bssj-h', type);
                console.log(`[Scraper] Found ${fetchedMeals.length} ${type} for ${y}/${m}`);
                
                for (const meal of fetchedMeals) {
                    await (db as any).insert(meals).values({
                        ...meal,
                        createdAt: new Date()
                    }).onConflictDoUpdate({
                        target: [meals.date, meals.type],
                        set: {
                            content: meal.content,
                            calories: meal.calories,
                            origins: meal.origins,
                            createdAt: new Date()
                        }
                    }).run();
                }
            } catch (error) {
                console.error(`[Scraper] Error fetching ${type} for ${y}/${m}:`, error);
            }
        }
    }
}
