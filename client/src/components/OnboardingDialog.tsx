import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { useLocation } from "wouter";

export default function OnboardingDialog() {
    const { isConfigured, setConfig, userRole } = useUserConfig();
    const [studentName, setStudentName] = useState("");
    const [studentId, setStudentId] = useState("");

    const [location] = useLocation();

    const isSystemAdmin = location.startsWith("/admin");
    const isTeacherPage = location.startsWith("/teacher");
    // userRole이 null(미선택)이거나 teacher이면 열지 않음 — RoleSelectDialog가 우선
    const isOpen = !isConfigured && !isSystemAdmin && !isTeacherPage && userRole === "student";


    const isNameValid = studentName.trim().length > 0;
    const isIdValid = studentId.length === 4;
    const canSubmit = isNameValid && isIdValid;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedName = studentName.trim();
        if (!trimmedName) {
            alert("이름을 입력해주세요.");
            return;
        }

        if (studentId.length === 4) {
            const grade = studentId[0];
            const classNum = studentId[1];
            // 0으로 시작하는 번호 처리 (05 → 5)
            const studentNumber = parseInt(studentId.substring(2)).toString();

            if (parseInt(grade) >= 1 && parseInt(grade) <= 3 && parseInt(classNum) >= 1) {
                // 서버의 현재 semester_key를 함께 저장
                let semesterKey = '1';
                try {
                    const res = await fetch('/api/settings/public');
                    if (res.ok) {
                        const s = await res.json();
                        semesterKey = s?.semester_key ?? '1';
                    }
                } catch { }

                setConfig({
                    schoolName: "부산성지고등학교",
                    grade,
                    classNum,
                    studentNumber,
                    studentName: trimmedName,
                    semesterKey,
                });
            } else {
                alert("올바른 학번 형식이 아닙니다. (예: 1102)");
            }
        }
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-[425px] md:max-w-xl md:min-h-[288px] flex flex-col justify-center" onInteractOutside={(e: any) => e.preventDefault()} showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>정보 입력</DialogTitle>
                    <DialogDescription>
                        성지고 수행 공유 사이트 이용을 위해<br />
                        이름과 4자리 학번을 입력하세요
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <label htmlFor="studentName" className="text-sm font-medium leading-none">
                            이름
                        </label>
                        <Input
                            id="studentName"
                            type="text"
                            placeholder="홍길동"
                            value={studentName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                setStudentName(e.target.value);
                            }}
                            className="h-14 md:h-16 text-2xl md:text-3xl font-bold text-center placeholder:text-base md:placeholder:text-lg placeholder:font-normal"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="studentId" className="text-sm font-medium leading-none">
                            학번 (4자리)
                        </label>
                        <Input
                            id="studentId"
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            pattern="\d{4}"
                            placeholder="예) 1102 (1학년 1반 02번)"
                            value={studentId}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const val = e.target.value.replace(/[^0-9]/g, "");
                                if (val.length <= 4) setStudentId(val);
                            }}
                            className={`text-center h-14 md:h-16 py-0 ${studentId.length === 0
                                ? "text-sm md:text-base font-normal tracking-normal indent-0 placeholder:text-sm md:placeholder:text-base"
                                : "text-3xl md:text-4xl font-bold tracking-[0.25em] md:tracking-[0.3em] indent-[0.25em] md:indent-[0.3em]"
                                }`}
                            required
                        />
                    </div>

                    <Button type="submit" className="w-full h-12 md:h-14 text-lg md:text-xl font-bold md:font-semibold" disabled={!canSubmit}>
                        설정 저장
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
