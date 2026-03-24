import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { UtensilsCrossed, ChevronLeft, ChevronRight, RefreshCw, Sun, Moon } from "lucide-react";

interface MealEntry {
    date: string; // "YYYY-MM-DD"
    lunch: string[];
    dinner: string[];
    updated_at: string;
}

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function getWeekRange(base: Date): { start: Date; end: Date } {
    const day = base.getDay(); // 0=Sun
    const diffToMon = (day === 0) ? -6 : 1 - day;
    const start = new Date(base);
    start.setDate(base.getDate() + diffToMon);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 4); // Friday
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function MealPage() {
    const [weekOffset, setWeekOffset] = useState(0);

    const today = new Date();
    const baseDate = new Date(today);
    baseDate.setDate(today.getDate() + weekOffset * 7);

    const { start, end } = getWeekRange(baseDate);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["meal", weekOffset],
        queryFn: async () => {
            const res = await fetch("/api/meal");
            if (!res.ok) throw new Error("식단 데이터를 불러오지 못했습니다.");
            return res.json() as Promise<{ meals: MealEntry[]; lastUpdated: string | null }>;
        },
        staleTime: 5 * 60 * 1000,
    });

    // Build a map of date → MealEntry for quick lookup
    const mealMap = useMemo(() => {
        const map: Record<string, MealEntry> = {};
        (data?.meals || []).forEach(m => { map[m.date] = m; });
        return map;
    }, [data]);

    // Build the 5 days (Mon–Fri) for the current week
    const weekDays = useMemo(() => {
        const days: Date[] = [];
        for (let i = 0; i < 5; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            days.push(d);
        }
        return days;
    }, [start]);

    const todayStr = formatDate(today);

    const weekLabel = (() => {
        const startM = start.getMonth() + 1;
        const startD = start.getDate();
        const endM = end.getMonth() + 1;
        const endD = end.getDate();
        const year = start.getFullYear();
        if (startM === endM) return `${year}년 ${startM}월 ${startD}일 ~ ${endD}일`;
        return `${year}년 ${startM}월 ${startD}일 ~ ${endM}월 ${endD}일`;
    })();

    const lastUpdated = data?.lastUpdated
        ? new Date(data.lastUpdated).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        : null;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white sticky top-0 z-20 shadow-sm border-b border-slate-200">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200">
                            <UtensilsCrossed className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">학교 급식표</h1>
                            {lastUpdated && (
                                <p className="text-[10px] text-slate-400 mt-0.5">업데이트: {lastUpdated}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                        title="새로고침"
                    >
                        <RefreshCw className={`w-5 h-5 text-slate-400 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </header>

            {/* Navigation */}
            <div className="max-w-6xl mx-auto px-4 py-6">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between mb-6">
                    <button
                        onClick={() => setWeekOffset(w => w - 1)}
                        className="p-2 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-slate-600"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-slate-800">{weekLabel}</h2>
                        {weekOffset === 0 && <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">이번 주</span>}
                    </div>
                    <button
                        onClick={() => setWeekOffset(w => w + 1)}
                        className="p-2 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all text-slate-600"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                {/* Grid */}
                {error ? (
                    <div className="text-center py-20">
                        <p className="text-red-500 font-medium">데이터를 불러오지 못했습니다.</p>
                        <button onClick={() => refetch()} className="mt-4 text-slate-500 underline text-sm">다시 시도</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {weekDays.map((day) => {
                            const dateStr = formatDate(day);
                            const meal = mealMap[dateStr];
                            const isToday = dateStr === todayStr;
                            const weekday = day.getDay();

                            return (
                                <div key={dateStr} className={`flex flex-col gap-3 ${isToday ? "opacity-100" : "opacity-90"}`}>
                                    {/* Date indicator */}
                                    <div className={`p-3 rounded-2xl flex items-center justify-between ${isToday ? "bg-orange-500 text-white shadow-md" : "bg-white border border-slate-200 text-slate-800"}`}>
                                        <span className="font-bold text-sm">{WEEKDAY_KR[weekday]}</span>
                                        <span className="text-xl font-black">{day.getDate()}</span>
                                    </div>

                                    {/* Lunch Box */}
                                    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md ${isToday ? "ring-2 ring-orange-500 ring-offset-2" : ""}`}>
                                        <div className="bg-amber-50 px-3 py-2 flex items-center justify-between border-b border-amber-100">
                                            <div className="flex items-center gap-1.5">
                                                <Sun className="w-3.5 h-3.5 text-amber-500" />
                                                <span className="text-[11px] font-bold text-amber-700">중식</span>
                                            </div>
                                        </div>
                                        <div className="p-3 pb-4">
                                            {meal?.lunch && meal.lunch.length > 0 ? (
                                                <ul className="space-y-1">
                                                    {meal.lunch.map((item, i) => (
                                                        <li key={i} className="text-[11px] leading-tight text-slate-600">
                                                            {i === 0 ? <span className="font-bold text-slate-800 text-xs block mb-1">{item}</span> : item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-[10px] text-slate-300 py-4 text-center">식단 없음</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Dinner Box */}
                                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md">
                                        <div className="bg-indigo-50 px-3 py-2 flex items-center justify-between border-b border-indigo-100">
                                            <div className="flex items-center gap-1.5">
                                                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                                                <span className="text-[11px] font-bold text-indigo-700">석식</span>
                                            </div>
                                        </div>
                                        <div className="p-3 pb-4">
                                            {meal?.dinner && meal.dinner.length > 0 ? (
                                                <ul className="space-y-1">
                                                    {meal.dinner.map((item, i) => (
                                                        <li key={i} className="text-[11px] leading-tight text-slate-600">
                                                            {i === 0 ? <span className="font-bold text-slate-800 text-xs block mb-1">{item}</span> : item}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-[10px] text-slate-300 py-4 text-center">식단 없음</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
