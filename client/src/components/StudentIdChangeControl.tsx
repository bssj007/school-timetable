import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/contexts/UserConfigContext";

interface StudentIdChangeControlProps {
    className?: string; // For layout adjustments
    inputClassName?: string; // For input styling
}

export default function StudentIdChangeControl({ className, inputClassName }: StudentIdChangeControlProps) {
    const { grade, classNum, studentNumber, setConfig, schoolName } = useUserConfig();

    // Local state for inputs to allow typing before saving
    // Initialize with current config values
    const [localGrade, setLocalGrade] = useState(grade);
    const [localClass, setLocalClass] = useState(classNum);
    const [localNumber, setLocalNumber] = useState(studentNumber);

    const classInputRef = useRef<HTMLInputElement>(null);
    const numberInputRef = useRef<HTMLInputElement>(null);

    // Sync local state with context if context changes externally (e.g. revert)
    // But we need to be careful not to overwrite typing.
    // We'll rely on the user typing to update local state, and auto-save updates config.
    // If config updates from "Revert", we should update local state.
    useEffect(() => {
        setLocalGrade(grade);
        setLocalClass(classNum);
        setLocalNumber(studentNumber);
    }, [grade, classNum, studentNumber]);

    const handleGradeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^1-3]/g, "");
        if (val.length <= 1) {
            setLocalGrade(val);
            if (val !== localGrade) {
                setLocalClass("");
                setLocalNumber("");
            }
            if (val.length === 1) {
                classInputRef.current?.focus();
            }
        }
    };

    const handleClassChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, "");
        if (val.length <= 2) {
            setLocalClass(val);
            if (val !== localClass) {
                setLocalNumber("");
            }
            if (val.length === 2) {
                numberInputRef.current?.focus();
            }
        }
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, "");
        if (val.length <= 2) {
            setLocalNumber(val);
        }
    };

    // Auto-save logic
    useEffect(() => {
        // Check valid and different from current config
        if (localGrade && localClass && localNumber) {
            const g = parseInt(localGrade);
            const c = parseInt(localClass);
            const n = parseInt(localNumber);

            if (g >= 1 && g <= 3 && c >= 1 && n >= 1) {
                // Check if actually changed to avoid loop
                if (localGrade !== grade || localClass !== classNum || localNumber !== studentNumber) {
                    const timer = setTimeout(() => {
                        setConfig({
                            schoolName: schoolName || "부산성지고등학교",
                            grade: localGrade,
                            classNum: localClass,
                            studentNumber: n.toString()
                        });
                    }, 500);
                    return () => clearTimeout(timer);
                }
            }
        }
    }, [localGrade, localClass, localNumber, grade, classNum, studentNumber, setConfig, schoolName]);

    // Color coding based on grade (local state for immediate feedback)
    const gradeColors: Record<string, string> = {
        "1": "#a6ff00",
        "2": "#00ffcc",
        "3": "#fa32f0",
    };
    const currentGradeColor = localGrade ? gradeColors[localGrade] : undefined;
    const borderStyle = currentGradeColor ? { borderColor: currentGradeColor, borderWidth: '2px' } : {};

    return (
        <div className={`flex items-center gap-1 ${className}`}>
            <Input
                value={localGrade}
                onChange={handleGradeChange}
                placeholder="학년"
                className={`text-center px-1 ${inputClassName}`}
                style={borderStyle}
                maxLength={1}
                inputMode="numeric"
            />
            <Input
                ref={classInputRef}
                value={localClass}
                onChange={handleClassChange}
                placeholder="반"
                className={`text-center px-1 ${inputClassName}`}
                style={borderStyle}
                maxLength={2}
                inputMode="numeric"
            />
            <Input
                ref={numberInputRef}
                value={localNumber}
                onChange={handleNumberChange}
                placeholder="번호"
                className={`text-center px-1 ${inputClassName}`}
                style={borderStyle}
                maxLength={2}
                inputMode="numeric"
            />
        </div>
    );
}
