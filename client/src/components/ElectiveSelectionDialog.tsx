import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ElectiveConfig {
    id: number;
    grade: number;
    classCode: string; // A, B, C...
    subject: string;
    originalTeacher: string;
    fullTeacherName?: string;
    isMovingClass?: number; // 0 or 1
}

interface ElectiveSelectionDialogProps {
    isOpen: boolean;
    grade: string;
    classNum: string;
    studentNumber: string;
    onSaveSuccess: () => void;
    onBack?: () => void; // Optional back button
}

export default function ElectiveSelectionDialog({
    isOpen,
    grade,
    classNum,
    studentNumber,
    onSaveSuccess,
    onBack
}: ElectiveSelectionDialogProps) {
    const queryClient = useQueryClient();
    const [selections, setSelections] = useState<Record<string, { subject: string, teacher: string }>>({});

    // 1. Fetch available electives
    const { data: electiveConfigs, isLoading: configLoading } = useQuery({
        queryKey: ['electives', grade],
        queryFn: async () => {
            const res = await fetch(`/api/electives?grade=${grade}`); // Base URL handled by Vite proxy or relative
            if (!res.ok) throw new Error("Failed to fetch electives");
            return res.json() as Promise<ElectiveConfig[]>;
        },
        enabled: isOpen && !!grade
    });

    // Group by ClassCode (A, B, C...)
    // Also ensure unique subjects per group for display, but keep track of teacher for auto-assignment.
    // Map: ClassCode -> SubjectName -> TeacherName (Assuming unique teacher per subject per group as per plan)
    const electivesByGroup = React.useMemo(() => {
        if (!electiveConfigs) return {};
        const groups: Record<string, ElectiveConfig[]> = {};

        electiveConfigs.forEach(config => {
            // Filter out non-moving classes (isMovingClass === 0)
            // Default to 1 if undefined (legacy or optional)
            const isMoving = config.isMovingClass !== 0;

            if (isMoving && config.classCode) {
                if (!groups[config.classCode]) groups[config.classCode] = [];
                groups[config.classCode].push(config);
            }
        });

        // Sort groups A, B, C...
        return Object.keys(groups).sort().reduce((obj, key) => {
            obj[key] = groups[key];
            return obj;
        }, {} as Record<string, ElectiveConfig[]>);
    }, [electiveConfigs]);

    // 2. Fetch existing student profile (if any) to pre-fill? 
    // Actually, usually this dialog shows if NO profile exists. 
    // But if they are editing (re-entering ID?), we might want to pre-fill.
    // Let's implement pre-fill just in case.
    useEffect(() => {
        if (isOpen && grade && classNum && studentNumber) {
            // Skip for now, assume fresh selection or handled by parent.
            // User request: "입력한 정보는 각 학번별 프로필에 영구 저장된다" imply persistent.
        }
    }, [isOpen, grade, classNum, studentNumber]);

    const handleSelection = (group: string, subjectName: string) => {
        // 1. Find the config for this subject in this group to get the teacher
        const config = electivesByGroup[group]?.find(c => c.subject === subjectName);
        if (!config) return;

        // 2. Check if this subject is already selected in ANOTHER group
        // If so, remove it from that other group (Move logic)
        const newSelections = { ...selections };

        Object.keys(newSelections).forEach(g => {
            if (g !== group && newSelections[g].subject === subjectName) {
                delete newSelections[g]; // Remove from old group
            }
        });

        // 3. Set new selection
        newSelections[group] = {
            subject: subjectName,
            teacher: config.fullTeacherName || config.originalTeacher
        };

        setSelections(newSelections);
    };

    const saveMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/electives', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grade: parseInt(grade),
                    classNum: parseInt(classNum),
                    studentNumber: parseInt(studentNumber),
                    electives: selections
                })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to save selection");
            }
            return res.json();
        },
        onSuccess: () => {
            toast.success("선택과목이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ['studentProfile'] }); // Invalidate if we have such query
            onSaveSuccess();
        },
        onError: (err) => {
            toast.error(`저장 실패: ${err.message}`);
        }
    });

    const isAllSelected = Object.keys(electivesByGroup).every(group => selections[group]);

    return (
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-[500px] md:max-w-2xl md:min-h-[600px] md:max-h-[90vh] flex flex-col [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>선택과목 선택 - <span className="text-red-500">{grade}{classNum}{studentNumber.padStart(2, '0')}</span></DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4 flex-1 overflow-y-auto min-h-0">
                    {configLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : (
                        Object.entries(electivesByGroup).map(([group, configs]: [string, ElectiveConfig[]]) => {
                            const selectedSubject = selections[group]?.subject;

                            // Filter available subjects for this group
                            // Logic: Show all subjects available in this group.
                            // However, we need to handle "Already selected in other group" logic display.

                            return (
                                <div key={group} className="grid grid-cols-4 items-center gap-4">
                                    <label className="text-right text-sm font-bold text-gray-700">
                                        {group} 그룹
                                    </label>
                                    <div className="col-span-3">
                                        <Select
                                            value={selectedSubject || ""}
                                            onValueChange={(val: string) => handleSelection(group, val)}
                                        >
                                            <SelectTrigger className={selectedSubject ? "border-blue-500 bg-blue-50 text-blue-700 font-bold" : ""}>
                                                <SelectValue placeholder="과목 선택" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {/* 1. Normal Subjects (Not selected anywhere) */}
                                                {configs.map((config: ElectiveConfig) => {
                                                    // Check if selected in OTHER group
                                                    const selectedInGroup = Object.keys(selections).find(g => selections[g].subject === config.subject && g !== group);

                                                    if (selectedInGroup) return null; // Handle in Red Section

                                                    // Should be unique subject names in this list. 
                                                    // If configs has duplicates (same subject, diff teacher/classCode?), we might duplicate options. 
                                                    // Ideally configs are unique per (group, subject).
                                                    return (
                                                        <SelectItem key={config.id} value={config.subject}>
                                                            {config.subject}
                                                            {/* <span className="text-xs text-gray-400 ml-2">({config.fullTeacherName || config.originalTeacher})</span> */}
                                                            {/* User requested: "한 과목에 여러 선생님이 있을때도 하나의 과목으로 표시" -> Just Subject Name */}
                                                        </SelectItem>
                                                    );
                                                })}

                                                {/* 2. Red Section: Subjects selected in OTHER groups */}
                                                {configs.map((config: ElectiveConfig) => {
                                                    const otherGroup = Object.keys(selections).find(g => selections[g].subject === config.subject && g !== group);

                                                    if (!otherGroup) return null;

                                                    return (
                                                        <SelectItem
                                                            key={config.id}
                                                            value={config.subject}
                                                            className="text-red-500 font-bold border-t border-red-100 bg-red-50 focus:bg-red-100"
                                                        >
                                                            (선택됨) {config.subject} [{otherGroup}그룹]
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                        {selectedSubject && selections[group]?.teacher && (
                                            <div className="text-xs text-blue-600 mt-1 pl-1">
                                                담당: {selections[group].teacher}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="flex justify-between gap-3 mt-4">
                    {onBack ? (
                        <Button variant="outline" onClick={onBack}>
                            뒤로가기
                        </Button>
                    ) : (
                        <div /> // Spacer
                    )}
                    <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={!isAllSelected || saveMutation.isPending}
                        className={isAllSelected ? "bg-blue-600 hover:bg-blue-700" : ""}
                    >
                        {saveMutation.isPending ? "저장 중..." : "저장하고 시작하기"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
