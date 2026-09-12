import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
    ShieldCheck,
    Database,
    Loader2,
    RefreshCw,
    AlertTriangle,
    ArrowDownToLine,
    Info,
    CheckCircle2
} from "lucide-react";

interface TableInfo {
    name: string;
    label: string;
    description: string;
    priority: number;
    mainCount: number;
    testCount: number;
    existsInTest: boolean;
}

interface DbCloneDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    adminPassword: string;
    onSuccess?: () => void;
}

export default function DbCloneDialog({
    open,
    onOpenChange,
    adminPassword,
    onSuccess,
}: DbCloneDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isCloning, setIsCloning] = useState(false);
    const [mainDbBound, setMainDbBound] = useState<boolean | null>(null);
    const [unboundMessage, setUnboundMessage] = useState<string>("");
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [selectedTables, setSelectedTables] = useState<string[]>([]);
    const [syncSequences, setSyncSequences] = useState(true);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    // Fetch table metadata and row counts
    const fetchCloneInfo = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/admin/clone", {
                headers: { "X-Admin-Password": adminPassword },
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "테이블 목록을 불러오지 못했습니다.");
            }

            if (!data.mainDbBound) {
                setMainDbBound(false);
                setUnboundMessage(data.message || "본 DB 바인딩(MAIN_DB)이 설정되지 않았습니다.");
                setTables([]);
                setSelectedTables([]);
            } else {
                setMainDbBound(true);
                const tableList: TableInfo[] = data.tables || [];
                setTables(tableList);
                // 기본값: access_logs를 제외한 모든 테이블 기본 선택
                const defaultSelected = tableList
                    .filter((t) => t.name !== "access_logs")
                    .map((t) => t.name);
                setSelectedTables(defaultSelected);
            }
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchCloneInfo();
        }
    }, [open]);

    // 전체 선택 / 전체 해제 토글
    const isAllSelected = tables.length > 0 && selectedTables.length === tables.length;
    const isSomeSelected = selectedTables.length > 0 && !isAllSelected;

    const handleToggleAll = () => {
        if (isAllSelected) {
            setSelectedTables([]);
        } else {
            setSelectedTables(tables.map((t) => t.name));
        }
    };

    const handleToggleTable = (name: string) => {
        setSelectedTables((prev) =>
            prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
        );
    };

    // 복제 실행
    const handleExecuteClone = async () => {
        setIsConfirmOpen(false);
        setIsCloning(true);

        try {
            const res = await fetch("/api/admin/clone", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword,
                },
                body: JSON.stringify({
                    tables: selectedTables,
                    syncSequences,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "복제 작업에 실패했습니다.");
            }

            toast.success(data.message || "본 DB 복제가 성공적으로 완료되었습니다.");
            onOpenChange(false);
            if (onSuccess) {
                onSuccess();
            }
        } catch (err: any) {
            toast.error("복제 실패: " + err.message);
        } finally {
            setIsCloning(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="space-y-2 pb-2 border-b">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <ArrowDownToLine className="w-5 h-5 text-amber-600" />
                            본 DB (school-timetable-db) 가져오기
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-600">
                            운영 데이터베이스의 최신 데이터를 읽어와 현재 테스트 DB에 덮어씁니다.
                        </DialogDescription>
                    </DialogHeader>

                    {/* 안전 보장 띠 */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2.5 shadow-xs">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold">절대 역류 방지 (Zero-Backflow) 안전 보장:</span> 본 DB는
                            완벽한 <strong>읽기 전용(Read-Only)</strong> 프록시를 통해 접근되며, 어떠한
                            경우에도 본 DB에 쓰기/수정/삭제 쿼리가 실행되지 않습니다.
                        </div>
                    </div>

                    {/* 로딩 상태 */}
                    {isLoading && (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
                            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                            <p className="text-sm font-medium">본 DB 및 테스트 DB 메타데이터 확인 중...</p>
                        </div>
                    )}

                    {/* MAIN_DB 미바인딩 안내 */}
                    {!isLoading && mainDbBound === false && (
                        <div className="py-8 px-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-4">
                            <div className="flex items-center gap-2 text-amber-900 font-bold">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                                <span>본 DB 바인딩(MAIN_DB) 설정 필요</span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                                {unboundMessage}
                            </p>
                            <div className="bg-white p-3 rounded-lg border text-xs font-mono space-y-1 text-slate-800">
                                <p className="font-semibold text-slate-900">Cloudflare Pages 설정 방법:</p>
                                <p>1. Cloudflare Dashboard &gt; <strong>school-timetable-testserver</strong> 프로젝트 선택</p>
                                <p>2. <strong>Settings &gt; Functions &gt; D1 Database Bindings</strong> 이동</p>
                                <p>3. 바인딩 추가: Variable name: <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700 font-bold">MAIN_DB</code> / D1 database: <code className="bg-slate-100 px-1 py-0.5 rounded font-bold">school-timetable-db</code></p>
                                <p>4. 저장 후 새 배포 진행 (이후 즉시 본 DB 직접 복제가 가능합니다)</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={fetchCloneInfo}
                                className="w-full gap-1.5"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> 바인딩 상태 다시 확인
                            </Button>
                        </div>
                    )}

                    {/* 정상: 테이블 목록 선택 */}
                    {!isLoading && mainDbBound && (
                        <div className="flex-1 flex flex-col min-h-0 space-y-3 pt-2">
                            {/* 컨트롤 바 */}
                            <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50 border rounded-lg text-xs">
                                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer select-none">
                                    <Checkbox
                                        checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                                        onCheckedChange={handleToggleAll}
                                    />
                                    <span>전체 선택</span>
                                </label>
                                <div className="flex items-center gap-3">
                                    <span className="text-slate-500">
                                        선택: <strong className="text-slate-900">{selectedTables.length}</strong> / {tables.length}개
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={fetchCloneInfo}
                                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                                        title="새로고침"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>

                            {/* 테이블 리스트 */}
                            <ScrollArea className="flex-1 border rounded-lg p-2 min-h-[200px] max-h-[340px]">
                                <div className="space-y-1.5">
                                    {tables.map((table) => {
                                        const isChecked = selectedTables.includes(table.name);
                                        return (
                                            <div
                                                key={table.name}
                                                onClick={() => handleToggleTable(table.name)}
                                                className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-colors ${
                                                    isChecked
                                                        ? "bg-amber-50/50 border-amber-300"
                                                        : "bg-white border-slate-200 hover:bg-slate-50"
                                                }`}
                                            >
                                                <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                                    <Checkbox
                                                        checked={isChecked}
                                                        onCheckedChange={() => handleToggleTable(table.name)}
                                                        className="mt-0.5"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-xs text-slate-900">
                                                                {table.label}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                                                                {table.name}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                            {table.description}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 text-[11px] font-mono space-y-0.5">
                                                    <div className="text-amber-900 font-bold">
                                                        본 DB: {table.mainCount.toLocaleString()}건
                                                    </div>
                                                    <div className="text-slate-400 text-[10px]">
                                                        현재: {table.testCount.toLocaleString()}건
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </ScrollArea>

                            {/* 하단 옵션: 시퀀스 동기화 */}
                            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border text-xs">
                                <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                                    <Checkbox
                                        checked={syncSequences}
                                        onCheckedChange={(c) => setSyncSequences(Boolean(c))}
                                    />
                                    <span>
                                        <strong className="text-slate-900">AUTOINCREMENT 시퀀스 동기화</strong>{" "}
                                        (ID 발급 순서도 본 DB와 1:1 일치)
                                    </span>
                                </label>
                                <span title="sqlite_sequence 테이블을 본 DB 값으로 맞춥니다.">
                                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                </span>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="pt-3 border-t mt-2 flex sm:justify-between items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            disabled={isCloning}
                        >
                            취소
                        </Button>
                        <Button
                            size="sm"
                            disabled={!mainDbBound || selectedTables.length === 0 || isCloning}
                            onClick={() => setIsConfirmOpen(true)}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5"
                        >
                            {isCloning ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>본 DB 데이터 복제 중...</span>
                                </>
                            ) : (
                                <>
                                    <ArrowDownToLine className="w-4 h-4" />
                                    <span>선택한 {selectedTables.length}개 테이블 가져오기 (덮어쓰기)</span>
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 최종 확인 컨펌 다이얼로그 */}
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="max-w-md p-6">
                    <DialogHeader className="space-y-2">
                        <DialogTitle className="flex items-center gap-2 text-red-600 font-bold">
                            <AlertTriangle className="w-5 h-5" />
                            테이블 덮어쓰기 최종 확인
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-600 leading-relaxed">
                            선택하신 <strong>{selectedTables.length}개 테이블</strong>의 현재 테스트 DB 데이터가
                            영구적으로 삭제되고, 본 DB(school-timetable-db)의 최신 데이터로 완전히 대체됩니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 space-y-1 font-medium">
                        <p>• 대상 DB: 테스트 DB (현재 접속 중인 DB)</p>
                        <p>• 본 DB는 읽기 전용으로 안전하게 보호됩니다.</p>
                        <p>• 덮어씌워진 테스트 데이터는 되돌릴 수 없습니다.</p>
                    </div>

                    <DialogFooter className="gap-2 pt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsConfirmOpen(false)}
                        >
                            돌아가기
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleExecuteClone}
                            className="font-bold gap-1.5"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            확인 및 덮어쓰기 실행
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
