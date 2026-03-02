import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, ArrowRight, Save, X, Play, Wand2, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";

interface BridgeMapping {
    from: string;
    to: string;
    similarity?: number;
    isManual?: boolean;
}

// Levenshtein distance based string similarity (0 to 100)
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.replace(/\s+/g, '').toLowerCase();
    const s2 = str2.replace(/\s+/g, '').toLowerCase();

    if (s1 === s2) return 100;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));

    for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= s2.length; j++) {
        for (let i = 1; i <= s1.length; i++) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return Math.round(((maxLength - distance) / maxLength) * 100);
}

interface DatasetBridge {
    id: number;
    name: string;
    fromDataset: string;
    toDataset: string;
    targetGrade: number;
    mappingData: string; // JSON string of BridgeMapping[]
    createdAt: string;
    updatedAt: string;
}

export function BridgeManager({ adminPassword, goAutoFillAnalysis }: { adminPassword: string, goAutoFillAnalysis: (grade: number, targetDataset: string) => void }) {
    const queryClient = useQueryClient();
    const [selectedBridgeId, setSelectedBridgeId] = useState<number | null>(null);
    const [editingBridge, setEditingBridge] = useState<DatasetBridge | null>(null);
    const [mappingFields, setMappingFields] = useState<BridgeMapping[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    // Combobox (searchable select) state
    const [openComboboxId, setOpenComboboxId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Form inputs for creation/editing
    const [name, setName] = useState("");
    const [fromDataset, setFromDataset] = useState("MANUAL_PLAN");
    const [toDataset, setToDataset] = useState("");
    const [targetGrade, setTargetGrade] = useState("");

    // Execution states
    const [execElectives, setExecElectives] = useState(true);
    const [execProfiles, setExecProfiles] = useState(true);
    const [execAssessments, setExecAssessments] = useState(true);
    const [isExecuting, setIsExecuting] = useState(false);

    // 1. Fetch Datasets
    const rawDataQuery = useQuery({
        queryKey: ["admin", "rawComcigan", "부산성지고"],
        queryFn: async () => {
            const res = await fetch("/api/admin/raw_comcigan", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({ schoolName: "부산성지고" })
            });
            const json = await res.json();
            if (!res.ok || json?.error) return null;
            return json.data;
        }
    });

    const datasetOptions = React.useMemo(() => {
        if (!rawDataQuery.data) return [];
        return Object.keys(rawDataQuery.data).filter((k: string) => {
            const val = rawDataQuery.data[k];
            return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]);
        });
    }, [rawDataQuery.data]);

    // 2. Fetch Subjects for From
    const fromSubjectsQuery = useQuery({
        queryKey: ["admin", "bridge-subjects", fromDataset, targetGrade],
        queryFn: async () => {
            if (!fromDataset || !targetGrade) return [];
            const grade = parseInt(targetGrade);
            const allSubjects = new Set<string>();

            const res = await fetch(`/api/admin/comcigan-subjects?grade=${grade}&dataset=${fromDataset}`);
            if (res.ok) {
                const data = await res.json();
                data.forEach((s: any) => allSubjects.add(s.subject));
            }

            return Array.from(allSubjects).sort();
        },
        enabled: !!fromDataset && !!targetGrade
    });

    // 3. Fetch Subjects for To
    const toSubjectsQuery = useQuery({
        queryKey: ["admin", "bridge-subjects", toDataset, targetGrade],
        queryFn: async () => {
            if (!toDataset || !targetGrade) return [];
            const grade = parseInt(targetGrade);
            const allSubjects = new Set<string>();

            const res = await fetch(`/api/admin/comcigan-subjects?grade=${grade}&dataset=${toDataset}`);
            if (res.ok) {
                const data = await res.json();
                data.forEach((s: any) => allSubjects.add(s.subject));
            }

            return Array.from(allSubjects).sort();
        },
        enabled: !!toDataset && !!targetGrade
    });

    // Manually trigger mapping generation
    const generateAutoMappings = () => {
        if (!fromSubjectsQuery.data) return;

        const defaultMappings = fromSubjectsQuery.data.map(subj => {
            let matchedTo = "";
            let maxSimilarity = 0;

            if (toSubjectsQuery.data && Array.isArray(toSubjectsQuery.data)) {
                // Find the best match using the similarity algorithm
                for (const candidate of toSubjectsQuery.data) {
                    const score = calculateSimilarity(subj, candidate);
                    if (score > maxSimilarity) {
                        maxSimilarity = score;
                        matchedTo = candidate;
                    }
                }
                // Only auto-match if there's at least a weak similarity (e.g. > 30%)
                if (maxSimilarity < 30) {
                    matchedTo = "";
                    maxSimilarity = 0;
                }
            }
            return { from: subj, to: matchedTo, similarity: maxSimilarity, isManual: false };
        });
        setMappingFields(defaultMappings);
        toast.success("이름 기반 1:1 매핑 규칙이 생성되었습니다.");
    };

    const { data: bridges, isLoading } = useQuery({
        queryKey: ["admin", "bridges"],
        queryFn: async () => {
            const res = await fetch("/api/admin/bridge", {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("Failed to fetch bridges");
            return res.json() as Promise<DatasetBridge[]>;
        }
    });

    const createBridgeMutation = useMutation({
        mutationFn: async (bridge: Partial<DatasetBridge>) => {
            const res = await fetch("/api/admin/bridge", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword
                },
                body: JSON.stringify(bridge)
            });
            if (!res.ok) throw new Error("Failed to create/update bridge");
            return res.json();
        },
        onSuccess: () => {
            toast.success("BRIDGE가 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "bridges"] });
            setIsCreating(false);
            setEditingBridge(null);
            setSelectedBridgeId(null);
        },
        onError: (err) => {
            toast.error(err.message);
        }
    });

    const deleteBridgeMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/admin/bridge?id=${id}`, {
                method: "DELETE",
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("Failed to delete bridge");
            return res.json();
        },
        onSuccess: () => {
            toast.success("BRIDGE가 삭제되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "bridges"] });
            setEditingBridge(null);
            setSelectedBridgeId(null);
        },
        onError: (err) => {
            toast.error(err.message);
        }
    });

    const executeBridgeMutation = useMutation({
        mutationFn: async (payload: any) => {
            const res = await fetch("/api/admin/bridge/execute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "실행 중 오류 발생");
            return data;
        },
        onSuccess: (data) => {
            toast.success(`마이그레이션이 완료되었습니다. (선택과목 복사: ${data.results.totalElectiveConfigsCopied}, 학생 프로필 업데이트: ${data.results.totalStudentProfilesUpdated}, 수행평가 수정: ${data.results.totalAssessmentsUpdated})`);
            queryClient.invalidateQueries({ queryKey: ["admin"] });
            setIsExecuting(false);
        },
        onError: (err) => {
            toast.error(err.message);
            setIsExecuting(false);
        }
    });

    const hasMappingChanges = () => {
        if (!editingBridge) return true; // It's a new bridge
        try {
            const originalMapping = JSON.parse(editingBridge.mappingData);

            // Normalize for comparison: ignore transient UI state like similarity and isManual
            const normalize = (arr: any[]) => arr.map((m: any) => ({ from: m.from, to: m.to }));
            const currentStr = JSON.stringify(normalize(mappingFields));
            const originalStr = JSON.stringify(normalize(originalMapping));

            return currentStr !== originalStr ||
                editingBridge.name !== name ||
                editingBridge.fromDataset !== fromDataset ||
                editingBridge.toDataset !== toDataset ||
                editingBridge.targetGrade?.toString() !== targetGrade;
        } catch {
            return true;
        }
    };

    const handleSave = () => {
        if (!name || !fromDataset || !toDataset || !targetGrade) {
            toast.error("이름, 출발역, 도착역, 대상 학년을 모두 입력해주세요.");
            return;
        }

        const validMapping = mappingFields.filter(m => m.from.trim() !== "");

        createBridgeMutation.mutate({
            id: editingBridge?.id,
            name,
            fromDataset,
            toDataset,
            targetGrade: parseInt(targetGrade), // Added targetGrade
            mappingData: JSON.stringify(validMapping)
        });
    };

    const handleExecute = () => {
        if (!selectedBridgeId) return;
        if (!confirm("정말로 이 설정을 기반으로 DB에 변경사항을 적용하시겠습니까? \n기존 학생 선택과목과 수행평가의 과목명이 일괄 변경될 수 있습니다.")) return;

        setIsExecuting(true);
        executeBridgeMutation.mutate({
            bridgeId: selectedBridgeId,
            options: {
                migrateElectiveConfig: execElectives,
                migrateStudentProfiles: execProfiles,
                migrateAssessments: execAssessments
            }
        });
    };

    const openCreate = () => {
        setEditingBridge(null);
        setSelectedBridgeId(null);
        setName("");
        setFromDataset("MANUAL_PLAN");
        setToDataset("");
        setTargetGrade("");
        setMappingFields([]);
        setIsCreating(true);
    };

    const openEdit = (bridge: DatasetBridge) => {
        setEditingBridge(bridge);
        setSelectedBridgeId(bridge.id);
        setName(bridge.name);
        setFromDataset(bridge.fromDataset);
        setToDataset(bridge.toDataset);
        setTargetGrade(bridge.targetGrade ? bridge.targetGrade.toString() : "");
        try {
            const parsed = JSON.parse(bridge.mappingData);
            // When opening an existing bridge, we consider all mappings as manual
            // so we don't inappropriately show old similarity scores if they weren't saved or changed
            const restored = parsed.length > 0 ? parsed.map((m: any) => ({ ...m, isManual: true })) : [{ from: "", to: "" }];
            setMappingFields(restored);
        } catch {
            setMappingFields([{ from: "", to: "" }]);
        }
        setIsCreating(false);
    };

    const [autofillGrade, setAutofillGrade] = useState("2");

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>수행/선택과목 BRIDGE</CardTitle>
                        <CardDescription>
                            데이터셋이 변경될 때 이전 데이터(선택과목, 학생 프로필, 수행평가)가 유실되지 않도록 1:1 매핑 정보를 설정하고 이전시킵니다.
                        </CardDescription>
                    </div>
                    <Button onClick={openCreate} disabled={isCreating}>
                        <Plus className="w-4 h-4 mr-2" />
                        새 BRIDGE 추가
                    </Button>
                </CardHeader>

                <CardContent>
                    {/* Bridge List */}
                    {!isCreating && !editingBridge && (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>BRIDGE 이름</TableHead>
                                        <TableHead className="w-24">대상 학년</TableHead> {/* Added TableHead */}
                                        <TableHead>출발역 (From)</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                        <TableHead>도착역 (To)</TableHead>
                                        <TableHead>매핑 개수</TableHead>
                                        <TableHead className="text-right">마지막 수정</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center">로딩 중...</TableCell></TableRow>
                                    ) : !Array.isArray(bridges) || bridges.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">등록된 BRIDGE가 없습니다.</TableCell></TableRow>
                                    ) : bridges.map(bridge => {
                                        let mappingCount = 0;
                                        try { mappingCount = JSON.parse(bridge.mappingData).length; } catch { }
                                        return (
                                            <TableRow key={bridge.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openEdit(bridge)}>
                                                <TableCell className="font-bold">{bridge.name}</TableCell>
                                                <TableCell><span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-bold">{bridge.targetGrade || "-"}학년</span></TableCell>
                                                <TableCell><span className="bg-slate-100 px-2 py-1 rounded text-xs font-mono">{bridge.fromDataset}</span></TableCell>
                                                <TableCell><ArrowRight className="w-4 h-4 text-slate-400" /></TableCell>
                                                <TableCell><span className="bg-orange-100 px-2 py-1 rounded text-xs font-mono text-orange-800">{bridge.toDataset}</span></TableCell>
                                                <TableCell>{mappingCount}개 규칙</TableCell>
                                                <TableCell className="text-right text-sm text-slate-500">{new Date(bridge.updatedAt).toLocaleDateString()}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {/* Editor / Execution View */}
                    {(isCreating || editingBridge) && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Editor Panel (2 cols) */}
                            <div className="lg:col-span-2 space-y-4">
                                <div className="p-4 border rounded-xl bg-slate-50 space-y-4">
                                    <div className="grid grid-cols-12 gap-4 items-end">
                                        <div className="col-span-12">
                                            <label className="text-sm font-bold block mb-1">BRIDGE 식별 이름</label>
                                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="예: 24년도 1학기 마이그레이션" />
                                        </div>
                                        <div className="col-span-12 sm:col-span-4 relative">
                                            <label className="text-sm font-bold block mb-1">출발역 (From)</label>
                                            <Select value={fromDataset || undefined} onValueChange={setFromDataset} disabled={!isCreating}>
                                                <SelectTrigger className={!fromDataset ? "text-slate-500" : ""}>
                                                    <SelectValue placeholder="-선택-" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="SEMESTER_PLAN">MANUAL_PLAN (학기별 계획)</SelectItem>
                                                    <SelectItem value="MANUAL_PLAN">수동 시간표 (MANUAL_PLAN)</SelectItem>
                                                    {Array.isArray(datasetOptions) && datasetOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="hidden sm:flex col-span-1 justify-center pb-2">
                                            <ArrowRight className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <div className="col-span-12 sm:col-span-5">
                                            <label className="text-sm font-bold block mb-1">도착역 (To)</label>
                                            <Select value={toDataset || undefined} onValueChange={setToDataset} disabled={!isCreating}>
                                                <SelectTrigger className={!toDataset ? "text-slate-500" : ""}>
                                                    <SelectValue placeholder="-선택-" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="MANUAL_PLAN">수동 시간표 (MANUAL_PLAN)</SelectItem>
                                                    {Array.isArray(datasetOptions) && datasetOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-12 sm:col-span-2">
                                            <label className="text-sm font-bold block mb-1">대상 학년</label>
                                            <Select value={targetGrade} onValueChange={setTargetGrade}>
                                                <SelectTrigger className={!targetGrade ? "text-slate-500" : ""}>
                                                    <SelectValue placeholder="-선택-" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">1학년</SelectItem>
                                                    <SelectItem value="2">2학년</SelectItem>
                                                    <SelectItem value="3">3학년</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                <div className="border rounded-xl flex flex-col">
                                    <div className="p-3 bg-slate-100 border-b flex justify-between items-center rounded-t-xl">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-sm">1:1 과목명 매핑 규칙</h3>
                                            {(fromSubjectsQuery.data && fromSubjectsQuery.data.length > 0) && (
                                                <Button variant="secondary" size="sm" onClick={generateAutoMappings} disabled={!isCreating} className="h-7 text-xs px-2">
                                                    <Wand2 className="w-3 h-3 mr-1.5" />
                                                    이름 자동 매핑
                                                </Button>
                                            )}
                                        </div>
                                        <span className="text-xs text-slate-500">{mappingFields.length}개 과목 발견됨</span>
                                    </div>
                                    <div className="p-4 space-y-2 max-h-[400px] overflow-auto bg-white">
                                        {fromSubjectsQuery.isLoading && isCreating && (
                                            <p className="text-sm text-center text-slate-400 py-4">과목 목록을 불러오는 중...</p>
                                        )}
                                        {Array.isArray(mappingFields) && mappingFields.map((field, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <div className="w-[35%] shrink-0 px-3 py-2 bg-slate-50 border rounded-md text-sm font-medium text-slate-700 truncate" title={field.from}>
                                                    {field.from}
                                                </div>
                                                <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                                    <Popover
                                                        open={openComboboxId === idx}
                                                        onOpenChange={(open) => {
                                                            if (open) {
                                                                setOpenComboboxId(idx);
                                                                setSearchQuery("");
                                                            } else {
                                                                setOpenComboboxId(null);
                                                            }
                                                        }}
                                                    >
                                                        <PopoverTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                role="combobox"
                                                                aria-expanded={openComboboxId === idx}
                                                                className={cn("flex-1 min-w-0 justify-between font-normal", !field.to && 'border-red-200 bg-red-50 text-slate-500')}
                                                            >
                                                                <span className="truncate">
                                                                    {field.to ? (field.to === "_none_" ? "매핑 안함 (삭제됨/유실됨)" : field.to) : "매핑 검색 및 선택..."}
                                                                </span>
                                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="p-0" align="start">
                                                            <Command>
                                                                <CommandInput
                                                                    placeholder="과목명 검색..."
                                                                    value={searchQuery}
                                                                    onValueChange={(val) => {
                                                                        const subjects = Array.isArray(toSubjectsQuery.data) ? toSubjectsQuery.data : [];
                                                                        // Check if any subject matches the typed search query
                                                                        const hasMatch = subjects.some(s =>
                                                                            s.toLowerCase().includes(val.toLowerCase()) ||
                                                                            s.replace(/\s+/g, "").toLowerCase().includes(val.replace(/\s+/g, "").toLowerCase())
                                                                        );

                                                                        if (!hasMatch && val.trim() !== "") {
                                                                            // User requested: If no match is found, clear the search field
                                                                            setSearchQuery("");
                                                                            toast.info("검색된 과목이 없어 초기화되었습니다.");
                                                                        } else {
                                                                            setSearchQuery(val);
                                                                        }
                                                                    }}
                                                                />
                                                                <CommandList>
                                                                    <CommandEmpty>결과가 없습니다.</CommandEmpty>
                                                                    <CommandGroup>
                                                                        <CommandItem
                                                                            value="_none_"
                                                                            onSelect={() => {
                                                                                const newFields = [...mappingFields];
                                                                                newFields[idx].to = "";
                                                                                newFields[idx].isManual = true;
                                                                                setMappingFields(newFields);
                                                                                setOpenComboboxId(null);
                                                                            }}
                                                                            className="text-red-500 text-sm"
                                                                        >
                                                                            <Check className={cn("mr-2 h-4 w-4", field.to === "" || field.to === "_none_" ? "opacity-100" : "opacity-0")} />
                                                                            매핑 안함 (수동 매핑 거부)
                                                                        </CommandItem>
                                                                        {Array.isArray(toSubjectsQuery.data) && toSubjectsQuery.data.map(opt => (
                                                                            <CommandItem
                                                                                key={opt}
                                                                                value={opt}
                                                                                onSelect={(currentValue) => {
                                                                                    // CommandItem passes the lowercased value by default usually, but we need the exact casing.
                                                                                    const subjects = Array.isArray(toSubjectsQuery.data) ? toSubjectsQuery.data : [];
                                                                                    const exactMatch = subjects.find(s => s.toLowerCase() === currentValue.toLowerCase() || s === opt) || opt;

                                                                                    const newFields = [...mappingFields];
                                                                                    newFields[idx].to = exactMatch;
                                                                                    newFields[idx].isManual = true;
                                                                                    setMappingFields(newFields);
                                                                                    setOpenComboboxId(null);
                                                                                }}
                                                                                className="text-sm"
                                                                            >
                                                                                <Check className={cn("mr-2 h-4 w-4", field.to === opt ? "opacity-100" : "opacity-0")} />
                                                                                {opt}
                                                                            </CommandItem>
                                                                        ))}
                                                                    </CommandGroup>
                                                                </CommandList>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>

                                                    {field.to && !field.isManual && field.similarity !== undefined && field.similarity > 0 && (
                                                        <span className="text-red-500 text-xs font-bold whitespace-nowrap" title="시스템이 추천한 유사도 점수입니다.">
                                                            {field.similarity}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {mappingFields.length === 0 && !fromSubjectsQuery.isLoading && (
                                            <p className="text-sm text-center text-slate-400 py-4">추출된 출발역 대상 과목이 없습니다.</p>
                                        )}
                                    </div>
                                    <div className="p-3 border-t bg-slate-50 flex justify-between items-center rounded-b-xl gap-2">
                                        {editingBridge && (
                                            <Button variant="destructive" size="sm" onClick={() => {
                                                if (confirm("이 BRIDGE 설정을 삭제하시겠습니까?")) {
                                                    deleteBridgeMutation.mutate(editingBridge.id);
                                                    setIsCreating(false);
                                                }
                                            }}>삭제</Button>
                                        )}
                                        <div className="flex-1"></div>
                                        <Button variant="ghost" onClick={() => {
                                            setIsCreating(false);
                                            setEditingBridge(null);
                                        }}>
                                            <X className="w-4 h-4 mr-1" /> 취소
                                        </Button>
                                        <Button onClick={handleSave} disabled={!hasMappingChanges() || createBridgeMutation.isPending}>
                                            <Save className="w-4 h-4 mr-1" />
                                            {createBridgeMutation.isPending ? "저장 중..." : "변경사항 저장"}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Unified Migration & AutoFill Panel */}
                            <div className="space-y-4 lg:col-span-1">
                                <div className="border border-purple-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="p-4 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                                        <Wand2 className="w-5 h-5 text-purple-600" />
                                        <h3 className="font-bold text-purple-800">마이그레이션 실행 & 도구</h3>
                                    </div>
                                    <div className="p-4 bg-white space-y-4 text-sm">

                                        {/* Auto-fill Trigger Action */}
                                        {fromDataset === 'SEMESTER_PLAN' && (
                                            <div className="space-y-2 border-b pb-4">
                                                <p className="font-semibold text-slate-700">선택과목 자동 채우기</p>
                                                <p className="text-xs text-slate-500">
                                                    출발역이 <strong>MANUAL_PLAN (학기별 계획)</strong> 일 경우, 학기별 계획 데이터를 바탕으로 <strong>{toDataset || '선택된 도착역'}</strong>으로 선택과목을 자동으로 생성할 수 있습니다.
                                                </p>
                                                <Button
                                                    variant="outline"
                                                    className="w-full text-purple-700 border-purple-200 hover:bg-purple-50 mt-2"
                                                    disabled={hasMappingChanges() || !toDataset}
                                                    onClick={() => goAutoFillAnalysis(parseInt(targetGrade), toDataset)}
                                                >
                                                    자동 채우기 연계 분석 시작
                                                </Button>
                                            </div>
                                        )}

                                        {/* Classic Execution Checkboxes */}
                                        {fromDataset !== 'SEMESTER_PLAN' && (
                                            <div className="space-y-2 pt-2">
                                                <p className="font-semibold text-slate-700">마이그레이션 옵션</p>

                                                <label className={`flex flex-row items-center justify-between border p-3 rounded-lg cursor-pointer ${targetGrade === '1' ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50'}`}>
                                                    <div className="space-y-0.5">
                                                        <p className="font-medium text-base">선택과목 데이터 복제</p>
                                                        <p className="text-xs text-slate-500">지정된 데이터셋의 구성을 기반으로 1:1 매핑 복사</p>
                                                    </div>
                                                    <Checkbox checked={targetGrade !== '1' && execElectives} disabled={targetGrade === '1'} onCheckedChange={(v) => setExecElectives(!!v)} />
                                                </label>

                                                <label className={`flex flex-row items-center justify-between border p-3 rounded-lg cursor-pointer ${targetGrade === '1' ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50'}`}>
                                                    <div className="space-y-0.5">
                                                        <p className="font-medium text-base">학생 선택과목 변경</p>
                                                        <p className="text-xs text-slate-500">학생 프로필에 저장된 과목명을 매핑 규칙대로 변경</p>
                                                    </div>
                                                    <Checkbox checked={targetGrade !== '1' && execProfiles} disabled={targetGrade === '1'} onCheckedChange={(v) => setExecProfiles(!!v)} />
                                                </label>

                                                <label className="flex flex-row items-center justify-between border p-3 rounded-lg cursor-pointer hover:bg-slate-50">
                                                    <div className="space-y-0.5">
                                                        <p className="font-medium text-base">수행평가 데이터 연결</p>
                                                        <p className="text-xs text-slate-500">수행평가 DB에 저장된 과목명을 매핑 규칙대로 수정</p>
                                                    </div>
                                                    <Checkbox checked={execAssessments} onCheckedChange={(v) => setExecAssessments(!!v)} />
                                                </label>

                                                {targetGrade === '1' && (
                                                    <p className="text-xs text-amber-600 font-medium mt-2">
                                                        * 1학년은 독립된 선택과목 구조가 없으므로 해당 옵션들이 비활성화됩니다.
                                                    </p>
                                                )}

                                                <Button
                                                    className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white"
                                                    onClick={handleExecute}
                                                    disabled={isExecuting || hasMappingChanges() || !selectedBridgeId || (!execElectives && !execProfiles && !execAssessments) || (targetGrade === '1' && !execAssessments)}
                                                >
                                                    {isExecuting ? "실행 중..." : "선택 옵션 마이그레이션 실행"}
                                                </Button>

                                                {hasMappingChanges() && (
                                                    <p className="text-xs text-red-500 text-center font-bold mt-2">
                                                        변경사항을 먼저 저장해야 실행할 수 있습니다.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
