import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/contexts/UserConfigContext";

export default function OnboardingDialog() {
    const { isConfigured, setConfig } = useUserConfig();
    const [studentId, setStudentId] = useState("");

    const isOpen = !isConfigured;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (studentId.length === 4) {
            const grade = studentId[0];
            const classNum = studentId[1];
            // 0으로 시작하는 번호 처리 (05 -> 5)
            const studentNumber = parseInt(studentId.substring(2)).toString();

            if (parseInt(grade) >= 1 && parseInt(grade) <= 3 && parseInt(classNum) >= 1) {
                setConfig({
                    schoolName: "부산성지고등학교",
                    grade,
                    classNum,
                    studentNumber
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
                            maxLength={4}
                            pattern="\d{4}"
                            placeholder="예시) 1102 (1학년 1반 02번)"
                            value={studentId}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const val = e.target.value.replace(/[^0-9]/g, "");
                                if (val.length <= 4) setStudentId(val);
                            }}
                            className={`text-center h-20 md:h-[84px] py-0 ${studentId.length === 0
                                ? "text-base md:text-lg font-normal tracking-normal indent-0"
                                : "text-5xl md:text-[68px] font-bold md:font-semibold tracking-[0.3em] md:tracking-[0.4em] indent-[0.3em] md:indent-[0.4em]"
                                }`}
                            required
                            autoFocus
                        />
                    </div>

                    <Button type="submit" className="w-full h-12 md:h-14 text-lg md:text-xl font-bold md:font-semibold" disabled={studentId.length !== 4}>
                        설정 저장
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
