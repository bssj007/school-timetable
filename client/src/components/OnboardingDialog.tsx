import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/contexts/UserConfigContext";

export default function OnboardingDialog() {
    const { isConfigured, setConfig } = useUserConfig();
    const [grade, setGrade] = useState("");
    const [classNum, setClassNum] = useState("");
    const [studentNumber, setStudentNumber] = useState("");

    const classInputRef = useRef<HTMLInputElement>(null);
    const numberInputRef = useRef<HTMLInputElement>(null);

    const isOpen = !isConfigured;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (grade && classNum && studentNumber) {
            // Validate ranges
            const g = parseInt(grade);
            const c = parseInt(classNum);
            const n = parseInt(studentNumber);

            if (g >= 1 && g <= 3 && c >= 1 && n >= 1) {
                setConfig({
                    schoolName: "부산성지고등학교",
                    grade,
                    classNum,
                    studentNumber: n.toString() // Normalize (e.g., "05" -> "5")
                });
            } else {
                alert("올바른 학년, 반, 번호를 입력해주세요.");
            }
        }
    };

    const handleGradeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^1-3]/g, ""); // Only 1-3 allowed
        if (val.length <= 1) {
            setGrade(val);
            // Clear subsequent fields
            if (val !== grade) {
                setConfig({ studentNumber: "" }); // Reset config if grade changes? No, just local state for now
                setClassNum("");
                setStudentNumber("");
            }
            // Auto-focus next
            if (val.length === 1) {
                classInputRef.current?.focus();
            }
        }
    };

    const handleClassChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, "");
        if (val.length <= 2) {
            setClassNum(val);
            // Clear subsequent field
            if (val !== classNum) {
                setStudentNumber("");
            }
            if (val.length === 2) {
                numberInputRef.current?.focus();
            }
        }
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, "");
        if (val.length <= 2) {
            setStudentNumber(val);
        }
    };

    const isComplete = grade.length === 1 && classNum.length >= 1 && studentNumber.length >= 1;

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-[425px] md:max-w-xl md:min-h-[320px] flex flex-col justify-center" onInteractOutside={(e: any) => e.preventDefault()} showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>학번 입력</DialogTitle>
                    <DialogDescription>
                        부산성지고등학교 시간표를 확인하기 위해 학번을 입력해주세요.<br />
                        학년, 반, 번호를 각각 입력해주세요.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-6">
                    <div className="flex gap-4 justify-center">
                        {/* Grade */}
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium leading-none text-center block">
                                학년
                            </label>
                            <Input
                                value={grade}
                                onChange={handleGradeChange}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                placeholder="입력"
                                className="font-bold text-center text-xl h-14"
                                autoFocus
                            />
                        </div>

                        {/* Class */}
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium leading-none text-center block">
                                반
                            </label>
                            <Input
                                ref={classInputRef}
                                value={classNum}
                                onChange={handleClassChange}
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                placeholder="입력"
                                className="font-bold text-center text-xl h-14"
                            />
                        </div>

                        {/* Number */}
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium leading-none text-center block">
                                번호
                            </label>
                            <Input
                                ref={numberInputRef}
                                value={studentNumber}
                                onChange={handleNumberChange}
                                type="text"
                                inputMode="numeric"
                                maxLength={2}
                                placeholder="입력"
                                className="font-bold text-center text-xl h-14"
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full h-12 text-lg" disabled={!isComplete}>
                        설정 저장
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
