import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Check, X, AlertTriangle, RotateCcw, Search, ChevronDown } from "lucide-react";

// =====================================================================
// Types
// =====================================================================

interface ElectiveConfig {
    id: number;
    grade: number;
    classCode: string; // A, B, C...
    subject: string;
    fullSubjectName?: string;
    originalTeacher: string;
    fullTeacherName?: string;
    isMovingClass?: number; // 0 or 1
    className?: string;
}

interface ElectiveSelectionDialogProps {
    isOpen: boolean;
    grade: string;
    classNum: string;
    studentNumber: string;
    datasetId?: string;
    forceManualMode?: boolean;
    onSaveSuccess: () => void;
    onBack?: () => void;
}

// =====================================================================
// Backtracking CSP Solver — finds ALL valid group assignments.
// Returns:
type SelectionResult = Record<string, { subject: string; teacher: string }>;
//
//   { result: SelectionResult, solutionCount: 1 }  → unique, auto-assign OK
//   { result: null, solutionCount: 0 }              → conflict (no solution)
//   { result: null, solutionCount: N }              → ambiguous (>1 solutions)
// =====================================================================

const MAX_SOLUTIONS_TO_COLLECT = 100; // Collect up to 100, stop early after that

type SolverOutcome = {
    result: SelectionResult | null;
    solutionCount: number;
    allSolutions: SelectionResult[]; // Up to MAX_SOLUTIONS_TO_COLLECT
};

function solveAssignment(
    selectedSubjects: string[],
    groups: Record<string, ElectiveConfig[]>,
    electiveConfigs: ElectiveConfig[]
): SolverOutcome {
    // Build a map: subject -> which groups it appears in
    const subjectGroups: Record<string, string[]> = {};
    for (const subject of selectedSubjects) {
        subjectGroups[subject] = [];
        for (const [code, configs] of Object.entries(groups)) {
            if (configs.some(c => c.subject === subject)) {
                subjectGroups[subject].push(code);
            }
        }
    }

    const getTeacher = (subject: string, group: string): string => {
        const configs = (groups[group] || []).filter(c => c.subject === subject);
        const teachers = new Set(configs.map(c => c.fullTeacherName || c.originalTeacher).filter(Boolean));
        return Array.from(teachers).join(", ");
    };

    const buildResult = (assignment: Record<string, string>): SelectionResult => {
        const out: SelectionResult = {};
        for (const [group, subject] of Object.entries(assignment)) {
            out[group] = { subject, teacher: getTeacher(subject, group) };
        }
        return out;
    };

    const allSolutions: SelectionResult[] = [];
    const current: Record<string, string> = {};

    function backtrack(idx: number): void {
        if (allSolutions.length >= MAX_SOLUTIONS_TO_COLLECT) return; // Stop collecting
        if (idx === selectedSubjects.length) {
            allSolutions.push(buildResult({ ...current }));
            return;
        }
        const subject = selectedSubjects[idx];
        for (const group of (subjectGroups[subject] || [])) {
            if (!current[group]) {
                current[group] = subject;
                backtrack(idx + 1);
                delete current[group];
                if (allSolutions.length >= MAX_SOLUTIONS_TO_COLLECT) return;
            }
        }
    }

    backtrack(0);

    const solutionCount = allSolutions.length;
    if (solutionCount === 1) {
        return { result: allSolutions[0], solutionCount: 1, allSolutions };
    }
    return { result: null, solutionCount, allSolutions };
}


// =====================================================================
// Non-elective (mandatory non-moving) subject keywords to exclude
// =====================================================================
const EXCLUDED_KEYWORDS = ["창체", "채플", "공강", "빈교실", "자습", "홈룸", "담임", "HR"];

function isMandatoryExcluded(subject: string): boolean {
    return EXCLUDED_KEYWORDS.some(k => subject.includes(k));
}

// =====================================================================
// Main Component
// =====================================================================

