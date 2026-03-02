import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, ArrowRight, Save, X, Play, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

interface BridgeMapping {
    from: string;
    to: string;
}

interface DatasetBridge {
    id: number;
    name: string;
    fromDataset: string;
    toDataset: string;
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

    // Form inputs for creation/editing
    const [name, setName] = useState("");
    const [fromDataset, setFromDataset] = useState("MANUAL_PLAN");
    const [toDataset, setToDataset] = useState("");

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
        queryKey: ["admin", "bridge-subjects", fromDataset],
        queryFn: async () => {
            // We need subjects for ALL grades to map them. Since comcigan-subjects expects a grade, 
            // we fetch for 1, 2, 3 and combine them.
            if (!fromDataset) return [];
            const grades = [1, 2, 3];
            const allSubjects = new Set<string>();

            await Promise.all(grades.map(async (g) => {
                const res = await fetch(`/api/admin/comcigan-subjects?grade=${g}&dataset=${fromDataset}`);
                if (res.ok) {
                    const data = await res.json();
                    data.forEach((s: any) => allSubjects.add(s.subject));
                }
            }));
            return Array.from(allSubjects).sort();
        },
        enabled: !!fromDataset
    });

    // 3. Fetch Subjects for To
    const toSubjectsQuery = useQuery({
        queryKey: ["admin", "bridge-subjects", toDataset],
        queryFn: async () => {
            if (!toDataset) return [];
            const grades = [1, 2, 3];
            const allSubjects = new Set<string>();

            await Promise.all(grades.map(async (g) => {
                const res = await fetch(`/api/admin/comcigan-subjects?grade=${g}&dataset=${toDataset}`);
                if (res.ok) {
                    const data = await res.json();
                    data.forEach((s: any) => allSubjects.add(s.subject));
                }
            }));
            return Array.from(allSubjects).sort();
        },
        enabled: !!toDataset
    });

    // Auto-populate mappings when fromSubject list changes and we are creating
    useEffect(() => {
        if (isCreating && fromSubjectsQuery.data) {
            setMappingFields(fromSubjectsQuery.data.map(subj => ({ from: subj, to: "" })));
        }
    }, [fromSubjectsQuery.data, isCreating]);

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
            return JSON.stringify(originalMapping) !== JSON.stringify(mappingFields) ||
                editingBridge.name !== name ||
                editingBridge.fromDataset !== fromDataset ||
                editingBridge.toDataset !== toDataset;
        } catch {
            return true;
        }
    };

    const handleSave = () => {
        if (!name || !fromDataset || !toDataset) {
            toast.error("이름, 출발역, 도착역을 모두 입력해주세요.");
            return;
        }

        const validMapping = mappingFields.filter(m => m.from.trim() !== "");

        createBridgeMutation.mutate({
            id: editingBridge?.id,
            name,
            fromDataset,
            toDataset,
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
        setMappingFields([{ from: "", to: "" }]);
        setIsCreating(true);
    };

    const openEdit = (bridge: DatasetBridge) => {
        setEditingBridge(bridge);
        setSelectedBridgeId(bridge.id);
        setName(bridge.name);
        setFromDataset(bridge.fromDataset);
        setToDataset(bridge.toDataset);
        try {
            const parsed = JSON.parse(bridge.mappingData);
            setMappingFields(parsed.length > 0 ? parsed : [{ from: "", to: "" }]);
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
                                    ) : bridges?.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">등록된 BRIDGE가 없습니다.</TableCell></TableRow>
                                    ) : bridges?.map(bridge => {
                                        let mappingCount = 0;
                                        try { mappingCount = JSON.parse(bridge.mappingData).length; } catch { }
                                        return (
                                            <TableRow key={bridge.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openEdit(bridge)}>
                                                <TableCell className="font-bold">{bridge.name}</TableCell>
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
                                    <div className="grid grid-cols-3 gap-4 items-end">
                                        <div className="col-span-3">
                                            <label className="text-sm font-bold block mb-1">BRIDGE 식별 이름</label>
                                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="예: 24년도 1학기 마이그레이션" />
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold block mb-1">출발역 (From)</label>
                                            <Select value={fromDataset} onValueChange={setFromDataset} disabled={!isCreating}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="출발역 선택" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="MANUAL_PLAN">MANUAL_PLAN (학기별 계획)</SelectItem>
                                                    {datasetOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex justify-center pb-2">
                                            <ArrowRight className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold block mb-1">도착역 (To)</label>
                                            <Select value={toDataset} onValueChange={setToDataset} disabled={!isCreating}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="도착역 선택" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {datasetOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                <div className="border rounded-xl flex flex-col">
                                    <div className="p-3 bg-slate-100 border-b flex justify-between items-center rounded-t-xl">
                                        <h3 className="font-bold text-sm">1:1 과목명 매핑 규칙</h3>
                                        <span className="text-xs text-slate-500">{mappingFields.length}개 과목 발견됨</span>
                                    </div>
                                    <div className="p-4 space-y-2 max-h-[400px] overflow-auto bg-white">
                                        {fromSubjectsQuery.isLoading && isCreating && (
                                            <p className="text-sm text-center text-slate-400 py-4">과목 목록을 불러오는 중...</p>
                                        )}
                                        {mappingFields.map((field, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <div className="flex-1 px-3 py-2 bg-slate-50 border rounded-md text-sm font-medium text-slate-700 truncate min-w-0" title={field.from}>
                                                    {field.from}
                                                </div>
                                                <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <Select
                                                        value={field.to || "_none_"}
                                                        onValueChange={val => {
                                                            const newFields = [...mappingFields];
                                                            newFields[idx].to = val === "_none_" ? "" : val;
                                                            setMappingFields(newFields);
                                                        }}
                                                    >
                                                        <SelectTrigger className={`w-full ${!field.to && 'border-red-200 bg-red-50'}`}>
                                                            <SelectValue placeholder="매핑 선택..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="_none_" className="text-red-500">매핑 안함 (삭제됨/유실됨)</SelectItem>
                                                            {toSubjectsQuery.data?.map(opt => (
                                                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
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

                            {/* Execution Panel (1 col) - Only visible if editing an existing bridge */}
                            {editingBridge && (
                                <div className="space-y-4">
                                    <div className="border border-orange-200 rounded-xl overflow-hidden shadow-sm">
                                        <div className="p-4 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                                            <Play className="w-5 h-5 text-orange-600" />
                                            <h3 className="font-bold text-orange-800">마이그레이션 실행</h3>
                                        </div>
                                        <div className="p-4 bg-white space-y-4 text-sm">
                                            <p className="text-slate-600 mb-2">실행할 항목을 선택해주세요:</p>

                                            <label className="flex flex-row items-center justify-between border p-3 rounded-lg cursor-pointer hover:bg-slate-50">
                                                <div className="space-y-0.5">
                                                    <p className="font-medium text-base">선택과목 데이터 복제</p>
                                                    <p className="text-xs text-slate-500">지정된 데이터셋의 구성을 기반으로 1:1 매핑 복사</p>
                                                </div>
                                                <Checkbox checked={execElectives} onCheckedChange={(v) => setExecElectives(!!v)} />
                                            </label>

                                            <label className="flex flex-row items-center justify-between border p-3 rounded-lg cursor-pointer hover:bg-slate-50">
                                                <div className="space-y-0.5">
                                                    <p className="font-medium text-base">학생 선택과목 변경</p>
                                                    <p className="text-xs text-slate-500">학생 프로필에 저장된 과목명을 매핑 규칙대로 변경</p>
                                                </div>
                                                <Checkbox checked={execProfiles} onCheckedChange={(v) => setExecProfiles(!!v)} />
                                            </label>

                                            <label className="flex flex-row items-center justify-between border p-3 rounded-lg cursor-pointer hover:bg-slate-50">
                                                <div className="space-y-0.5">
                                                    <p className="font-medium text-base">수행평가 데이터 연결</p>
                                                    <p className="text-xs text-slate-500">수행평가 DB에 저장된 과목명을 매핑 규칙대로 수정</p>
                                                </div>
                                                <Checkbox checked={execAssessments} onCheckedChange={(v) => setExecAssessments(!!v)} />
                                            </label>

                                            <Button
                                                className="w-full mt-2"
                                                onClick={handleExecute}
                                                disabled={isExecuting || hasMappingChanges() || (!execElectives && !execProfiles && !execAssessments)}
                                            >
                                                {isExecuting ? "실행 중..." : "선택 항목 실행 (Execute)"}
                                            </Button>

                                            {hasMappingChanges() && (
                                                <p className="text-xs text-red-500 text-center font-bold">
                                                    변경사항을 먼저 저장해야 실행할 수 있습니다.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bridge Level Auto-Fill Extractor functionality */}
                                    <div className="border border-purple-200 rounded-xl overflow-hidden shadow-sm">
                                        <div className="p-4 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                                            <Wand2 className="w-5 h-5 text-purple-600" />
                                            <h3 className="font-bold text-purple-800">선택과목 자동 채우기 연계</h3>
                                        </div>
                                        <div className="p-4 bg-white space-y-4 text-sm">
                                            <p className="text-slate-600">
                                                이 BRIDGE의 '출발역'이 <strong>MANUAL_PLAN</strong>이라면 학기별 계획의 시간표 데이터 구조를 가져와 블록을 자동계산할 수 있습니다.
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <Select value={autofillGrade} onValueChange={setAutofillGrade}>
                                                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">1학년</SelectItem>
                                                        <SelectItem value="2">2학년</SelectItem>
                                                        <SelectItem value="3">3학년</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    variant="secondary"
                                                    className="flex-1"
                                                    disabled={editingBridge.fromDataset !== 'MANUAL_PLAN' || hasMappingChanges()}
                                                    onClick={() => goAutoFillAnalysis(parseInt(autofillGrade), editingBridge.toDataset)}
                                                >
                                                    자동 채우기 (Auto-fill) 분석
                                                </Button>
                                            </div>
                                            {editingBridge.fromDataset !== 'MANUAL_PLAN' && (
                                                <p className="text-xs text-slate-500 mt-1">
                                                    * 출발역이 MANUAL_PLAN일 때만 활성화됩니다.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

