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
import { toast } from "sonner";
import {
    ShieldCheck,
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
                // 기본값: 0개 선택 (전체 선택 클릭 시 전체 선택)
                setSelectedTables([]);
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
                <DialogContent className="max-w-4xl lg:max-w-5xl w-[96vw] h-[88vh] max-h-[800px] flex flex-col p-0 overflow-hidden gap-0 rounded-xl bg-white shadow-2xl">
                    {/* 1. 고정 헤더 영역 (Shrink 0) */}
                    <div className="px-6 pt-5 pb-3.5 border-b bg-white shrink-0 space-y-1">
                        <DialogHeader className="space-y-1 text-left sm:text-left">
                            <DialogTitle className="text-lg md:text-xl font-bold flex items-center justify-between gap-2 flex-wrap text-slate-900 pr-6">
                                <div className="flex items-center gap-2">
                                    <ArrowDownToLine className="w-5 h-5 text-amber-600" />
                                    <span>본 DB (school-timetable-db) 가져오기</span>
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>절대 역류 방지 (Zero-Backflow)</span>
                                </span>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-500">
                                운영 데이터베이스의 최신 데이터를 읽어와 현재 테스트 DB에 덮어씁니다.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {/* 2. 중앙 컨텐츠 영역 (Flex-1, Min-h-0) */}
                    <div className="flex-1 min-h-0 flex flex-col p-5 gap-3 bg-slate-50/60 overflow-hidden">
                        {/* 로딩 상태 */}
                        {isLoading && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
                                <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                                <p className="text-xs font-medium">본 DB 및 테스트 DB 메타데이터 확인 중...</p>
                            </div>
                        )}

                        {/* MAIN_DB 미바인딩 안내 */}
                        {!isLoading && mainDbBound === false && (
                            <div className="flex-1 flex flex-col justify-center p-5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3 overflow-y-auto">
                                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                                    <span>본 DB 바인딩(MAIN_DB) 설정 필요</span>
                                </div>
                                <p className="text-xs text-slate-700 leading-relaxed">
                                    {unboundMessage}
                                </p>
                                <div className="bg-white p-3 rounded-lg border text-xs font-mono space-y-1 text-slate-800 shadow-2xs">
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
                                    className="w-full gap-1.5 text-xs mt-2"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" /> 바인딩 상태 다시 확인
                                </Button>
                            </div>
                        )}

                        {/* 정상: 테이블 목록 선택 */}
                        {!isLoading && mainDbBound && (
                            <>
                                {/* 컨트롤 바 (Shrink 0) */}
                                <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs shrink-0 shadow-2xs">
                                    <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer select-none">
                                        <Checkbox
                                            checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                                            onCheckedChange={handleToggleAll}
                                        />
                                        <span>전체 선택</span>
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <span className="text-slate-500 font-medium">
                                            선택: <strong className="text-amber-700">{selectedTables.length}</strong> / {tables.length}개
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={fetchCloneInfo}
                                            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 gap-1"
                                            title="새로고침"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            <span className="text-[11px] hidden sm:inline">새로고침</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* 스크롤 가능한 테이블 목록 (병렬 2열 그리드 배치) */}
                                <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50/40 p-2.5 shadow-2xs">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {tables.map((table) => {
                                            const isChecked = selectedTables.includes(table.name);
                                            return (
                                                <div
                                                    key={table.name}
                                                    onClick={() => handleToggleTable(table.name)}
                                                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                                                        isChecked
                                                            ? "bg-amber-50/50 border-amber-300 shadow-2xs"
                                                            : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                                        <Checkbox
                                                            checked={isChecked}
                                                            onCheckedChange={() => handleToggleTable(table.name)}
                                                            className="shrink-0"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-bold text-xs text-slate-900 truncate">
                                                                    {table.label}
                                                                </span>
                                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded border border-slate-200/60">
                                                                    {table.name}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                                                {table.description}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0 font-mono space-y-0.5 pl-1">
                                                        <div className="text-amber-800 font-bold bg-amber-100/80 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap">
                                                            본 DB: {table.mainCount.toLocaleString()}건
                                                        </div>
                                                        <div className="text-slate-400 text-[10px] pr-1 whitespace-nowrap">
                                                            현재: {table.testCount.toLocaleString()}건
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 하단 옵션: 시퀀스 동기화 (Shrink 0) */}
                                <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs shrink-0 shadow-2xs">
                                    <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                                        <Checkbox
                                            checked={syncSequences}
                                            onCheckedChange={(c) => setSyncSequences(Boolean(c))}
                                        />
                                        <span>
                                            <strong className="text-slate-900 font-semibold">AUTOINCREMENT 시퀀스 동기화</strong>{" "}
                                            <span className="text-slate-500 text-[11px]">(ID 번호 발급 체계도 본 DB와 1:1 일치)</span>
                                        </span>
                                    </label>
                                    <span title="sqlite_sequence 테이블을 본 DB 값으로 맞춥니다.">
                                        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* 3. 고정 푸터 영역 (Shrink 0) */}
                    <div className="px-6 py-3.5 border-t bg-white flex items-center justify-between shrink-0 shadow-xs">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            disabled={isCloning}
                            className="text-slate-600 hover:text-slate-900 text-xs h-9 px-4"
                        >
                            취소
                        </Button>
                        <Button
                            size="sm"
                            disabled={!mainDbBound || selectedTables.length === 0 || isCloning}
                            onClick={() => setIsConfirmOpen(true)}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs md:text-sm h-9 px-4 gap-2 shadow-xs"
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
                    </div>
                </DialogContent>
            </Dialog>

            {/* 최종 확인 컨펌 다이얼로그 */}
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-2xl">
                    <DialogHeader className="space-y-2">
                        <DialogTitle className="flex items-center gap-2 text-red-600 font-bold text-base md:text-lg">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            테이블 덮어쓰기 최종 확인
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-600 leading-relaxed">
                            선택하신 <strong>{selectedTables.length}개 테이블</strong>의 현재 테스트 DB 데이터가
                            영구적으로 삭제되고, 본 DB(school-timetable-db)의 최신 데이터로 완전히 대체됩니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 space-y-1.5 font-medium my-2">
                        <p>• <strong>대상 DB</strong>: 테스트 DB (현재 접속 중인 DB)</p>
                        <p>• <strong>보안 보장</strong>: 본 DB는 읽기 전용으로 안전하게 보호됩니다.</p>
                        <p>• <strong>주의</strong>: 덮어씌워진 현재 테스트 데이터는 복구할 수 없습니다.</p>
                    </div>

                    <DialogFooter className="gap-2 pt-2 sm:justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsConfirmOpen(false)}
                            className="text-xs"
                        >
                            돌아가기
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleExecuteClone}
                            className="font-bold text-xs gap-1.5"
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
