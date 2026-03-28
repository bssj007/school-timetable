import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { UtensilsCrossed, ChevronLeft, ChevronRight, Sun, Moon, MessageSquarePlus, X, Send, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

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

// 음식명과 알레르기 번호를 분리: "닭곰탕&사리 (5.6.15)" → { name: "닭곰탕&사리", allergens: "5.6.15" }
function parseMenuItem(raw: string): { name: string; allergens: string | null } {
    const match = raw.match(/^(.+?)\s*\(([\d.,\s]+)\)\s*$/);
    if (match) {
        return { name: match[1].trim(), allergens: match[2].trim() };
    }
    return { name: raw.trim(), allergens: null };
}

// 쿠키에서 학번 파싱 (공통 유틸)
function readStudentFromCookie(): { grade: number | null; classNum: number | null; studentNumber: number | null } {
    try {
        const match = document.cookie.match(/(^|;\s*)school_timetable_config=([^;]+)/);
        if (match) {
            const cfg = JSON.parse(decodeURIComponent(match[2]));
            return {
                grade: cfg.grade ? parseInt(cfg.grade) : null,
                classNum: cfg.classNum ? parseInt(cfg.classNum) : null,
                studentNumber: cfg.studentNumber ? parseInt(cfg.studentNumber) : null,
            };
        }
    } catch (_) {}
    return { grade: null, classNum: null, studentNumber: null };
}

// ── 별점 컴포넌트 ─────────────────────────────────────────────────
function StarRating({ date, type, readOnly = false }: { date: string; type: "lunch" | "dinner"; readOnly?: boolean }) {
    const qc = useQueryClient();
    const student = readStudentFromCookie();
    const hasStudent = !!(student.grade && student.classNum && student.studentNumber);

    const params = new URLSearchParams({ date, type });
    if (hasStudent) {
        params.set("grade", String(student.grade));
        params.set("classNum", String(student.classNum));
        params.set("studentNumber", String(student.studentNumber));
    }

    const ratingQuery = useQuery({
        queryKey: ["meal-rating", date, type, student.grade, student.classNum, student.studentNumber],
        queryFn: async () => {
            const res = await fetch(`/api/meal-ratings?${params}`);
            if (!res.ok) return { avg: null, count: 0, myRating: null };
            return res.json() as Promise<{ avg: number | null; count: number; myRating: number | null }>;
        },
        staleTime: 5000,
        refetchInterval: 5000,
    });

    const [hovered, setHovered] = useState<number | null>(null);

    const rateMutation = useMutation({
        mutationFn: async (rating: number) => {
            const res = await fetch("/api/meal-ratings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, type, ...student, rating }),
            });
            const data = await res.json() as any;
            if (!res.ok) throw new Error(data.error || "별점 저장 실패");
            return data;
        },
        onSuccess: (data) => {
            qc.setQueryData(
                ["meal-rating", date, type, student.grade, student.classNum, student.studentNumber],
                { avg: data.avg, count: data.count, myRating: data.myRating }
            );
            toast.success("별점이 저장되었습니다!");
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const myRating = ratingQuery.data?.myRating ?? null;
    const avg = ratingQuery.data?.avg;
    const count = ratingQuery.data?.count ?? 0;
    
    if (readOnly && count === 0 && myRating === null) return null;

    const displayRating = hovered ?? myRating ?? 0;

    return (
        <div className="flex flex-col items-end gap-0.5">
            {!(readOnly && myRating === null) && (
                <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => {
                        const isFilled = star <= displayRating;
                        const fillColor = readOnly ? (isFilled ? "#94a3b8" : "none") : (isFilled ? "#7c3aed" : "none");
                        const strokeColor = readOnly ? (isFilled ? "#94a3b8" : "#cbd5e1") : (isFilled ? "#7c3aed" : "#c4b5fd");

                        return (
                            <button
                                key={star}
                                onClick={() => !readOnly && rateMutation.mutate(star)}
                                onMouseEnter={() => !readOnly && setHovered(star)}
                                onMouseLeave={() => !readOnly && setHovered(null)}
                                disabled={readOnly || rateMutation.isPending}
                                className={`transition-transform ${!readOnly ? "hover:scale-125 active:scale-110" : ""} disabled:opacity-50`}
                                title={readOnly ? "과거의 별점은 수정할 수 없습니다" : (hasStudent ? `${star}점` : "학번을 설정해야 별점을 남길 수 있습니다")}
                                style={{ cursor: readOnly ? "default" : "pointer" }}
                            >
                                <Star
                                    className="w-5 h-5"
                                    fill={fillColor}
                                    stroke={strokeColor}
                                />
                            </button>
                        );
                    })}
                </div>
            )}
            {count > 0 && avg != null && (
                <span className={`text-[9px] leading-none ${readOnly ? "text-slate-400" : "text-violet-400"}`}>
                    ★ {avg.toFixed(1)} ({count}명)
                </span>
            )}
        </div>
    );
}

// ── 급식 건의 다이얼로그 ──────────────────────────────────────────
function MealSuggestionDialog({ onClose }: { onClose: () => void }) {
    const [message, setMessage] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, []);

    const submitMutation = useMutation({
        mutationFn: async () => {
            if (!message.trim()) throw new Error("건의 내용을 입력해주세요.");

            // school_timetable_config 쿠키에서 학번 직접 파싱
            let grade: number | null = null;
            let classNum: number | null = null;
            let studentNumber: number | null = null;
            try {
                const match = document.cookie.match(/(^|;\s*)school_timetable_config=([^;]+)/);
                if (match) {
                    const cfg = JSON.parse(decodeURIComponent(match[2]));
                    grade = cfg.grade ? parseInt(cfg.grade) : null;
                    classNum = cfg.classNum ? parseInt(cfg.classNum) : null;
                    studentNumber = cfg.studentNumber ? parseInt(cfg.studentNumber) : null;
                }
            } catch (_) {}

            const res = await fetch("/api/meal-suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grade, classNum, studentNumber, message: message.trim() }),
            });
            const data = await res.json() as any;
            if (!res.ok) throw new Error(data.error || "제출 실패");
            return data;
        },
        onSuccess: () => {
            toast.success("급식 건의가 제출되었습니다! 감사합니다 🍱");
            onClose();
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-violet-500 flex items-center justify-center">
                            <MessageSquarePlus className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">급식 건의</h2>
                            <p className="text-[10px] text-slate-400">메뉴 추가/변경 요청을 남겨주세요</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* 안내 */}
                <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 text-xs text-violet-700">
                    💡 건의사항은 학생회에 전달하겠습니다!
                </div>

                {/* 텍스트 입력 */}
                <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="예) 애미야 국이 짜다!"
                    className="w-full h-32 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all"
                    maxLength={500}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            if (message.trim()) submitMutation.mutate();
                        }
                    }}
                />
                <div className="flex items-center justify-between text-[10px] text-slate-300">
                    <span className="hidden md:block">Ctrl+Enter로 전송</span>
                    <span>{message.length}/500</span>
                </div>

                {/* 제출 버튼 */}
                <button
                    onClick={() => submitMutation.mutate()}
                    disabled={!message.trim() || submitMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-lg shadow-violet-200"
                >
                    {submitMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 제출 중...</>
                    ) : (
                        <><Send className="w-4 h-4" /> 건의 제출하기</>
                    )}
                </button>
            </div>
        </div>
    );
}

