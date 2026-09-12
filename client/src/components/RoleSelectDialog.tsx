import React, { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useUserConfig } from "@/contexts/UserConfigContext";

// 교사 유틸 함수는 @/lib/teacherUtils 에서 직접 import 하세요.
// (RoleSelectDialog에서 re-export하면 순환 의존성으로 인한 TDZ 오류가 발생합니다)
import { getActiveTeacherName, getAuthenticatedTeacher, getTeacherNameCookie, setRoleCookie, setTeacherNameCookie, normalizeTeacherName, getRoleCookie } from "@/lib/teacherUtils";
import { detect } from "@/lib/browserDetect";
import { setPumasiCookie } from "@/lib/pumasiCookie";

// ── 교사 옵션 타입 ───────────────────────────────────────────
interface TeacherOption {
    idx: number;
    rawName: string;
    displayName: string;
    subjects: string[];
    label: string;
}

function GooglePlayConsoleLogo({ className = "w-6 h-6" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.6 2.4C3.3 2.7 3.1 3.2 3.1 3.8V20.2C3.1 20.8 3.3 21.3 3.6 21.6L3.7 21.7L13.1 12.3V11.7L3.7 2.3L3.6 2.4Z" fill="url(#gpc-blue1)" />
            <path d="M16.2 15.4L13.1 12.3V11.7L16.2 8.6L16.3 8.7L20 10.8C21.1 11.4 21.1 12.6 20 13.2L16.3 15.3L16.2 15.4Z" fill="url(#gpc-blue2)" />
            <path d="M16.3 15.3L13.1 12L3.6 21.6C4 22 4.7 22.1 5.5 21.6L16.3 15.3Z" fill="url(#gpc-blue3)" />
            <path d="M16.3 8.7L5.5 2.4C4.7 1.9 4 2 3.6 2.4L13.1 12L16.3 8.7Z" fill="url(#gpc-blue4)" />
            <defs>
                <linearGradient id="gpc-blue1" x1="12.3" y1="3.1" x2="1.8" y2="13.6" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00E5FF" />
                    <stop offset="1" stopColor="#0091EA" />
                </linearGradient>
                <linearGradient id="gpc-blue2" x1="21.3" y1="12" x2="3.1" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#40C4FF" />
                    <stop offset="1" stopColor="#00B0FF" />
                </linearGradient>
                <linearGradient id="gpc-blue3" x1="14.8" y1="13.7" x2="0.6" y2="27.9" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#0D47A1" />
                    <stop offset="1" stopColor="#1565C0" />
                </linearGradient>
                <linearGradient id="gpc-blue4" x1="2.2" y1="-2.3" x2="14.1" y2="9.6" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00B0FF" />
                    <stop offset="1" stopColor="#00E5FF" />
                </linearGradient>
            </defs>
        </svg>
    );
}

// ── timetable 데이터에서 교사별 담당 과목 추출 ──────────────
function buildTeacherOptions(
    teachers: string[],
    subjects: string[],
    timetable: any[],
    ignoreKeywords: string[] = ['빈교', '공강', '학년', '채', '창']
): TeacherOption[] {
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
        if (idx === 0) return;
        if (!name || !name.trim() || name === "(none)") return;
        if (ignoreKeywords.some(kw => name.includes(kw))) return;
        const subjectArr = Array.from(subjectsMap.get(idx) || []);
        options.push({ idx, rawName: name, displayName: name, subjects: subjectArr, label: name });
    });

    // 동명이인: 과목 병기
    const nameCounts = new Map<string, number>();
    options.forEach(o => nameCounts.set(o.rawName, (nameCounts.get(o.rawName) || 0) + 1));
    options.forEach(o => {
        if ((nameCounts.get(o.rawName) || 0) > 1 && o.subjects.length > 0) {
            o.label = `${o.rawName} (${o.subjects.join(', ')})`;
        }
    });

    return options;
}

// ── * 와일드카드 매칭 ──────────────────────────────────────
// rawName에 '*'가 있는 경우 (예: 홍*동) 정규식으로 변환해 쿼리와 대조
function matchesTeacher(rawName: string, subjects: string[], query: string): boolean {
    const raw = rawName.toLowerCase();
    const q = query.toLowerCase();

    // 1. 직접 포함 (기본)
    if (raw.includes(q)) return true;

    // 2. 과목 매칭
    if (subjects.some(s => s.toLowerCase().includes(q))) return true;

    // 3. rawName에 '*'가 있으면 → 쿼리가 패턴에 매칭되는지 확인
    //    예: rawName='홍*동', query='홍길동' → /홍.+동/.test('홍길동') = true
    if (raw.includes('*')) {
        const parts = raw.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = parts.join('.+'); // '*' 자리에 1자 이상 허용
        try {
            const regex = new RegExp(pattern);
            if (regex.test(q)) return true;
        } catch { }
    }

    return false;
}

