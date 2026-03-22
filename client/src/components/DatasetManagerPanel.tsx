import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

interface DatasetManagerPanelProps {
    adminPassword: string;
}

export default function DatasetManagerPanel({ adminPassword }: DatasetManagerPanelProps) {
    const [datasets, setDatasets] = useState<string[]>([]);
    const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
    const [counts, setCounts] = useState<{
        electiveConfigs: Record<string, number>;
        studentProfiles: Record<string, number>;
        groupOverrides: Record<string, number>;
        assessments: Record<string, number>;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Checkbox selections for deletion (arrays of selected grades)
    const [selections, setSelections] = useState<{
        electiveConfigs: number[];
        studentProfiles: number[];
        groupOverrides: number[];
        assessments: number[];
    }>({
        electiveConfigs: [],
        studentProfiles: [],
        groupOverrides: [],
        assessments: [],
    });

    const [deleteDialog, setDeleteDialog] = useState(false);
    const [deleteInput, setDeleteInput] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchDatasets();
    }, []);

    useEffect(() => {
        if (selectedDataset) {
            fetchCounts(selectedDataset);
        } else {
            setCounts(null);
        }
    }, [selectedDataset]);

    const fetchDatasets = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/admin/datasets/manage", {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (res.ok) {
                const data = await res.json();
                setDatasets(data.datasets || []);
            } else {
                const errorText = await res.text();
                console.error("Failed to fetch datasets:", res.status, errorText);
                toast.error(`데이터셋 목록을 불러오지 못했습니다: ${res.status} ${errorText}`);
            }
        } catch (e) {
            console.error("Failed to fetch datasets", e);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCounts = async (dataset: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/admin/datasets/manage?dataset=${encodeURIComponent(dataset)}`, {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (res.ok) {
                const data = await res.json();
                setCounts(data.counts);
            }
        } catch (e) {
            console.error("Failed to fetch counts", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGradeToggle = (category: keyof typeof selections, grade: number, checked: boolean) => {
        setSelections(prev => {
            const current = prev[category];
            if (checked) {
                return { ...prev, [category]: Array.from(new Set([...current, grade])) };
            } else {
                return { ...prev, [category]: current.filter(g => g !== grade) };
            }
        });
    };

    const handleCategoryToggle = (category: keyof typeof selections, gradesAvailable: number[], checked: boolean) => {
        setSelections(prev => ({
            ...prev,
            [category]: checked ? gradesAvailable : []
        }));
    };

    const anySelected = Object.values(selections).some(arr => arr.length > 0);

    const handleDeleteConfirm = async () => {
        if (selectedDataset === null) return;
        if (deleteInput !== "이 차는 이제 제 겁니다") return;

        setIsDeleting(true);
        try {
            const categoriesToSend: Record<string, number[]> = {};
            for (const [key, val] of Object.entries(selections)) {
                if (val.length > 0) {
                    categoriesToSend[key] = val;
                }
            }

            const payload = {
                dataset: selectedDataset,
                categories: categoriesToSend
            };

            const res = await fetch('/api/admin/datasets/manage', {
                method: 'DELETE',
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success(`'${selectedDataset}' 데이터 삭제 완료`);
                setDeleteDialog(false);
                setDeleteInput("");
                setSelections({
                    electiveConfigs: [],
                    studentProfiles: [],
                    groupOverrides: [],
                    assessments: [],
                });
                fetchCounts(selectedDataset); // Refresh counts
            } else {
                const err = await res.json();
                toast.error(`삭제 실패: ${err.error}`);
            }
        } catch (e) {
            console.error("Delete failed", e);
            toast.error("삭제 중 오류가 발생했습니다.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Card className="w-full h-full border shadow-sm">
            <CardHeader className="border-b bg-gray-50/50">
                <CardTitle>데이터셋 관리 (Dataset Management)</CardTitle>
                <CardDescription>
                    특정 데이터셋 단위로 관련 데이터를 조회하고 일괄 삭제합니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
                {/* Dataset Selection */}
                <div className="space-y-3">
                    <label className="text-sm font-semibold flex flex-col gap-1">
                        관리할 데이터셋 선택
                        <span className="text-xs font-normal text-gray-500">주의: "" (수동 기본값) 데이터셋도 조작 가능합니다.</span>
                    </label>
                    <Select value={selectedDataset ?? undefined} onValueChange={setSelectedDataset}>
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder="데이터셋을 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                            {datasets.map(ds => (
                                <SelectItem key={ds || '_EMPTY_'} value={ds || '_EMPTY_'}>
                                    {ds === "" ? '"" (빈 데이터셋/기본값)' : ds}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Counts & Deletion Selection */}
                {selectedDataset !== null && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-800">
                                데이터 포함 내역 <span className="text-gray-500 text-xs font-normal">(삭제할 항목을 체크하세요)</span>
                            </h3>
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Card 1: Electives */}
                            <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-colors ${selections.electiveConfigs.length > 0 ? 'border-red-400 bg-red-50/30' : 'border-gray-100 bg-white'}`}>
                                <div className="flex items-start gap-3">
                                    <Checkbox 
                                        checked={selections.electiveConfigs.length > 0} 
                                        onCheckedChange={(c) => handleCategoryToggle('electiveConfigs', [2, 3], !!c)} 
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <div className="font-semibold text-sm">선택과목 설정 데이터</div>
                                        <div className="text-xs text-gray-500 mt-1">학년별 과목 및 교사 매핑 정보</div>
                                    </div>
                                    <div className="text-xl font-mono font-bold text-gray-700">
                                        {counts ? (counts.electiveConfigs['2'] || 0) + (counts.electiveConfigs['3'] || 0) : '-'}
                                    </div>
                                </div>
                                <div className="flex gap-4 ml-7 mt-2 p-2 bg-gray-50 rounded-md text-sm border">
                                    {[2, 3].map(g => (
                                        <label key={g} className="flex items-center gap-2 cursor-pointer">
                                            <Checkbox 
                                                checked={selections.electiveConfigs.includes(g)}
                                                onCheckedChange={(c) => handleGradeToggle('electiveConfigs', g, !!c)}
                                            />
                                            {g}학년 ({counts?.electiveConfigs[g.toString()] || 0})
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Card 2: Profiles */}
                            <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-colors ${selections.studentProfiles.length > 0 ? 'border-red-400 bg-red-50/30' : 'border-gray-100 bg-white'}`}>
                                <div className="flex items-start gap-3">
                                    <Checkbox 
                                        checked={selections.studentProfiles.length > 0} 
                                        onCheckedChange={(c) => handleCategoryToggle('studentProfiles', [2, 3], !!c)} 
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <div className="font-semibold text-sm">학생별 선택과목 프로필</div>
                                        <div className="text-xs text-gray-500 mt-1">학생들의 개인별 선택과목 입력 데이터</div>
                                    </div>
                                    <div className="text-xl font-mono font-bold text-gray-700">
                                        {counts ? (counts.studentProfiles['2'] || 0) + (counts.studentProfiles['3'] || 0) : '-'}
                                    </div>
                                </div>
                                <div className="flex gap-4 ml-7 mt-2 p-2 bg-gray-50 rounded-md text-sm border">
                                    {[2, 3].map(g => (
                                        <label key={g} className="flex items-center gap-2 cursor-pointer">
                                            <Checkbox 
                                                checked={selections.studentProfiles.includes(g)}
                                                onCheckedChange={(c) => handleGradeToggle('studentProfiles', g, !!c)}
                                            />
                                            {g}학년 ({counts?.studentProfiles[g.toString()] || 0})
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Card 3: Overrides */}
                            <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-colors ${selections.groupOverrides.length > 0 ? 'border-red-400 bg-red-50/30' : 'border-gray-100 bg-white'}`}>
                                <div className="flex items-start gap-3">
                                    <Checkbox 
                                        checked={selections.groupOverrides.length > 0} 
                                        onCheckedChange={(c) => handleCategoryToggle('groupOverrides', [2, 3], !!c)} 
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <div className="font-semibold text-sm">수동 그룹 오버라이드</div>
                                        <div className="text-xs text-gray-500 mt-1">관리자가 수동으로 지정한 A~G 그룹 정보</div>
                                    </div>
                                    <div className="text-xl font-mono font-bold text-gray-700">
                                        {counts ? (counts.groupOverrides['2'] || 0) + (counts.groupOverrides['3'] || 0) : '-'}
                                    </div>
                                </div>
                                <div className="flex gap-4 ml-7 mt-2 p-2 bg-gray-50 rounded-md text-sm border">
                                    {[2, 3].map(g => (
                                        <label key={g} className="flex items-center gap-2 cursor-pointer">
                                            <Checkbox 
                                                checked={selections.groupOverrides.includes(g)}
                                                onCheckedChange={(c) => handleGradeToggle('groupOverrides', g, !!c)}
                                            />
                                            {g}학년 ({counts?.groupOverrides[g.toString()] || 0})
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Card 4: Assessments */}
                            <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-colors ${selections.assessments.length > 0 ? 'border-red-400 bg-red-50/30' : 'border-gray-100 bg-white'}`}>
                                <div className="flex items-start gap-3">
                                    <Checkbox 
                                        checked={selections.assessments.length > 0} 
                                        onCheckedChange={(c) => handleCategoryToggle('assessments', [1, 2, 3], !!c)} 
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <div className="font-semibold text-sm">수행평가 목록</div>
                                        <div className="text-xs text-gray-500 mt-1">대시보드에 등록된 수행평가 일정 데이터</div>
                                    </div>
                                    <div className="text-xl font-mono font-bold text-gray-700">
                                        {counts ? Object.values(counts.assessments).reduce((a, b) => a + b, 0) : '-'}
                                    </div>
                                </div>
                                <div className="flex gap-4 ml-7 mt-2 p-2 bg-gray-50 rounded-md text-sm border flex-wrap">
                                    {[1, 2, 3].map(g => (
                                        <label key={g} className="flex items-center gap-2 cursor-pointer">
                                            <Checkbox 
                                                checked={selections.assessments.includes(g)}
                                                onCheckedChange={(c) => handleGradeToggle('assessments', g, !!c)}
                                            />
                                            {g}학년 ({counts?.assessments[g.toString()] || 0})
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Action Bar */}
                        <div className="flex justify-end pt-4 mt-6 border-t border-gray-100">
                            <Button 
                                variant="destructive" 
                                disabled={!anySelected || isLoading}
                                onClick={() => {
                                    setDeleteInput("");
                                    setDeleteDialog(true);
                                }}
                                className="gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                선택한 데이터 일괄 삭제
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            {/* Confirm Dialog */}
            <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5"/>
                            데이터 완전 삭제 경고
                        </DialogTitle>
                        <DialogDescription className="space-y-4 pt-4 text-gray-700 font-medium">
                            <p>
                                <strong>[{selectedDataset === '_EMPTY_' ? '"" (빈 문자열)' : selectedDataset}]</strong> 데이터셋의 다음 데이터를 완전히 삭제합니다:
                            </p>
                            <ul className="list-disc pl-5 text-sm space-y-1 text-gray-500">
                                {selections.electiveConfigs.length > 0 && <li>선택과목 설정 데이터 ({selections.electiveConfigs.join(', ')}학년)</li>}
                                {selections.studentProfiles.length > 0 && <li>학생별 선택과목 프로필 ({selections.studentProfiles.join(', ')}학년)</li>}
                                {selections.groupOverrides.length > 0 && <li>수동 그룹 오버라이드 ({selections.groupOverrides.join(', ')}학년)</li>}
                                {selections.assessments.length > 0 && <li>수행평가 목록 ({selections.assessments.join(', ')}학년)</li>}
                            </ul>
                            <p className="text-red-600 bg-red-50 p-3 rounded-md border border-red-100 text-sm">
                                삭제된 데이터는 복구할 수 없습니다. 계속하려면 아래에 <strong className="font-mono bg-white px-1 border rounded">이 차는 이제 제 겁니다</strong> 를 입력하세요.
                            </p>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input 
                            value={deleteInput} 
                            onChange={e => setDeleteInput(e.target.value)} 
                            placeholder="이 차는 이제 제 겁니다"
                            className="font-mono text-center tracking-widest"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialog(false)}>취소</Button>
                        <Button 
                            variant="destructive" 
                            disabled={deleteInput !== "이 차는 이제 제 겁니다" || isDeleting}
                            onClick={handleDeleteConfirm}
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {isDeleting ? "삭제 중..." : "영구 삭제"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
