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
                const codes = config.classCode.split(',').map((c: string) => c.trim()).filter(Boolean);
                codes.forEach((code: string) => {
                    if (!groups[code]) groups[code] = [];
                    groups[code].push(config);
                });
            }
        });

        // Sort groups A, B, C...
        return Object.keys(groups).sort().reduce((obj, key) => {
            obj[key] = groups[key];
            return obj;
        }, {} as Record<string, ElectiveConfig[]>);
    }, [electiveConfigs]);

    // 2. Fetch existing student profile to pre-fill
    const { data: existingProfile, isLoading: profileLoading } = useQuery({
        queryKey: ['studentProfile', grade, classNum, studentNumber],
        queryFn: async () => {
            const res = await fetch(`/api/electives?type=student&grade=${grade}&classNum=${classNum}&studentNumber=${studentNumber}`);
            if (!res.ok) throw new Error("Failed to fetch student profile");
            return res.json();
        },
        enabled: isOpen && !!grade && !!classNum && !!studentNumber
    });

    const initializedRef = React.useRef(false);

    useEffect(() => {
        if (isOpen) {
            if (existingProfile !== undefined && !initializedRef.current) {
                if (existingProfile && existingProfile.electives) {
                    try {
                        const parsedElectives = typeof existingProfile.electives === 'string'
                            ? JSON.parse(existingProfile.electives)
                            : existingProfile.electives;
                        setSelections(parsedElectives);
                    } catch (e) {
                        console.error("Failed to parse existing electives", e);
                        setSelections({});
                    }
                } else {
                    setSelections({});
                }
                initializedRef.current = true;
            }
        } else {
            setSelections({});
            initializedRef.current = false;
        }
    }, [existingProfile, isOpen]);

    const handleSelection = (group: string, subjectName: string) => {
        // 1. Find the configs for this subject in this group to get ALL teachers
        const configs = electivesByGroup[group]?.filter(c => c.subject === subjectName);
        if (!configs || configs.length === 0) return;

        // Extract all teachers, removing duplicates, and join them
        const teachersSet = new Set(configs.map(c => c.fullTeacherName || c.originalTeacher).filter(Boolean));
        const combinedTeacherNames = Array.from(teachersSet).join(", ");

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
            teacher: combinedTeacherNames
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

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!confirm("저장된 선택과목 정보를 모두 초기화하시겠습니까? (이 작업은 되돌릴 수 없습니다.)")) return false;
            const res = await fetch(`/api/electives?grade=${grade}&classNum=${classNum}&studentNumber=${studentNumber}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to reset selection");
            }
            return res.json();
        },
        onSuccess: (data) => {
            if (data) {
                toast.success("선택과목이 초기화되었습니다.");
                setSelections({});
                queryClient.invalidateQueries({ queryKey: ['studentProfile'] });
            }
        },
        onError: (err) => {
            toast.error(`초기화 실패: ${err.message}`);
        }
    });

    const isAllSelected = Object.keys(electivesByGroup).every(group => selections[group]);

    return (
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-[500px] md:max-w-3xl md:min-h-[700px] md:max-h-[90vh] flex flex-col [&>button]:hidden px-4 md:px-12 py-6" onPointerDownOutside={(e: any) => e.preventDefault()} onEscapeKeyDown={(e: any) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="md:text-2xl mb-2">선택과목 선택 - <span className="text-red-500">{grade}{classNum}{studentNumber.padStart(2, '0')}</span></DialogTitle>
                </DialogHeader>

                <div className="py-4 md:py-8 space-y-4 md:space-y-8 flex-1 overflow-y-auto min-h-0">
                    {(configLoading || profileLoading) ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : (
                        Object.entries(electivesByGroup).map(([group, configs]: [string, ElectiveConfig[]]) => {
                            const selectedSubject = selections[group]?.subject;

                            // Filter available subjects for this group
                            // Logic: Show all subjects available in this group.
                            // However, we need to handle "Already selected in other group" logic display.

                            return (
                                <div key={group} className="grid grid-cols-4 items-center gap-4 md:gap-8">
                                    <label className="text-right text-sm md:text-lg font-bold text-gray-700">
                                        {group} 그룹
                                    </label>
                                    <div className="col-span-3 flex flex-col md:flex-row items-start md:items-center">
                                        <Select
                                            value={selectedSubject || ""}
                                            onValueChange={(val: string) => handleSelection(group, val)}
                                        >
                                            <SelectTrigger className={`w-[160px] md:w-[220px] md:h-11 md:text-base ${selectedSubject ? "border-blue-500 bg-blue-50 text-blue-700 font-bold" : ""}`}>
                                                <SelectValue placeholder="과목 선택" />
                                            </SelectTrigger>
                                            <SelectContent align="start" style={{ width: "var(--radix-select-trigger-width)", maxWidth: "var(--radix-select-trigger-width)" }}>
                                                {/* 1. Normal Subjects (Not selected anywhere) */}
                                                {Array.from(new Map(configs.map(item => [item.subject, item])).values()).map((config: ElectiveConfig) => {
                                                    // Check if selected in OTHER group
                                                    const selectedInGroup = Object.keys(selections).find(g => selections[g].subject === config.subject && g !== group);

                                                    if (selectedInGroup) return null; // Handle in Red Section

                                                    // Should be unique subject names in this list. 
                                                    // If configs has duplicates (same subject, diff teacher/classCode?), we might duplicate options. 
                                                    // Ideally configs are unique per (group, subject).
                                                    return (
                                                        <SelectItem key={config.id} value={config.subject}>
                                                            <div className="flex items-center gap-2 truncate block max-w-full">
                                                                <span className="truncate">{config.subject}</span>
                                                                {config.fullSubjectName && (
                                                                    <span className="text-xs text-gray-500 truncate shrink-0">({config.fullSubjectName})</span>
                                                                )}
                                                            </div>
                                                        </SelectItem>
                                                    );
                                                })}

                                                {/* 2. Red Section -> Yellow Section: Subjects selected in OTHER groups */}
                                                {Array.from(new Map(configs.map(item => [item.subject, item])).values()).map((config: ElectiveConfig) => {
                                                    const otherGroup = Object.keys(selections).find(g => selections[g].subject === config.subject && g !== group);

                                                    if (!otherGroup) return null;

                                                    return (
                                                        <SelectItem
                                                            key={config.id}
                                                            value={config.subject}
                                                            className="text-black font-bold line-through border-t border-yellow-200 bg-yellow-100 focus:bg-yellow-200"
                                                        >
                                                            <div className="flex items-center gap-1 truncate block max-w-full">
                                                                <span className="shrink-0 whitespace-nowrap">(선택됨)</span>
                                                                <span className="truncate">{config.subject}</span>
                                                                {config.fullSubjectName && (
                                                                    <span className="text-xs text-gray-600 truncate shrink-0">({config.fullSubjectName})</span>
                                                                )}
                                                                <span className="text-xs text-gray-500 font-normal shrink-0 whitespace-nowrap">[{otherGroup}그룹]</span>
                                                            </div>
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                        {selectedSubject && selections[group]?.teacher && (
                                            <div className="text-xs md:text-sm text-blue-600 mt-1 md:mt-0 pl-1 md:pl-0 md:ml-4 shrink-0">
                                                담당: {selections[group].teacher}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="flex justify-between gap-3 mt-4 md:mt-8">
                    <div className="flex gap-2">
                        {onBack && (
                            <Button variant="outline" onClick={onBack} className="md:h-12 md:px-6 md:text-base">
                                뒤로가기
                            </Button>
                        )}
                        <Button
                            variant="destructive"
                            onClick={() => deleteMutation.mutate()}
                            disabled={deleteMutation.isPending}
                            className="md:h-12 md:px-4 md:text-base w-fit"
                        >
                            리셋
                        </Button>
                    </div>
                    <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={!isAllSelected || saveMutation.isPending}
                        className={`md:h-12 md:px-8 md:text-base ${isAllSelected ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                    >
                        {saveMutation.isPending ? "저장 중..." : "저장하고 시작하기"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