export default function ElectiveSelectionDialog({
    isOpen,
    grade,
    classNum,
    studentNumber,
    datasetId,
    forceManualMode = false,
    onSaveSuccess,
    onBack
}: ElectiveSelectionDialogProps) {
    const queryClient = useQueryClient();

    // UI mode: "smart" = subject-name picker, "manual" = group dropdown fallback
    // Default: grade 2 → smart (auto), grade 3 → manual
    const defaultMode = forceManualMode || grade === "3" ? "manual" : "smart";
    const [mode, setMode] = useState<"smart" | "manual">(defaultMode);

    // Smart mode: list of selected subject strings
    const [smartSelected, setSmartSelected] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Manual mode (fallback): group -> selection
    const [manualSelections, setManualSelections] = useState<SelectionResult>({});
    // Smart ambiguous mode: a solution the user clicked to pick (pending confirmation)
    const [selectedSolution, setSelectedSolution] = useState<SelectionResult | null>(null);

    // ── Data Fetching ──────────────────────────────────────────────────

    const { data: electiveConfigs, isLoading: configLoading } = useQuery({
        queryKey: ['electives', grade, datasetId],
        queryFn: async () => {
            if (!datasetId) return [];
            const res = await fetch(`/api/electives?grade=${grade}&dataset=${datasetId}`);
            if (!res.ok) throw new Error("Failed to fetch electives");
            return res.json() as Promise<ElectiveConfig[]>;
        },
        enabled: isOpen && !!grade && !!datasetId
    });

    const { data: existingProfile, isLoading: profileLoading } = useQuery({
        queryKey: ['studentProfile', grade, classNum, studentNumber, datasetId],
        queryFn: async () => {
            if (!datasetId) return null;
            const res = await fetch(`/api/electives?type=student&grade=${grade}&classNum=${classNum}&studentNumber=${studentNumber}&dataset=${datasetId}`);
            if (!res.ok) throw new Error("Failed to fetch student profile");
            const data = await res.json();
            if (data?.electives && typeof data.electives === 'string') {
                try { data.electives = JSON.parse(data.electives); } catch { }
            }
            return data;
        },
        enabled: isOpen && !!grade && !!classNum && !!studentNumber && !!datasetId
    });

    // ── Derived Data ───────────────────────────────────────────────────

    // Moving-class groups (A/B/C...)
    const electivesByGroup = useMemo<Record<string, ElectiveConfig[]>>(() => {
        if (!electiveConfigs) return {};
        const groups: Record<string, ElectiveConfig[]> = {};
        electiveConfigs.forEach(config => {
            if (config.isMovingClass === 0) return; // Skip non-moving
            if (isMandatoryExcluded(config.subject)) return; // Explicitly ensure excluded subjects never appear in choices
            if (!config.classCode) return;
            const codes = config.classCode.split(',').map((c: string) => c.trim()).filter(Boolean);
            codes.forEach((code: string) => {
                if (!groups[code]) groups[code] = [];
                groups[code].push(config);
            });
        });
        return Object.keys(groups).sort().reduce((obj, key) => {
            obj[key] = groups[key];
            return obj;
        }, {} as Record<string, ElectiveConfig[]>);
    }, [electiveConfigs]);

    // Non-moving mandatory subjects (filtered)
    const mandatorySubjects = useMemo<string[]>(() => {
        if (!electiveConfigs) return [];
        return Array.from(new Set(
            electiveConfigs
                .filter(c => c.isMovingClass === 0 && !isMandatoryExcluded(c.subject))
                .map(c => c.subject)
        )).sort();
    }, [electiveConfigs]);

    // All unique selectable subject names across all moving groups
    const availableSubjects = useMemo<string[]>(() => {
        const set = new Set<string>();
        Object.values(electivesByGroup).forEach(configs => {
            configs.forEach(c => set.add(c.subject));
        });
        return Array.from(set).sort();
    }, [electivesByGroup]);

    const filteredSubjects = useMemo(() => {
        if (!searchQuery.trim()) return availableSubjects;
        const q = searchQuery.toLowerCase();
        return availableSubjects.filter(s => s.toLowerCase().includes(q));
    }, [availableSubjects, searchQuery]);

    const groupCount = Object.keys(electivesByGroup).length;

    // ── Solver ─────────────────────────────────────────────────────────

    const solverOutcome = useMemo<ReturnType<typeof solveAssignment> | null>(() => {
        if (smartSelected.length !== groupCount || groupCount === 0) return null;
        return solveAssignment(smartSelected, electivesByGroup, electiveConfigs || []);
    }, [smartSelected, electivesByGroup, groupCount, electiveConfigs]);

    const smartAssigned = solverOutcome?.result ?? null;
    // 0 solutions = conflict (no valid assignment), >1 solutions = ambiguous
    const hasConflict = smartSelected.length === groupCount && solverOutcome !== null && solverOutcome.result === null;
    const isAmbiguous = hasConflict && (solverOutcome?.solutionCount ?? 0) > 1;

    // ── Initialization ─────────────────────────────────────────────────

    const initializedRef = React.useRef(false);

    useEffect(() => {
        if (isOpen) {
            if (existingProfile !== undefined && !initializedRef.current) {
                if (existingProfile?.electives && typeof existingProfile.electives === 'object') {
                    const existing = existingProfile.electives as SelectionResult;
                    // Restore smart mode selections from saved data
                    const subjects = Object.values(existing).map((v: any) => v.subject).filter(Boolean);
                    setSmartSelected(subjects);
                    setManualSelections(existing);
                } else {
                    setSmartSelected([]);
                    setManualSelections({});
                }
                initializedRef.current = true;
            }
        } else {
            setSmartSelected([]);
            setManualSelections({});
            setSelectedSolution(null);
            setSearchQuery("");
            setMode(defaultMode);
            initializedRef.current = false;
        }
    }, [existingProfile, isOpen]);

    // ── Handlers ───────────────────────────────────────────────────────

    const toggleSubject = (subject: string) => {
        setSmartSelected(prev => {
            if (prev.includes(subject)) {
                return prev.filter(s => s !== subject);
            } else if (prev.length < groupCount) {
                return [...prev, subject];
            } else {
                // Replace most recently added (last)
                return [...prev.slice(0, -1), subject];
            }
        });
    };

    const handleManualSelection = (group: string, subjectName: string) => {
        const configs = (electivesByGroup[group] || []).filter(c => c.subject === subjectName);
        if (!configs.length) return;
        const teachers = new Set(configs.map(c => c.fullTeacherName || c.originalTeacher).filter(Boolean));
        const combinedTeacher = Array.from(teachers).join(", ");
        const newSel = { ...manualSelections };
        // Remove from other groups
        Object.keys(newSel).forEach(g => {
            if (g !== group && newSel[g].subject === subjectName) {
                delete newSel[g];
            }
        });
        newSel[group] = { subject: subjectName, teacher: combinedTeacher };
        setManualSelections(newSel);
    };

    // ── Save ───────────────────────────────────────────────────────────

    const saveMutation = useMutation({
        mutationFn: async (overrideElectives?: SelectionResult) => {
            // Priority: explicit override > selectedSolution (ambiguous pick) > smart/manual
            const toSave = overrideElectives
                ?? selectedSolution
                ?? (mode === "smart" ? smartAssigned : manualSelections);

            // 저장할 데이터가 없으면 차단 (null/빈 객체 방어)
            if (!toSave || typeof toSave !== 'object' || Object.keys(toSave).length === 0) {
                throw new Error("저장할 선택과목 데이터가 없습니다.");
            }

            const res = await fetch('/api/electives', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grade: parseInt(grade),
                    classNum: parseInt(classNum),
                    studentNumber: parseInt(studentNumber),
                    dataset: datasetId || '',
                    electives: toSave,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to save");
            }
            return res.json();
        },
        onSuccess: () => {
            toast.success("선택과목이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ['studentProfile'] });
            onSaveSuccess();
        },
        onError: (err: Error) => toast.error(`저장 실패: ${err.message}`),
    });

    const canSaveSmart = (smartSelected.length === groupCount && smartAssigned !== null) || selectedSolution !== null;
    const canSaveManual = Object.keys(electivesByGroup).length > 0 && Object.keys(electivesByGroup).every(g => manualSelections[g]);

    // ── Render ─────────────────────────────────────────────────────────

    // datasetId가 없으면 시간표 로딩 전이므로 로딩 중으로 처리
    // (쿼리가 disabled 상태라 isLoading=false지만, 실제로는 데이터 준비 안 된 상태)
    const isLoading = configLoading || profileLoading || !datasetId;

    return (
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent
                className="sm:max-w-[560px] md:max-w-2xl flex flex-col max-h-[90vh] [&>button]:hidden px-4 md:px-8 py-6"
                onPointerDownOutside={(e: any) => e.preventDefault()}
                onEscapeKeyDown={(e: any) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-lg md:text-2xl mb-1">
                        선택과목 선택 —{" "}
                        <span className="text-red-500 font-mono">{grade}{classNum}{studentNumber.padStart(2, '0')}</span>
                    </DialogTitle>
                    <p className="text-xs text-slate-500">
                        {mode === "smart"
                            ? `이동수업 그룹: ${groupCount}개 | 선택: ${smartSelected.length}/${groupCount}`
                            : "그룹별로 직접 과목을 선택합니다."
                        }
                    </p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
                    {isLoading ? (
                        <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-slate-400" /></div>
                    ) : (
                        <>
                            {/* ── Mandatory (non-moving) subjects ── */}
                            {mandatorySubjects.length > 0 && (
                                <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">필수 배정 과목 (변경 불가)</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {mandatorySubjects.map(s => (
                                            <Badge key={s} variant="secondary" className="text-xs bg-white border text-slate-600">
                                                {s}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── SMART MODE ── */}
                            {mode === "smart" && (
                                <div className="space-y-3">
                                    {/* Search + subject grid */}
                                    <div className="flex gap-2 items-center">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                            <Input
                                                placeholder="과목 검색..."
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                className="pl-8 text-sm"
                                            />
                                        </div>
                                        <div className="text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0">
                                            {smartSelected.length} / {groupCount} 선택
                                        </div>
                                    </div>

                                    {/* Subject picker grid */}
                                    <div className="grid grid-cols-3 gap-2 max-h-[260px] overflow-y-auto pr-1">
                                        {filteredSubjects.map(subj => {
                                            const isSelected = smartSelected.includes(subj);
                                            return (
                                                <button
                                                    key={subj}
                                                    onClick={() => toggleSubject(subj)}
                                                    className={`
                                                        text-left text-sm px-3 py-2.5 rounded-lg border transition-all font-medium
                                                        ${isSelected
                                                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                                            : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                                                        }
                                                    `}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                                                        <span className="truncate">{subj}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {filteredSubjects.length === 0 && (
                                            <div className="col-span-3 text-center py-6 text-slate-400 text-sm">일치하는 과목 없음</div>
                                        )}
                                    </div>

                                    {/* Auto-assignment preview / ambiguous picker */}
                                    {smartSelected.length > 0 && (
                                        <div className={`rounded-lg border p-3 text-sm space-y-2 ${(isAmbiguous && (solverOutcome?.solutionCount ?? 0) <= 3)
                                            ? "border-yellow-200 bg-yellow-50"
                                            : hasConflict
                                                ? "border-red-200 bg-red-50"
                                                : smartAssigned
                                                    ? "border-green-200 bg-green-50"
                                                    : "border-slate-200 bg-slate-50"
                                            }`}>
                                            <p className={`font-semibold text-xs uppercase tracking-wide ${(isAmbiguous && (solverOutcome?.solutionCount ?? 0) <= 3)
                                                ? "text-yellow-700"
                                                : hasConflict
                                                    ? "text-red-600"
                                                    : smartAssigned
                                                        ? "text-green-700"
                                                        : "text-slate-500"
                                                }`}>
                                                {isAmbiguous
                                                    ? (solverOutcome && solverOutcome.solutionCount <= 3
                                                        ? `⚠️ 가능한 조합 ${solverOutcome.solutionCount}가지 — 하나를 선택하세요`
                                                        : `⚠️ 가능한 조합 ${solverOutcome?.solutionCount}${(solverOutcome?.solutionCount ?? 0) >= MAX_SOLUTIONS_TO_COLLECT ? '가지 이상' : '가지'} — 수동 모드로 직접 지정하세요`
                                                    )
                                                    : hasConflict
                                                        ? "⚠️ 그룹 배정 불가 — 과목 조합을 다시 선택하세요"
                                                        : smartAssigned
                                                            ? "✅ 자동 그룹 배정 완료"
                                                            : "과목을 모두 선택하면 자동 배정합니다"
                                                }
                                            </p>

                                            {/* Unique solution preview */}
                                            {smartAssigned && (
                                                <div className="flex flex-wrap gap-2">
                                                    {Object.entries(smartAssigned).sort(([a], [b]) => a.localeCompare(b)).map(([group, sel]) => (
                                                        <div key={group} className="flex items-center gap-1 bg-white rounded-md border px-2 py-1">
                                                            <span className="font-bold text-xs text-slate-500">{group}</span>
                                                            <span className="text-slate-800 font-medium">{sel.subject}</span>
                                                            {sel.teacher && <span className="text-xs text-slate-400 ml-1">{sel.teacher}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Ambiguous ≤3: selectable solution cards */}
                                            {isAmbiguous && solverOutcome && solverOutcome.solutionCount <= 3 && (
                                                <div className="space-y-2 pt-1">
                                                    {solverOutcome.allSolutions.map((sol, idx) => {
                                                        const isChosen = selectedSolution !== null &&
                                                            JSON.stringify(sol) === JSON.stringify(selectedSolution);
                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => setSelectedSolution(isChosen ? null : sol)}
                                                                className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${isChosen
                                                                    ? "border-blue-500 bg-blue-100 ring-2 ring-blue-300"
                                                                    : "border-blue-200 bg-blue-50 hover:bg-blue-100"
                                                                    }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {Object.entries(sol).sort(([a], [b]) => a.localeCompare(b)).map(([group, sel]) => (
                                                                            <div key={group} className="flex items-center gap-1">
                                                                                <span className="font-bold text-sm text-blue-400">{group}</span>
                                                                                <span className="text-slate-800 font-medium text-sm">{sel.subject}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    <span className={`text-xs shrink-0 ml-2 ${isChosen ? "text-blue-600 font-semibold" : "text-blue-400"}`}>
                                                                        {isChosen ? "✓ 선택됨" : "선택"}
                                                                    </span>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Ambiguous 4-99: mobile button inline, desktop button in footer */}
                                            {isAmbiguous && solverOutcome && solverOutcome.solutionCount > 3 && solverOutcome.solutionCount < MAX_SOLUTIONS_TO_COLLECT && (
                                                <div className="flex justify-center sm:hidden pt-1">
                                                    <Button variant="outline" size="sm" onClick={() => setMode("manual")} className="text-amber-600 border-amber-300">
                                                        수동 입력으로 전환
                                                    </Button>
                                                </div>
                                            )}

                                            {/* Ambiguous ≥100: mobile button + error note */}
                                            {isAmbiguous && solverOutcome && solverOutcome.solutionCount >= MAX_SOLUTIONS_TO_COLLECT && (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-red-500">
                                                        가능한 조합이 {solverOutcome.solutionCount}가지 이상으로 너무 많아 자동 배정이 불가합니다. 수동 모드로 전환하세요.
                                                    </p>
                                                    {/* Mobile-only: button shown inline below error, not in footer */}
                                                    <div className="flex justify-center sm:hidden">
                                                        <Button variant="outline" size="sm" onClick={() => setMode("manual")} className="text-amber-600 border-amber-300">
                                                            수동 입력으로 전환
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Pure conflict (0 solutions) — also show mobile button */}
                                            {hasConflict && !isAmbiguous && (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-red-500">
                                                        선택한 과목들이 동일한 그룹에 중복 배정되어 충돌이 발생합니다.
                                                    </p>
                                                    <div className="flex justify-center sm:hidden">
                                                        <Button variant="outline" size="sm" onClick={() => setMode("manual")} className="text-amber-600 border-amber-300">
                                                            수동 입력으로 전환
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── MANUAL (FALLBACK) MODE ── */}
                            {mode === "manual" && (
                                <div className="space-y-3">
                                    {/* Only show the fallback warning when the user was forced into manual mode automatically, not when admin set it as default */}
                                    {!forceManualMode && (
                                        <div className="flex items-center gap-2 px-1 py-1.5 rounded-md bg-amber-50 border border-amber-200">
                                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                            <p className="text-xs text-amber-700">자동 배정이 불가능하여 수동 입력 모드로 전환했습니다.</p>
                                        </div>
                                    )}
                                    {Object.entries(electivesByGroup).map(([group, configs]) => {
                                        const currentSel = manualSelections[group];
                                        const selectedValue = currentSel?.subject;
                                        
                                        // DEBUGGING: Remove this later
                                        console.log(`[DEBUG UI] Group: ${group}`, {
                                            currentSel,
                                            selectedValue,
                                            availableSubjects: configs.map(c => c.subject)
                                        });

                                        return (
                                            <div key={group} className="grid grid-cols-4 items-center gap-3">
                                                <label className="text-right text-sm font-bold text-gray-700">{group} 그룹</label>
                                                <div className="col-span-3 flex flex-col sm:flex-row items-start sm:items-center">
                                                    <Select value={selectedValue} onValueChange={(val: string) => handleManualSelection(group, val)}>
                                                        <SelectTrigger className={`w-full sm:w-[220px] ${selectedValue ? "border-blue-500 bg-blue-50 text-blue-700 font-bold" : ""}`}>
                                                            <SelectValue placeholder="과목 선택" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {Array.from(new Map(configs.map(item => [item.subject, item])).values()).map((config: ElectiveConfig) => {
                                                                const otherGroup = Object.keys(manualSelections).find(g => manualSelections[g].subject === config.subject && g !== group);
                                                                return (
                                                                    <SelectItem key={config.subject} value={config.subject} className={otherGroup ? "text-slate-400 bg-yellow-50" : ""}>
                                                                        {config.subject}{config.fullSubjectName && ` (${config.fullSubjectName})`}{otherGroup ? ` [${otherGroup}에서 선택됨]` : ""}
                                                                    </SelectItem>
                                                                );
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                    {currentSel?.teacher && (
                                                        <span className="text-xs text-blue-600 mt-1 sm:mt-0 sm:ml-3">{currentSel.teacher}</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {/* Mobile-only: 자동 탐색으로 전환 below dropdowns */}
                                    {!forceManualMode && (
                                        <div className="flex justify-center sm:hidden pt-2">
                                            <Button variant="outline" size="sm" onClick={() => setMode("smart")}>
                                                자동 탐색으로 전환
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Footer Buttons ── */}
                <div className="flex justify-between gap-3 mt-4 pt-3 border-t">
                    <div className="flex gap-2">
                        {onBack && (
                            <Button variant="outline" onClick={onBack}>뒤로가기</Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSmartSelected([]); setManualSelections({}); }}
                            className="text-destructive hover:text-destructive"
                        >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            초기화
                        </Button>
                    </div>
                    <div className="flex gap-2 items-center">
                        {/* Mode toggle — desktop only (mobile version shown inline above) */}
                        {mode === "smart" && isAmbiguous && solverOutcome && solverOutcome.solutionCount > 3 && (
                            <Button variant="outline" size="sm" onClick={() => setMode("manual")} className="hidden sm:flex text-amber-600 border-amber-300">
                                수동 입력으로 전환
                            </Button>
                        )}
                        {/* 자동 탐색으로 전환 — desktop only; mobile version shown inline above */}
                        {mode === "manual" && !forceManualMode && (
                            <Button variant="ghost" size="sm" onClick={() => setMode("smart")} className="hidden sm:flex">
                                자동 탐색으로 전환
                            </Button>
                        )}
                        <Button
                            onClick={() => saveMutation.mutate(undefined)}
                            disabled={(mode === "smart" ? !canSaveSmart : !canSaveManual) || saveMutation.isPending || isLoading}
                            className={`${(mode === "smart" ? canSaveSmart : canSaveManual) ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                        >
                            {saveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />저장 중...</> : "저장하고 시작하기"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
