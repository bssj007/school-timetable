import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { UtensilsCrossed, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface MealEntry {
    date: string; // "YYYY-MM-DD"
    items: string[];
    updated_at: string;
}

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_COLORS = [
    "", // 일
    "text-gray-700", // 월
    "text-gray-700", // 화
    "text-gray-700", // 수
    "text-gray-700", // 목
    "text-gray-700", // 금
    "", // 토
];

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
    return d.toISOString().split("T")[0];
}

export default function MealPage() {
    const [weekOffset, setWeekOffset] = useState(0);

    const today = new Date();
    const baseDate = new Date(today);
    baseDate.setDate(today.getDate() + weekOffset * 7);

    const { start, end } = getWeekRange(baseDate);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["meal"],
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
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-10 shadow-sm border-b border-orange-100">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-md">
                            <UtensilsCrossed className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">🍱 급식 식단표</h1>
                            {lastUpdated && (
                                <p className="text-xs text-gray-400 leading-none mt-0.5">마지막 갱신: {lastUpdated}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-orange-500 transition-colors px-2 py-1 rounded-lg hover:bg-orange-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                        새로고침
                    </button>
                </div>
            </header>

            {/* Week Navigation */}
            <div className="max-w-5xl mx-auto px-4 pt-6 pb-2">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setWeekOffset(w => w - 1)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-orange-100 text-gray-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-all shadow-sm"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="text-sm font-medium">이전 주</span>
                    </button>

                    <div className="text-center">
                        <p className="text-base font-bold text-gray-800">{weekLabel}</p>
                        {weekOffset === 0 && (
                            <p className="text-xs text-orange-500 font-medium mt-0.5">이번 주</p>
                        )}
                    </div>

                    <button
                        onClick={() => setWeekOffset(w => w + 1)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-orange-100 text-gray-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 transition-all shadow-sm"
                    >
                        <span className="text-sm font-medium">다음 주</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Meal Grid */}
            <main className="max-w-5xl mx-auto px-4 py-4 pb-16">
                {error ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center mt-8">
                        <p className="text-red-500 font-semibold text-lg">⚠️ 데이터 로드 실패</p>
                        <p className="text-red-400 text-sm mt-1">{(error as Error).message}</p>
                        <button
                            onClick={() => refetch()}
                            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
                        >
                            다시 시도
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mt-2">
                        {weekDays.map((day, idx) => {
                            const dateStr = formatDate(day);
                            const meal = mealMap[dateStr];
                            const isToday = dateStr === todayStr;
                            const weekday = day.getDay();
                            const weekdayLabel = WEEKDAY_KR[weekday];

                            return (
                                <div
                                    key={dateStr}
                                    className={`
                                        rounded-2xl p-4 flex flex-col min-h-[160px] transition-all
                                        ${isToday
                                            ? "bg-gradient-to-br from-orange-400 to-amber-500 shadow-lg shadow-orange-200 text-white"
                                            : "bg-white border border-orange-100 shadow-sm hover:shadow-md hover:border-orange-200"
                                        }
                                    `}
                                >
                                    {/* Day Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-orange-100" : "text-orange-400"}`}>
                                                {weekdayLabel}
                                            </span>
                                            <p className={`text-2xl font-black leading-none mt-0.5 ${isToday ? "text-white" : "text-gray-800"}`}>
                                                {day.getDate()}
                                            </p>
                                        </div>
                                        {isToday && (
                                            <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full text-white">
                                                오늘
                                            </span>
                                        )}
                                    </div>

                                    {/* Meal Items */}
                                    {isLoading ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className={`w-5 h-5 rounded-full border-2 animate-spin ${isToday ? "border-white/40 border-t-white" : "border-orange-200 border-t-orange-400"}`} />
                                        </div>
                                    ) : meal && meal.items.length > 0 ? (
                                        <ul className="flex-1 space-y-1">
                                            {meal.items.map((item, i) => (
                                                <li key={i} className={`text-xs leading-snug ${isToday ? "text-white/90" : "text-gray-600"}`}>
                                                    {i === 0 ? (
                                                        <span className={`font-semibold ${isToday ? "text-white" : "text-gray-900"}`}>
                                                            {item}
                                                        </span>
                                                    ) : item}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center">
                                            <p className={`text-xs text-center ${isToday ? "text-white/60" : "text-gray-300"}`}>
                                                식단 정보 없음
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && !error && (data?.meals?.length ?? 0) === 0 && (
                    <div className="text-center mt-12">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
                            <UtensilsCrossed className="w-10 h-10 text-orange-300" />
                        </div>
                        <p className="text-gray-500 font-semibold text-lg">아직 식단이 등록되지 않았습니다</p>
                        <p className="text-gray-400 text-sm mt-1">관리자 페이지에서 식단 데이터를 불러와 주세요.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
