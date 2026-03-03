import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { useLocation } from "wouter";

export default function OnboardingDialog() {
    const { isConfigured, setConfig } = useUserConfig();
    const [studentId, setStudentId] = useState("");

    const [location] = useLocation();

    const isSystemAdmin = location.startsWith("/admin");
    const isOpen = !isConfigured && !isSystemAdmin;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (studentId.length === 4 || studentId.length === 5) {
            const grade = studentId[0];
            // 4자리: 2102 -> 반은 1번째 자리(1), 학번은 2~3번째 자리(02)
            // 5자리: 21012 -> 반은 1~2번째 자리(10), 학번은 3~4번째 자리(12)
            const classNumStr = studentId.length === 4 ? studentId[1] : studentId.substring(1, 3);
            const studentNumStr = studentId.length === 4 ? studentId.substring(2) : studentId.substring(3);

            const classNum = parseInt(classNumStr).toString();
            const studentNumber = parseInt(studentNumStr).toString();

            if (parseInt(grade) >= 1 && parseInt(grade) <= 3 && parseInt(classNum) >= 1) {
                setConfig({
                    schoolName: "부산성지고등학교",
                    grade,
                    classNum,
                    studentNumber
                });
            } else {
                alert("올바른 학번 형식이 아닙니다. (예: 1102, 11002)");
            }
        }
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-[425px] md:max-w-xl md:min-h-[288px] flex flex-col justify-center" onInteractOutside={(e: any) => e.preventDefault()} showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>학번 입력</DialogTitle>
                    <DialogDescription>
                        성지고 수행 공유 사이트 이용을 위해<br />
                        4자리 학번을 입력하세요
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-6">
                    <div className="space-y-3">
                        <label htmlFor="studentId" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            학번 (4자리)
                        </label>
                        <Input
                            id="studentId"
                            type="text"
                            inputMode="numeric"
                            maxLength={5}
                            pattern="\d{4,5}"
                            placeholder="예시) 1102 또는 11002"
                            value={studentId}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const val = e.target.value.replace(/[^0-9]/g, "");
                                if (val.length <= 5) setStudentId(val);
                            }}
                            className={`text-center h-20 md:h-[84px] py-0 ${studentId.length === 0
                                ? "text-base md:text-lg font-normal tracking-normal indent-0"
                                : "text-5xl md:text-[68px] font-bold md:font-semibold tracking-[0.3em] md:tracking-[0.4em] indent-[0.3em] md:indent-[0.4em]"
                                }`}
                            required
                            autoFocus
                        />
                    </div>

                    <Button type="submit" className="w-full h-12 md:h-14 text-lg md:text-xl font-bold md:font-semibold" disabled={studentId.length !== 4 && studentId.length !== 5}>
                        설정 저장
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