// ── 메인 페이지 ──────────────────────────────────────────────────
export default function MealPage() {
    // 주말(토=6, 일=0)에는 다음 주 급식표를 기본으로 표시 (Dashboard와 동일)
    const baseOffset = (() => { const d = new Date().getDay(); return (d === 0 || d === 6) ? 1 : 0; })();
    const [weekOffset, setWeekOffset] = useState(baseOffset);
    const [showSuggestion, setShowSuggestion] = useState(false);
    const todayDayRef = useRef<HTMLDivElement>(null);

    const today = new Date();
    const baseDate = new Date(today);
    baseDate.setDate(today.getDate() + weekOffset * 7);

    const { start, end } = getWeekRange(baseDate);

    const { data, isLoading, error } = useQuery({
        queryKey: ["meal", weekOffset],
        queryFn: async () => {
            const res = await fetch("/api/meal");
            if (!res.ok) throw new Error("식단 데이터를 불러오지 못했습니다.");
            return res.json() as Promise<{ meals: MealEntry[]; lastUpdated: string | null }>;
        },
        staleTime: 0,
        refetchOnWindowFocus: true,
    });

    // 급식 표시 설정 (공개 settings API)
    const { data: mealSettings } = useQuery({
        queryKey: ["meal-settings-public"],
        queryFn: async () => {
            const res = await fetch("/api/settings/public");
            if (!res.ok) return null;
            const s = await res.json() as any;
            return {
                cutoffHour: s.meal_lunch_cutoff_hour ?? 14,
                ratingEnabled: s.meal_rating_enabled !== false,
                emphasisEnabled: s.meal_emphasis_enabled !== false,
            };
        },
        staleTime: 60_000,
    });

    const cutoffHour = mealSettings?.cutoffHour ?? 14;
    const ratingEnabled = mealSettings?.ratingEnabled ?? true;
    const emphasisEnabled = mealSettings?.emphasisEnabled ?? true;
    // 현재 식사: 기준시간 이전=lunch, 이후=dinner
    const currentMeal = today.getHours() < cutoffHour ? "lunch" : "dinner";

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

    // 기본 표시 주차일 때만 오늘 카드로 자동 스크롤 (모바일 세로 레이아웃)
    // 주말에는 baseOffset=1(다음 주)이 기본이고, 다음 주엔 오늘 카드가 없으므로 스크롤 건너뜀
    useEffect(() => {
        if (weekOffset !== baseOffset || baseOffset !== 0) return;
        const timer = setTimeout(() => {
            const el = todayDayRef.current;
            if (!el) return;
            // sticky 헤더 높이를 동적으로 측정
            const header = document.querySelector("header");
            const headerH = header ? header.getBoundingClientRect().height : 80;
            const top = el.getBoundingClientRect().top + window.scrollY - headerH - 12; // 12px 여유
            window.scrollTo({ top, behavior: "instant" });
        }, 150);
        return () => clearTimeout(timer);
    }, [weekOffset]);

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
            <header className="bg-white sticky top-0 z-20 shadow-sm border-b border-slate-200">
                <div className="max-w-6xl mx-auto px-4 py-3">
                    {/* 첫 줄: 아이콘 + 제목 [+데스크탑: 토글] + 우측 건의 버튼 */}
                    <div className="flex items-center justify-between">
                        {/* 좌측: 아이콘 + 제목 + 데스크탑 토글 */}
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 shrink-0 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200">
                                <UtensilsCrossed className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-lg font-bold text-slate-900 leading-tight">학교 급식표</h1>
                                {lastUpdated && (
                                    <p className="text-[10px] text-slate-400">{lastUpdated}</p>
                                )}
                            </div>
                            {/* 시간표/급식표 토글 — 데스크탑: 제목 바로 오른쪽 */}
                            <div className="hidden md:flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5 ml-2">
                                <a
                                    href="/"
                                    className="px-4 py-1.5 rounded-full text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-white/60 transition-all whitespace-nowrap"
                                >
                                    📅 시간표
                                </a>
                                <div className="px-4 py-1.5 rounded-full bg-white text-sm font-semibold text-gray-800 shadow-sm whitespace-nowrap">
                                    🍱 급식표
                                </div>
                            </div>
                        </div>

                        {/* 우측: 급식 건의 버튼 (항상 글자 포함) */}
                        <button
                            onClick={() => setShowSuggestion(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500 hover:bg-violet-600 text-white text-sm font-bold transition-colors shadow-md shadow-violet-200 shrink-0 ml-3"
                        >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            급식 건의
                        </button>
                    </div>

                    {/* 둘째 줄: 시간표/급식표 토글 — 모바일만 */}
                    <div className="flex items-center gap-2 mt-2 md:hidden">
                        <div className="flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5">
                            <a
                                href="/"
                                className="px-3 py-1 rounded-full text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-white/60 transition-all whitespace-nowrap"
                            >
                                📅 시간표
                            </a>
                            <div className="px-3 py-1 rounded-full bg-white text-xs font-semibold text-gray-800 shadow-sm whitespace-nowrap">
                                🍱 급식표
                            </div>
                        </div>
                    </div>
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
                        <span className={`text-base font-bold ${weekOffset === 0 ? "text-red-500" : weekOffset > 0 ? "text-blue-500" : "text-slate-700"}`}>
                            {weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : weekOffset > 1 ? `${weekOffset}주 후` : `${Math.abs(weekOffset)}주 전`}
                        </span>
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
                        <button onClick={() => window.location.reload()} className="mt-4 text-slate-500 underline text-sm">다시 시도</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {weekDays.map((day) => {
                            const dateStr = formatDate(day);
                            const meal = mealMap[dateStr];
                            const isToday = dateStr === todayStr;
                            const weekday = day.getDay();

                            return (
                                <div
                                    key={dateStr}
                                    ref={isToday ? todayDayRef : undefined}
                                    className={`flex flex-col gap-3 scroll-mt-20 ${isToday ? "opacity-100" : "opacity-90"}`}
                                >
                                    {/* Date indicator */}
                                    <div className={`p-3 rounded-2xl flex items-center justify-between ${isToday ? "bg-orange-500 text-white shadow-md" : "bg-white border border-slate-200 text-slate-800"}`}>
                                        <span className="font-bold text-base">{WEEKDAY_KR[weekday]}</span>
                                        <span className="text-2xl font-black">{day.getDate()}</span>
                                    </div>

                                    {/* Lunch Box */}
                                    {(() => {
                                        const isLunchActive = isToday && emphasisEnabled && currentMeal === "lunch";
                                        const isDinnerActive = isToday && emphasisEnabled && currentMeal === "dinner";
                                        const isPast = dateStr < todayStr;
                                        const showRatingOnLunch = (isToday || isPast) && ratingEnabled;
                                        const showRatingOnDinner = (isToday || isPast) && ratingEnabled;
                                        return (<>
                                    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md ${isLunchActive ? "ring-2 ring-orange-500 ring-offset-2" : ""}`}>
                                        <div className="bg-amber-50 px-3 py-2 flex items-center justify-between border-b border-amber-100">
                                            <div className="flex items-center gap-1.5">
                                                <Sun className="w-3.5 h-3.5 text-amber-500" />
                                                <span className="text-sm font-bold text-amber-700">중식</span>
                                            </div>
                                            {showRatingOnLunch && <StarRating date={dateStr} type="lunch" readOnly={isPast} />}
                                        </div>
                                        <div className="p-3 pb-4">
                                            {meal?.lunch && meal.lunch.length > 0 ? (
                                                <ul className="space-y-1 md:space-y-2">
                                                    {meal.lunch.map((raw, i) => {
                                                        const { name, allergens } = parseMenuItem(raw);
                                                        return (
                                                            <li key={i} className={`flex items-baseline justify-between gap-2 ${i > 0 ? 'border-t border-slate-50 pt-1 md:pt-1.5' : ''}`}>
                                                                {i === 0 ? (
                                                                    <span className="font-extrabold text-slate-900 text-[15px] leading-snug flex-1">{name}</span>
                                                                ) : (
                                                                    <span className="text-sm text-slate-700 leading-snug flex-1">{name}</span>
                                                                )}
                                                                {allergens && (
                                                                    <span className="text-[11px] md:text-[10px] text-slate-500 shrink-0 leading-snug tabular-nums">{allergens}</span>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : (
                                                <p className="text-xs text-slate-300 py-4 text-center">식단 없음</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Dinner Box */}
                                    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all hover:shadow-md ${isDinnerActive ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`}>
                                        <div className="bg-indigo-50 px-3 py-2 flex items-center justify-between border-b border-indigo-100">
                                            <div className="flex items-center gap-1.5">
                                                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                                                <span className="text-sm font-bold text-indigo-700">석식</span>
                                            </div>
                                            {showRatingOnDinner && <StarRating date={dateStr} type="dinner" readOnly={isPast} />}
                                        </div>
                                        <div className="p-3 pb-4">
                                            {meal?.dinner && meal.dinner.length > 0 ? (
                                                <ul className="space-y-1 md:space-y-2">
                                                    {meal.dinner.map((raw, i) => {
                                                        const { name, allergens } = parseMenuItem(raw);
                                                        return (
                                                            <li key={i} className={`flex items-baseline justify-between gap-2 ${i > 0 ? 'border-t border-slate-50 pt-1 md:pt-1.5' : ''}`}>
                                                                {i === 0 ? (
                                                                    <span className="font-extrabold text-slate-900 text-[15px] leading-snug flex-1">{name}</span>
                                                                ) : (
                                                                    <span className="text-sm text-slate-700 leading-snug flex-1">{name}</span>
                                                                )}
                                                                {allergens && (
                                                                    <span className="text-[11px] md:text-[10px] text-slate-500 shrink-0 leading-snug tabular-nums">{allergens}</span>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : (
                                                <p className="text-xs text-slate-300 py-4 text-center">식단 없음</p>
                                            )}
                                        </div>
                                    </div>
                                        </>); })()} 
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 건의 다이얼로그 */}
            {showSuggestion && <MealSuggestionDialog onClose={() => setShowSuggestion(false)} />}
        </div>
    );
}
