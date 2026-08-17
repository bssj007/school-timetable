import React, { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

// ── 쿠키 유틸 ──────────────────────────────────────────────
export const ROLE_COOKIE = "sj_user_role";
export const TEACHER_COOKIE = "sj_teacher_name";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10년

export function getRoleCookie(): string | null {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(new RegExp("(^| )" + ROLE_COOKIE + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
}

export function getTeacherNameCookie(): string | null {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(new RegExp("(^| )" + TEACHER_COOKIE + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
}

function setRoleCookie(role: "student" | "teacher") {
    document.cookie = `${ROLE_COOKIE}=${role}; max-age=${COOKIE_MAX_AGE}; path=/`;
}

function setTeacherNameCookie(name: string) {
    document.cookie = `${TEACHER_COOKIE}=${encodeURIComponent(name)}; max-age=${COOKIE_MAX_AGE}; path=/`;
}

// ── 교사 옵션 타입 ───────────────────────────────────────────
interface TeacherOption {
    idx: number;
    rawName: string;     // comcigan 원본 이름 (보통 2글자)
    displayName: string; // 풀네임 (가능하면)
    subjects: string[];
    label: string;       // 드롭다운에 표시할 최종 텍스트
}

// ── timetable 데이터에서 교사별 담당 과목 추출 ──────────────
function buildTeacherOptions(
    teachers: string[],
    subjects: string[],
    timetable: any[],
    ignoreKeywords: string[] = ['빈교', '공강', '학년', '채', '창']
): TeacherOption[] {
    // 교사 인덱스 → 담당 과목 Set
    const subjectsMap = new Map<number, Set<string>>();
    timetable.forEach((schedule: any, tId: number) => {
        if (!schedule) return;
        const subjectSet = new Set<string>();
        for (let d = 1; d <= 5; d++) {
            const daySchedule = schedule[d];
            if (!daySchedule) continue;
            for (let p = 1; p < daySchedule.length; p++) {
                const val = daySchedule[p];
                if (!val) continue;
                const numVal = typeof val === 'number' ? val : parseInt(String(val).replace(/>/g, ''), 10);
                if (!numVal || isNaN(numVal) || numVal === 0) continue;
                const subjectId = Math.floor(numVal / 1000);
                const subjectName = subjects[subjectId];
                if (subjectName) subjectSet.add(subjectName);
            }
        }
        subjectsMap.set(tId, subjectSet);
    });

    const options: TeacherOption[] = [];
    teachers.forEach((name, idx) => {
        if (idx === 0) return; // 첫 항목 '*' 스킵
        if (!name || !name.trim() || name === "(none)") return;
        if (ignoreKeywords.some(kw => name.includes(kw))) return;

        const subjectArr = Array.from(subjectsMap.get(idx) || []);

        options.push({
            idx,
            rawName: name,
            displayName: name, // 풀네임 매핑 없이 원본 그대로 (comcigan 데이터)
            subjects: subjectArr,
            label: name,
        });
    });

    // 동명이인 처리: 같은 이름이 여러 개면 과목 병기
    const nameCounts = new Map<string, number>();
    options.forEach(o => nameCounts.set(o.rawName, (nameCounts.get(o.rawName) || 0) + 1));
    options.forEach(o => {
        const count = nameCounts.get(o.rawName) || 0;
        if (count > 1 && o.subjects.length > 0) {
            o.label = `${o.rawName} (${o.subjects.join(', ')})`;
        }
    });

    return options;
}

// ── 메인 컴포넌트 ────────────────────────────────────────────
type Step = "role" | "teacher-name";

interface RoleSelectDialogProps {
    onRoleSelected: (role: "student" | "teacher") => void;
}

export default function RoleSelectDialog({ onRoleSelected }: RoleSelectDialogProps) {
    const [location, setLocation] = useLocation();

    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<Step>("role");

    // 교사 인증 상태
    const [query, setQuery] = useState("");              // 입력 쿼리
    const [selectedOption, setSelectedOption] = useState<TeacherOption | null>(null); // 클릭 선택
    const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
    const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // 건너뛸 경로
    const skipPaths = ["/admin", "/admin/factory-reset", "/teacher"];
    const shouldSkip = skipPaths.some(p => location.startsWith(p));

    useEffect(() => {
        if (shouldSkip) return;
        const role = getRoleCookie();
        if (!role) setIsOpen(true);
    }, [shouldSkip]);

    // 교사 목록 + 과목 데이터 fetch
    const fetchTeacherOptions = async () => {
        setIsLoadingTeachers(true);
        try {
            const res = await fetch("/api/comcigan?type=teacher_timetable");
            if (res.ok) {
                const data = await res.json();
                const opts = buildTeacherOptions(
                    data.teachers || [],
                    data.subjects || [],
                    data.timetable || [],
                );
                setTeacherOptions(opts);
            }
        } catch {
            // 오프라인 fallback: 빈 목록
        } finally {
            setIsLoadingTeachers(false);
        }
    };

    // 입력 쿼리 기반 필터링 (입력 없으면 빈 배열 — 표시 안 함)
    const filteredOptions = useMemo(() => {
        const q = query.trim();
        if (!q) return [];
        const lower = q.toLowerCase();
        return teacherOptions.filter(o =>
            o.rawName.toLowerCase().includes(lower) ||
            o.displayName.toLowerCase().includes(lower) ||
            o.subjects.some(s => s.toLowerCase().includes(lower))
        );
    }, [teacherOptions, query]);

    const handleSelectStudent = () => {
        setRoleCookie("student");
        setIsOpen(false);
        onRoleSelected("student");
    };

    const handleSelectTeacher = () => {
        setStep("teacher-name");
        fetchTeacherOptions();
        setTimeout(() => inputRef.current?.focus(), 80);
    };

    // 후보 항목 클릭 → 선택 확정
    const handlePickOption = (opt: TeacherOption) => {
        setSelectedOption(opt);
        setQuery(opt.rawName);
        setError("");
    };

    // 최종 확인 버튼
    const handleConfirm = () => {
        if (!selectedOption) {
            setError("목록에서 선생님을 선택해주세요.");
            return;
        }
        setRoleCookie("teacher");
        setTeacherNameCookie(selectedOption.rawName);
        setIsOpen(false);
        onRoleSelected("teacher");
        setLocation("/teacher");
    };

    const handleBack = () => {
        setStep("role");
        setQuery("");
        setSelectedOption(null);
        setError("");
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen}>
            <DialogContent
                className="sm:max-w-[440px]"
                onInteractOutside={(e: any) => e.preventDefault()}
                onOpenAutoFocus={(e: any) => e.preventDefault()}
                showCloseButton={false}
            >
                {/* ── Step 1: 역할 선택 ── */}
                {step === "role" && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-center">접속 유형 선택</DialogTitle>
                            <DialogDescription className="text-center pt-1">
                                성지고 수행 공유 사이트에 오신 것을 환영합니다.
                                <br />
                                어떤 방식으로 접속하시겠어요?
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3 pt-4">
                            <button
                                id="role-select-student"
                                onClick={handleSelectStudent}
                                className="group relative flex items-center gap-4 p-5 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left cursor-pointer"
                            >
                                <img src="/role-student.png" alt="학생" className="w-12 h-12 object-contain flex-shrink-0" />
                                <div>
                                    <div className="font-bold text-lg text-blue-900 group-hover:text-blue-700">학생으로 접속</div>
                                    <div className="text-sm text-blue-600 mt-0.5">수행평가 일정 확인 및 조회</div>
                                </div>
                                <span className="ml-auto text-blue-300 group-hover:text-blue-500 text-xl">›</span>
                            </button>

                            <button
                                id="role-select-teacher"
                                onClick={handleSelectTeacher}
                                className="group relative flex items-center gap-4 p-5 rounded-2xl border-2 border-emerald-100 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100 transition-all duration-200 text-left cursor-pointer"
                            >
                                <img src="/role-teacher.png" alt="교사" className="w-12 h-12 object-contain flex-shrink-0" />
                                <div>
                                    <div className="font-bold text-lg text-emerald-900 group-hover:text-emerald-700">교사로 접속</div>
                                    <div className="text-sm text-emerald-600 mt-0.5">수행평가 등록 및 관리</div>
                                </div>
                                <span className="ml-auto text-emerald-300 group-hover:text-emerald-500 text-xl">›</span>
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 2: 교사 이름 검색 + 선택 ── */}
                {step === "teacher-name" && (
                    <>
                        <DialogHeader>
                            <button
                                onClick={handleBack}
                                className="absolute left-4 top-4 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                            >
                                ← 뒤로
                            </button>
                            <DialogTitle className="text-xl font-bold text-center pt-2">교사 인증</DialogTitle>
                            <DialogDescription className="text-center text-sm">
                                성함을 입력하면 후보 목록이 표시됩니다.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3 pt-1">
                            {/* 검색 입력창 */}
                            <div className="space-y-1.5">
                                <label htmlFor="teacher-name-input" className="text-sm font-medium">
                                    선생님 성함 검색
                                    {isLoadingTeachers && (
                                        <span className="ml-2 text-xs text-gray-400 font-normal">명단 로딩 중...</span>
                                    )}
                                </label>
                                <Input
                                    id="teacher-name-input"
                                    ref={inputRef}
                                    type="text"
                                    placeholder="이름 또는 담당 과목 입력"
                                    value={query}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        setQuery(e.target.value);
                                        setSelectedOption(null); // 입력 변경 시 선택 초기화
                                        setError("");
                                    }}
                                    className="h-12 text-lg font-semibold"
                                    autoComplete="off"
                                />
                            </div>

                            {/* 매칭 후보 목록 — 입력이 있을 때만 표시 */}
                            {query.trim() && (
                                <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                    {filteredOptions.length === 0 ? (
                                        <div className="px-4 py-3 text-sm text-gray-400 text-center">
                                            {isLoadingTeachers ? "명단 로딩 중..." : "일치하는 선생님이 없습니다."}
                                        </div>
                                    ) : (
                                        <ul className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                                            {filteredOptions.map(opt => {
                                                const isSelected = selectedOption?.idx === opt.idx;
                                                return (
                                                    <li key={opt.idx}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePickOption(opt)}
                                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                                                                isSelected
                                                                    ? "bg-emerald-50 border-l-4 border-emerald-500"
                                                                    : "hover:bg-gray-50 border-l-4 border-transparent"
                                                            }`}
                                                        >
                                                            {/* 체크 표시 */}
                                                            <span className={`text-lg flex-shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}>
                                                                ✓
                                                            </span>
                                                            <div className="min-w-0">
                                                                <div className={`font-semibold text-sm ${isSelected ? "text-emerald-800" : "text-gray-800"}`}>
                                                                    {opt.rawName}
                                                                    {opt.rawName !== opt.displayName && (
                                                                        <span className="ml-1 text-gray-500 font-normal">({opt.displayName})</span>
                                                                    )}
                                                                </div>
                                                                {opt.subjects.length > 0 && (
                                                                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                                                                        {opt.subjects.slice(0, 5).join(' · ')}
                                                                        {opt.subjects.length > 5 && " ···"}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {/* 에러 메시지 */}
                            {error && (
                                <p className="text-sm text-red-500 text-center font-medium">{error}</p>
                            )}

                            {/* 확인 버튼 */}
                            <Button
                                id="teacher-auth-submit"
                                type="button"
                                onClick={handleConfirm}
                                className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40"
                                disabled={!selectedOption}
                            >
                                {selectedOption
                                    ? `${selectedOption.rawName} 선생님으로 접속`
                                    : "목록에서 선생님을 선택하세요"}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
