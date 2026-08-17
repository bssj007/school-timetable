import React, { useState, useEffect, useRef } from "react";
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

// ── 메인 컴포넌트 ────────────────────────────────────────────
type Step = "role" | "teacher-name";

interface RoleSelectDialogProps {
    onRoleSelected: (role: "student" | "teacher") => void;
}

export default function RoleSelectDialog({ onRoleSelected }: RoleSelectDialogProps) {
    const [location, setLocation] = useLocation();

    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<Step>("role");

    const [teacherName, setTeacherName] = useState("");
    const [teacherList, setTeacherList] = useState<string[]>([]);
    const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
    const [error, setError] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const skipPaths = ["/admin", "/admin/factory-reset", "/teacher"];
    const shouldSkip = skipPaths.some(p => location.startsWith(p));

    useEffect(() => {
        if (shouldSkip) return;
        const role = getRoleCookie();
        if (!role) {
            setIsOpen(true);
        }
    }, [shouldSkip]);

    const fetchTeacherList = async () => {
        setIsLoadingTeachers(true);
        try {
            const res = await fetch("/api/comcigan?type=teacher_timetable");
            if (res.ok) {
                const data = await res.json();
                const raw: string[] = data.teachers || [];
                const filtered = Array.from(new Set(raw.filter(t => t && t.trim() && t !== "(none)")));
                setTeacherList(filtered);
            }
        } catch {
            // 오프라인 fallback
        } finally {
            setIsLoadingTeachers(false);
        }
    };

    const handleSelectStudent = () => {
        setRoleCookie("student");
        setIsOpen(false);
        onRoleSelected("student");
    };

    const handleSelectTeacher = () => {
        setStep("teacher-name");
        fetchTeacherList();
        setTimeout(() => inputRef.current?.focus(), 80);
    };

    const handleTeacherSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = teacherName.trim();
        if (!trimmed) {
            setError("이름을 입력해주세요.");
            return;
        }

        setIsVerifying(true);
        setError("");

        if (teacherList.length > 0) {
            const matched = teacherList.find(t =>
                t === trimmed ||
                t.replace(/선생님$/, "").trim() === trimmed.replace(/선생님$/, "").trim() ||
                t.includes(trimmed) ||
                trimmed.includes(t)
            );

            if (!matched) {
                setError("교사 명단에 없는 이름입니다. 정확한 이름을 입력해주세요.");
                setIsVerifying(false);
                return;
            }

            setRoleCookie("teacher");
            setTeacherNameCookie(matched);
        } else {
            // 목록 없음 (오프라인) → 입력값 그대로 저장
            setRoleCookie("teacher");
            setTeacherNameCookie(trimmed);
        }

        setIsOpen(false);
        setIsVerifying(false);
        onRoleSelected("teacher");
        setLocation("/teacher");
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen}>
            <DialogContent
                className="sm:max-w-[420px]"
                onInteractOutside={(e: any) => e.preventDefault()}
                showCloseButton={false}
            >
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
                                <span className="text-4xl">🎒</span>
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
                                <span className="text-4xl">👩‍🏫</span>
                                <div>
                                    <div className="font-bold text-lg text-emerald-900 group-hover:text-emerald-700">교사로 접속</div>
                                    <div className="text-sm text-emerald-600 mt-0.5">수행평가 등록 및 관리</div>
                                </div>
                                <span className="ml-auto text-emerald-300 group-hover:text-emerald-500 text-xl">›</span>
                            </button>
                        </div>
                    </>
                )}

                {step === "teacher-name" && (
                    <>
                        <DialogHeader>
                            <button
                                onClick={() => { setStep("role"); setTeacherName(""); setError(""); }}
                                className="absolute left-4 top-4 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                            >
                                ← 뒤로
                            </button>
                            <DialogTitle className="text-xl font-bold text-center pt-2">교사 인증</DialogTitle>
                            <DialogDescription className="text-center">
                                교사 명단에 등록된 이름을 입력해주세요.
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={handleTeacherSubmit} className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <label htmlFor="teacher-name-input" className="text-sm font-medium">
                                    선생님 성함
                                </label>
                                <Input
                                    id="teacher-name-input"
                                    ref={inputRef}
                                    type="text"
                                    placeholder="예) 홍길동"
                                    value={teacherName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        setTeacherName(e.target.value);
                                        setError("");
                                    }}
                                    className="h-14 text-2xl font-semibold text-center"
                                    disabled={isVerifying}
                                    autoComplete="off"
                                />
                                {error && (
                                    <p className="text-sm text-red-500 text-center font-medium">{error}</p>
                                )}
                            </div>

                            <Button
                                id="teacher-auth-submit"
                                type="submit"
                                className="w-full h-12 text-lg font-bold bg-emerald-600 hover:bg-emerald-700"
                                disabled={!teacherName.trim() || isVerifying || isLoadingTeachers}
                            >
                                {isLoadingTeachers ? "명단 확인 중..." : isVerifying ? "인증 중..." : "교사 페이지로 이동"}
                            </Button>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
