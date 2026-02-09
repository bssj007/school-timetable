import { useState } from "react";
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
            <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()} showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>학번 입력</DialogTitle>
                    <DialogDescription>
                        부산성지고등학교 시간표를 확인하기 위해 학번을 입력해주세요.<br />
                        4자리 숫자로 입력해주세요.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
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
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, "");
                                if (val.length <= 4) setStudentId(val);
                            }}
                            className="font-bold text-center text-lg tracking-widest placeholder:font-normal placeholder:tracking-normal placeholder:text-sm"
                            required
                            autoFocus
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={studentId.length !== 4}>
                        설정 저장
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