// ── 메인 컴포넌트 ────────────────────────────────────────────
type Step = "role" | "student-info" | "teacher-name";

interface RoleSelectDialogProps {
    onRoleSelected: (role: "student" | "teacher") => void;
    onBetaSelected?: () => void;
}

export default function RoleSelectDialog({ onRoleSelected, onBetaSelected }: RoleSelectDialogProps) {
    const [location, setLocation] = useLocation();
    const {
        setConfig,
        grade: savedGrade,
        classNum: savedClassNum,
        studentNumber: savedStudentNum,
        studentName: savedName,
        userRole,
        isRoleSelectOpen,
        roleSelectStep,
        openRoleSelect,
        closeRoleSelect,
    } = useUserConfig();

    const [step, setStep] = useState<Step>("role");

    // ── 학생 정보 ──
    const [studentName, setStudentName] = useState("");
    const [studentId, setStudentId] = useState("");
    const [studentError, setStudentError] = useState("");
    const studentNameRef = useRef<HTMLInputElement>(null);

    // ── 교사 검색 ──
    const [query, setQuery] = useState("");
    const [selectedOption, setSelectedOption] = useState<TeacherOption | null>(null);
    const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
    const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
    const [teacherError, setTeacherError] = useState("");
    const teacherInputRef = useRef<HTMLInputElement>(null);

    // ── 베타테스터 (Android 품앗이) & 개발자 계정 ──
    const [betaEnabled, setBetaEnabled] = useState(false);
    const [devAccountEnabled, setDevAccountEnabled] = useState(false);
    const [isAndroidNative, setIsAndroidNative] = useState(false);

    useEffect(() => {
        try {
            const a = detect();
            const isNative = Boolean(a.isAndroid && a.isInstalledApp && a.installedAppType === 'webview');
            setIsAndroidNative(isNative);
        } catch { }

        fetch('/api/settings/public')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.is_force_beta_tester) {
                    setPumasiCookie();
                    closeRoleSelect();
                    onBetaSelected?.();
                    return;
                }
                if (data?.beta_testing_enabled) {
                    setBetaEnabled(true);
                }
                if (data?.dev_account_enabled) {
                    setDevAccountEnabled(true);
                }
            })
            .catch(() => { });
    }, []);

    const skipPaths = ["/admin", "/admin/factory-reset", "/teacher"];
    const shouldSkip = skipPaths.some(p => location.startsWith(p));

    useEffect(() => {
        if (shouldSkip) return;
        if (!getRoleCookie() || !userRole) {
            openRoleSelect("role");
        }
    }, [shouldSkip, userRole, location]);

    useEffect(() => {
        if (roleSelectStep) {
            setStep(roleSelectStep);
            if (roleSelectStep === "teacher-name") {
                fetchTeacherOptions();
            }
        }
    }, [roleSelectStep]);

    // 교사 목록 fetch
    const fetchTeacherOptions = async () => {
        setIsLoadingTeachers(true);
        try {
            const res = await fetch("/api/comcigan?type=teacher_timetable");
            if (res.ok) {
                const data = await res.json();
                const opts = buildTeacherOptions(data.teachers || [], data.subjects || [], data.timetable || []);
                setTeacherOptions(opts);
                const activeTeacher = getActiveTeacherName();
                if (activeTeacher) {
                    const match = opts.find(o => normalizeTeacherName(o.rawName) === activeTeacher);
                    if (match) setSelectedOption(match);
                }
            }
        } catch { /* 오프라인 fallback */ }
        finally { setIsLoadingTeachers(false); }
    };

    // 입력 기반 필터링 (입력 없으면 빈 배열)
    const filteredOptions = useMemo(() => {
        const q = query.trim();
        if (!q) return [];

        const normalMatches = teacherOptions.filter(o => matchesTeacher(o.rawName, o.subjects, q));

        // 개발자 계정 ("김교사"): 정확히 "김교사" 또는 "김교사 선생님" 검색 시에만 노출
        if (devAccountEnabled && (q === "김교사" || q === "김교사 선생님")) {
            const devOption: TeacherOption = {
                idx: 9999,
                rawName: "김교사",
                displayName: "김교사",
                subjects: [],
                label: "김교사 선생님",
            };
            return [devOption, ...normalMatches.filter(o => o.rawName !== "김교사")];
        }

        return normalMatches.filter(o => o.rawName !== "김교사");
    }, [teacherOptions, query, devAccountEnabled]);

    // ── 핸들러 ──

    const handleBack = () => {
        if (step === "teacher-name" && userRole === "student") {
            closeRoleSelect();
            return;
        }
        setStep("role");
        setStudentName(""); setStudentId(""); setStudentError("");
        setQuery(""); setSelectedOption(null); setTeacherError("");
    };

    const handleSelectStudent = () => {
        // 이미 저장된 학생 프로필이 있다면 번거로운 재입력 없이 즉시 학생 역할로 진입
        if (savedName && savedGrade && savedClassNum && savedStudentNum) {
            setRoleCookie("student");
            closeRoleSelect();
            onRoleSelected("student");
            return;
        }
        if (!studentName && savedName) {
            setStudentName(savedName);
        }
        if (!studentId && savedGrade && savedClassNum && savedStudentNum) {
            const padded = savedStudentNum.padStart(2, "0");
            setStudentId(`${savedGrade}${savedClassNum}${padded}`);
        }
        setStep("student-info");
    };

    const handleSelectTeacher = () => {
        // 1순위: 로그인 된 교사가 있다면 그 교사명으로 자동 접속 (최근 선택 교사 무시)
        // 2순위: 로그인 된 교사가 없다면 가장 최근 선택했던 교사로 자동 접속
        const activeTeacher = getActiveTeacherName();
        if (activeTeacher) {
            setRoleCookie("teacher");
            setTeacherNameCookie(activeTeacher);
            closeRoleSelect();
            onRoleSelected("teacher");
            setLocation("/teacher");
            return;
        }
        setStep("teacher-name");
        fetchTeacherOptions();
    };

    const handleSelectBetaTester = () => {
        setPumasiCookie();
        closeRoleSelect();
        if (onBetaSelected) {
            onBetaSelected();
        }
    };

    // 학생 정보 제출 → 쿠키 + setConfig 저장
    const handleStudentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = studentName.trim();
        if (!trimmedName) { setStudentError("이름을 입력해주세요."); return; }
        if (studentId.length !== 4) { setStudentError("4자리 학번을 입력해주세요."); return; }

        const grade = studentId[0];
        const classNum = studentId[1];
        const studentNumber = parseInt(studentId.substring(2)).toString();

        const isDevStudent = (studentId === "9999" && trimmedName === "김학생");
        if (!isDevStudent && !(parseInt(grade) >= 1 && parseInt(grade) <= 3 && parseInt(classNum) >= 1)) {
            setStudentError("올바른 학번 형식이 아닙니다. (예: 1102)");
            return;
        }

        // 서버 학기 키 조회
        let semesterKey = '1';
        try {
            const res = await fetch('/api/settings/public');
            if (res.ok) { const s = await res.json(); semesterKey = s?.semester_key ?? '1'; }
        } catch { }

        // 쿠키 + 컨텍스트 저장
        setRoleCookie("student");
        setConfig({ schoolName: "부산성지고등학교", grade, classNum, studentNumber, studentName: trimmedName, semesterKey });

        closeRoleSelect();
        onRoleSelected("student");
    };

    // 교사 확인 버튼
    const handleTeacherConfirm = () => {
        if (!selectedOption) { setTeacherError("목록에서 선생님을 선택해주세요."); return; }
        setRoleCookie("teacher");
        setTeacherNameCookie(selectedOption.rawName);
        closeRoleSelect();
        onRoleSelected("teacher");
        setLocation("/teacher");
    };

    if (!isRoleSelectOpen) return null;

    // ── 학번 입력 유효성 ──
    const isNameValid = studentName.trim().length > 0;
    const isIdValid = studentId.length === 4;
    const canSubmitStudent = isNameValid && isIdValid;

    return (
        <Dialog open={isRoleSelectOpen} onOpenChange={(open) => { if (!open && userRole) closeRoleSelect(); }}>
            <DialogContent
                className="sm:max-w-[440px]"
                onInteractOutside={(e: any) => {
                    if (!userRole) e.preventDefault();
                    else closeRoleSelect();
                }}
                onOpenAutoFocus={(e: any) => e.preventDefault()}
                showCloseButton={!!userRole}
            >
                {/* ── Step 1: 역할 선택 ── */}
                {step === "role" && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-center">접속 유형 선택</DialogTitle>
                            <DialogDescription className="sr-only">
                                접속 유형 선택
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3 pt-3">
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

                            {/* Android Native 앱 + 관리자 베타테스팅 활성화 시 오픈채팅 품앗이 버튼 노출 */}
                            {betaEnabled && isAndroidNative && (
                                <button
                                    id="role-select-beta-tester"
                                    type="button"
                                    onClick={handleSelectBetaTester}
                                    className="group relative flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-300 bg-slate-100 hover:border-slate-400 hover:bg-slate-200/80 transition-all duration-200 text-left cursor-pointer shadow-sm"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center flex-shrink-0">
                                        <GooglePlayConsoleLogo className="w-6 h-6" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-base text-slate-800 flex items-center gap-1.5 flex-wrap">
                                            <span>Android 품앗이</span>
                                            <span className="text-xs font-semibold text-slate-500">(오픈채팅 베타테스터용)</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            비공개 테스트 14일 참여 확인
                                        </div>
                                    </div>
                                    <span className="ml-auto text-slate-400 group-hover:text-slate-600 text-xl">›</span>
                                </button>
                            )}
                        </div>
                    </>
                )}

                {/* ── Step 2: 학생 정보 입력 ── */}
                {step === "student-info" && (
                    <>
                        <DialogHeader>
                            <button
                                onClick={handleBack}
                                className="absolute left-4 top-4 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                            >
                                ← 뒤로
                            </button>
                            <DialogTitle className="text-xl font-bold text-center pt-2">정보 입력</DialogTitle>
                            <DialogDescription className="text-center">
                                이름과 4자리 학번을 입력하세요
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={handleStudentSubmit} className="space-y-4 pt-2">
                            {/* 이름 */}
                            <div className="space-y-2">
                                <label htmlFor="student-name-input" className="text-sm font-medium leading-none">이름</label>
                                <Input
                                    id="student-name-input"
                                    ref={studentNameRef}
                                    type="text"
                                    placeholder="홍길동"
                                    value={studentName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        setStudentName(e.target.value);
                                        setStudentError("");
                                    }}
                                    className="h-14 md:h-16 text-2xl md:text-3xl font-bold text-center placeholder:text-base md:placeholder:text-lg placeholder:font-normal"
                                    autoComplete="off"
                                />
                            </div>

                            {/* 학번 */}
                            <div className="space-y-2">
                                <label htmlFor="student-id-input" className="text-sm font-medium leading-none">학번 (4자리)</label>
                                <Input
                                    id="student-id-input"
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={4}
                                    pattern="\d{4}"
                                    placeholder="예) 1102 (1학년 1반 02번)"
                                    value={studentId}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        const val = e.target.value.replace(/[^0-9]/g, "");
                                        if (val.length <= 4) { setStudentId(val); setStudentError(""); }
                                    }}
                                    className={`text-center h-14 md:h-16 py-0 ${studentId.length === 0
                                            ? "text-sm md:text-base font-normal tracking-normal indent-0 placeholder:text-sm md:placeholder:text-base"
                                            : "text-3xl md:text-4xl font-bold tracking-[0.25em] md:tracking-[0.3em] indent-[0.25em] md:indent-[0.3em]"
                                        }`}
                                    autoComplete="off"
                                />
                            </div>

                            {studentError && (
                                <p className="text-sm text-red-500 text-center font-medium">{studentError}</p>
                            )}

                            <Button
                                id="student-info-submit"
                                type="submit"
                                className="w-full h-12 md:h-14 text-lg font-bold"
                                disabled={!canSubmitStudent}
                            >
                                설정 저장
                            </Button>
                        </form>
                    </>
                )}

                {/* ── Step 3: 교사 이름 검색 + 선택 ── */}
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
                            <div className="space-y-1.5">
                                <label htmlFor="teacher-name-input" className="text-sm font-medium">
                                    선생님 성함 검색
                                    {isLoadingTeachers && (
                                        <span className="ml-2 text-xs text-gray-400 font-normal">명단 로딩 중...</span>
                                    )}
                                </label>
                                <Input
                                    id="teacher-name-input"
                                    ref={teacherInputRef}
                                    type="text"
                                    placeholder="이름 또는 담당 과목 입력"
                                    value={query}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        setQuery(e.target.value);
                                        setSelectedOption(null);
                                        setTeacherError("");
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
                                                            onClick={() => { setSelectedOption(opt); setTeacherError(""); }}
                                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected
                                                                    ? "bg-emerald-50 border-l-4 border-emerald-500"
                                                                    : "hover:bg-gray-50 border-l-4 border-transparent"
                                                                }`}
                                                        >
                                                            <span className={`text-emerald-600 flex-shrink-0 transition-opacity text-lg font-bold ${isSelected ? "opacity-100" : "opacity-0"}`}>✓</span>
                                                            <div className="min-w-0">
                                                                <div className={`font-semibold text-sm ${isSelected ? "text-emerald-800" : "text-gray-800"}`}>
                                                                    {opt.rawName}
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

                            {teacherError && (
                                <p className="text-sm text-red-500 text-center font-medium">{teacherError}</p>
                            )}

                            <Button
                                id="teacher-auth-submit"
                                type="button"
                                onClick={handleTeacherConfirm}
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
