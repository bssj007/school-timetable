import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { UtensilsCrossed, ChevronLeft, ChevronRight, Sun, Moon, MessageSquarePlus, X, Send, Loader2 } from "lucide-react";
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

            // 학번 정보 (로컬스토리지에서 시도)
            let grade: number | null = null;
            let classNum: number | null = null;
            let studentNumber: number | null = null;
            try {
                const cookieMatch = document.cookie.match(/clientId=([^;]+)/);
                if (cookieMatch) {
                    const res = await fetch("/api/profile");
                    if (res.ok) {
                        const profile = await res.json() as any;
                        grade = profile?.grade ?? null;
                        classNum = profile?.classNum ?? null;
                        studentNumber = profile?.studentNumber ?? null;
                    }
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
                    💡 건의사항은 학생회에 전달하겠습니다!{" "}
                    <span className="text-[10px] text-violet-400 line-through">(너무 부담갖지 마시고)</span>
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
                    <span>Ctrl+Enter로 전송</span>
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
    const [weekOffset, setWeekOffset] = useState(0);
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

    // 이번 주 보기일 때 오늘 카드로 자동 스크롤 (모바일 세로 레이아웃)
    useEffect(() => {
        if (weekOffset !== 0) return;
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
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold transition-colors shadow-md shadow-violet-200 shrink-0 ml-3"
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

            {/* 건의 다이얼로그 */}
            {showSuggestion && <MealSuggestionDialog onClose={() => setShowSuggestion(false)} />}
        </div>
    );
}
