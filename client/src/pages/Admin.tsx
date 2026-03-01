import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    AlertCircle, Calendar, Edit2, Save, Trash2, Users, Download, Upload, Server, Database, Key, Check, ShieldAlert, ShieldCheck, Link2, Settings, ArrowUp, X,
    BookOpen, Eye, EyeOff, Lock, Search, ChevronDown, ChevronRight, ChevronsUpDown, GripVertical, CheckCircle2, Plus,
    TriangleAlert, CheckSquare, Ban, Wand2, Grid2X2
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import IPProfileViewer from "@/components/IPProfileViewer";
import DatabaseManager from "@/components/DatabaseManager";
import { IPProfile } from "@/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


function ElectiveManager({ password }: { password: string }) {
    const [selectedGrade, setSelectedGrade] = useState<number>(2);
    const [selectedDataset, setSelectedDataset] = useState<string>('');
    const [subjects, setSubjects] = useState<any[]>([]);
    const [originalSubjects, setOriginalSubjects] = useState<any[]>([]); // To track changes
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch current setting to determine default "Auto" dataset if needed
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", { headers: { "X-Admin-Password": password } });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        }
    });

    // Fetch raw comcigan to build the dataset list
    const [schoolSearchQuery] = useState("부산성지고");
    const rawDataQuery = useQuery({
        queryKey: ["admin", "rawComcigan", schoolSearchQuery],
        queryFn: async () => {
            const res = await fetch("/api/admin/raw_comcigan", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": password },
                body: JSON.stringify({ schoolName: schoolSearchQuery })
            });
            const json = await res.json();
            if (!res.ok || json?.error) return null;
            return json.data;
        }
    });

    const timetableProps = useMemo(() => {
        if (!rawDataQuery.data) return [];
        return Object.keys(rawDataQuery.data).filter(k => {
            const val = rawDataQuery.data[k];
            return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]);
        });
    }, [rawDataQuery.data]);

    useEffect(() => {
        fetchData();
    }, [selectedGrade, selectedDataset]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            console.log("Fetching data for grade", selectedGrade);

            // 1. Fetch Comcigan Subjects
            let comciganData = [];
            try {
                const comciganRes = await fetch(`/api/admin/comcigan-subjects?grade=${selectedGrade}&dataset=${selectedDataset}`);
                if (!comciganRes.ok) throw new Error(`Comcigan Fetch Failed: ${comciganRes.status}`);
                comciganData = await comciganRes.json();
                if (!Array.isArray(comciganData)) throw new Error("Comcigan data is not an array");
            } catch (e: any) {
                console.error("Comcigan Error:", e);
                toast.error(`컴시간 데이터 로드 실패: ${e.message}`);
                // Don't return, try to load saved configs anyway? 
                // No, we need subjects to display anything.
                // But maybe we can display saved configs even if comcigan fails? 
                // The current UI relies on merging.
                throw e;
            }

            // 2. Fetch Saved Configs
            let configData = [];
            try {
                const configRes = await fetch(`/api/admin/electives?grade=${selectedGrade}&dataset=${selectedDataset}`, {
                    headers: { "X-Admin-Password": password }
                });
                if (!configRes.ok) throw new Error(`Config Fetch Failed: ${configRes.status}`);
                configData = await configRes.json();
            } catch (e: any) {
                console.error("Config Error:", e);
                toast.error(`설정 데이터 로드 실패: ${e.message}`);
                // We can proceed with empty config
            }

            // 3. Merge
            // If it's in configData but not in comciganData, it's missing (isDeleted: true)
            const comciganMap = new Map(comciganData.map((c: any) => [`${c.subject}-${c.teacher}`, c]));

            const merged = comciganData.map((item: any) => {
                const saved = configData.find((c: any) => c.subject === item.subject && c.originalTeacher === item.teacher);
                return {
                    ...item,
                    classCode: saved?.classCode || "",
                    fullTeacherName: saved?.fullTeacherName || "",
                    className: saved?.className || "",
                    fullSubjectName: saved?.fullSubjectName || "",
                    isMovingClass: saved?.isMovingClass !== 0,
                    isCombinedClass: saved?.isCombinedClass === 1,
                    isDeleted: false
                };
            });

            configData.forEach((saved: any) => {
                const key = `${saved.subject}-${saved.originalTeacher}`;
                if (!comciganMap.has(key)) {
                    merged.push({
                        subject: saved.subject,
                        teacher: saved.originalTeacher,
                        classCode: saved.classCode || "",
                        fullTeacherName: saved.fullTeacherName || "",
                        className: saved.className || "",
                        fullSubjectName: saved.fullSubjectName || "",
                        isMovingClass: saved.isMovingClass !== 0,
                        isCombinedClass: saved.isCombinedClass === 1,
                        isDeleted: true
                    });
                }
            });

            setSubjects(merged);
            setOriginalSubjects(JSON.parse(JSON.stringify(merged)));
        } catch (error: any) {
            toast.error(`데이터 로드 중 치명적 오류: ${error.message}`);
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (index: number, field: string, value: string | boolean) => {
        const newSubjects = [...subjects];
        newSubjects[index] = { ...newSubjects[index], [field]: value };
        setSubjects(newSubjects);
    };

    const hasChanges = JSON.stringify(subjects) !== JSON.stringify(originalSubjects);

    const handleSave = async () => {
        if (!hasChanges) return;
        setIsSaving(true);
        try {
            // Save each changed item
            const promises = subjects.map(async (item: any, index: number) => {
                const original = originalSubjects[index];
                if (JSON.stringify(item) !== JSON.stringify(original)) {
                    const res = await fetch("/api/admin/electives", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-Admin-Password": password
                        },
                        body: JSON.stringify({
                            grade: selectedGrade,
                            subject: item.subject,
                            originalTeacher: item.teacher || "", // Ensure string
                            classCode: item.classCode,
                            fullTeacherName: item.fullTeacherName,
                            className: item.className,
                            fullSubjectName: item.fullSubjectName,
                            isMovingClass: item.isMovingClass,
                            isCombinedClass: item.isCombinedClass,
                            dataset: selectedDataset
                        })
                    });
                    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
                }
            });

            await Promise.all(promises);
            toast.success("저장되었습니다.");
            setOriginalSubjects(JSON.parse(JSON.stringify(subjects)));
        } catch (error) {
            toast.error("저장 중 오류가 발생했습니다.");
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (index: number) => {
        const item = subjects[index];
        if (!confirm(`정말 "${item.subject}" ("${item.teacher}") 데이터를 현재 데이터셋에서 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch("/api/admin/electives", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": password
                },
                body: JSON.stringify({
                    grade: selectedGrade,
                    subject: item.subject,
                    originalTeacher: item.teacher || "",
                    dataset: selectedDataset
                })
            });
            if (!res.ok) throw new Error("Delete failed");
            toast.success("삭제되었습니다.");
            fetchData();
        } catch (error) {
            toast.error("삭제 중 오류가 발생했습니다.");
            console.error(error);
        }
    };

    const [searchTerm, setSearchTerm] = useState("");

    const handleCancel = () => {
        setSubjects(JSON.parse(JSON.stringify(originalSubjects)));
    };

    // Filter subjects based on search term
    const filteredSubjects = subjects.filter((item: any) => {
        if (!searchTerm) return true;
        const lowerTerm = searchTerm.toLowerCase();

        const subjectMatch = item.subject?.toLowerCase().includes(lowerTerm);
        const teacherMatch = item.teacher?.toLowerCase().includes(lowerTerm);
        const fullTeacherMatch = item.fullTeacherName?.toLowerCase().includes(lowerTerm);
        const classCodeMatch = item.classCode?.toLowerCase().includes(lowerTerm);
        const classNameMatch = item.className?.toLowerCase().includes(lowerTerm);

        // Custom check for "Move O" / "Move X" if user types "이동" or "이동O", "이동X"
        let moveMatch = false;
        if (lowerTerm.includes("이동")) {
            if (lowerTerm.includes("o") && item.isMovingClass) moveMatch = true;
            else if (lowerTerm.includes("x") && !item.isMovingClass) moveMatch = true;
            else moveMatch = true; // Just "이동" matches both
        }

        // Custom check for "Combined"
        let combinedMatch = false;
        if (lowerTerm.includes("통반")) {
            if (lowerTerm.includes("o") && item.isCombinedClass) combinedMatch = true;
            else if (lowerTerm.includes("x") && !item.isCombinedClass) combinedMatch = true;
            else combinedMatch = true;
        }

        const fullNameMatch = item.fullSubjectName?.toLowerCase().includes(lowerTerm);

        return subjectMatch || teacherMatch || fullTeacherMatch || classCodeMatch || classNameMatch || moveMatch || combinedMatch || fullNameMatch;
    });

    return (
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-200px)] min-h-[600px] md:h-[600px]">
            {/* Sidebar */}
            <div className="w-full md:w-48 flex flex-row md:flex-col gap-2 p-2 border-b md:border-b-0 md:border-r shrink-0 overflow-x-auto">
                <Button
                    variant={selectedGrade === 2 ? "default" : "ghost"}
                    className="justify-center md:justify-start flex-1 md:flex-none whitespace-nowrap"
                    onClick={() => setSelectedGrade(2)}
                >
                    2학년
                </Button>
                <Button
                    variant={selectedGrade === 3 ? "default" : "ghost"}
                    className="justify-center md:justify-start flex-1 md:flex-none whitespace-nowrap"
                    onClick={() => setSelectedGrade(3)}
                >
                    3학년
                </Button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden pr-2">
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                    <div className="flex items-center gap-4 shrink-0">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            {selectedGrade}학년 선택과목 목록
                        </h3>
                        <Select
                            value={selectedDataset || "_auto_"}
                            onValueChange={(val) => setSelectedDataset(val === "_auto_" ? "" : val)}
                        >
                            <SelectTrigger className="w-[160px] h-9">
                                <SelectValue placeholder="데이터셋 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="_auto_">자동 (현재 시간표)</SelectItem>
                                <SelectItem value="MANUAL_PLAN">수동 시간표 (MANUAL_PLAN)</SelectItem>
                                {timetableProps.map((prop: string) => (
                                    <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Search Bar */}
                    <div className="flex-1 w-full xl:max-w-sm">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                            <Input
                                placeholder="검색 (과목, 선생님, 분반, 이동여부...)"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                        <Button
                            variant="outline"
                            disabled={!hasChanges || isSaving}
                            onClick={handleCancel}
                        >
                            취소
                        </Button>
                        <Button
                            disabled={!hasChanges || isSaving}
                            onClick={handleSave}
                        >
                            {isSaving ? "저장 중..." : "확인 및 저장하기"}
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[150px]">과목명</TableHead>
                                <TableHead className="w-[150px]">과목 풀네임</TableHead>
                                <TableHead className="w-[100px]">원래 선생님</TableHead>
                                <TableHead className="w-[150px]">분반 (A/B/C...)</TableHead>
                                <TableHead>선생님 성함 (전체)</TableHead>
                                <TableHead className="w-[150px]">이동 수업 여부</TableHead>
                                <TableHead className="w-[120px]">대상 반</TableHead>
                                <TableHead className="w-[150px]">통반 수업 여부</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center h-24">
                                        로딩 중...
                                    </TableCell>
                                </TableRow>
                            ) : filteredSubjects.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center h-24">
                                        {searchTerm ? "검색 결과가 없습니다." : "데이터가 없습니다."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSubjects.map((item: any, index: number) => {
                                    // Need to find original index to update state correctly
                                    const originalIndex = subjects.findIndex((s: any) => s.subject === item.subject && s.teacher === item.teacher);

                                    // Check subject name for keywords (Korean & English) - removed teacher check as per user request
                                    // Also checking for potential invisible characters or whitespace
                                    const subjectKeyword = ["빈교실", "공강", "창체", "자습", "동아리", "점심시간", "Empty", "Free"].find(ex => item.subject.trim().includes(ex));

                                    const matchedKeyword = subjectKeyword;
                                    const isDisabled = !!matchedKeyword;
                                    const isDeleted = item.isDeleted;

                                    return (
                                        <TableRow
                                            key={`${item.subject}-${item.teacher}`}
                                            className={`${isDisabled ? "opacity-50 bg-gray-50 cursor-not-allowed" : ""} ${isDeleted ? "opacity-60 bg-red-50/30" : ""}`}
                                            onClick={() => {
                                                if (isDisabled) {
                                                    toast.error(`${matchedKeyword}은(는) 선택할 수 없습니다.`);
                                                }
                                            }}
                                        >
                                            <TableCell className={`font-medium ${isDeleted ? "line-through text-red-400" : ""}`}>
                                                {item.subject}
                                                {isDeleted && <Badge variant="destructive" className="ml-2 text-[10px] px-1 h-4">없음</Badge>}
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={item.fullSubjectName || ""}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(originalIndex, "fullSubjectName", e.target.value)}
                                                    placeholder="풀네임 입력"
                                                    className={`max-w-[150px] ${isDisabled ? "pointer-events-none" : ""}`}
                                                    disabled={isDisabled || isDeleted}
                                                />
                                            </TableCell>
                                            <TableCell className={`text-gray-500 ${isDeleted ? "line-through text-red-400" : ""}`}>{item.teacher}</TableCell>
                                            <TableCell>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={`w-[130px] justify-between ${isDisabled ? "pointer-events-none opacity-50" : ""}`}
                                                            disabled={isDisabled}
                                                        >
                                                            <span className="truncate">
                                                                {item.classCode ? item.classCode.split(',').filter(Boolean).join(", ") : "선택"}
                                                            </span>
                                                            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[180px] p-2">
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((code) => {
                                                                const currentValues = (item.classCode || "").split(",").filter(Boolean);
                                                                const isSelected = currentValues.includes(code);
                                                                return (
                                                                    <Button
                                                                        key={code}
                                                                        variant={isSelected ? "default" : "outline"}
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            let newValues;
                                                                            if (isSelected) {
                                                                                newValues = currentValues.filter((c: string) => c !== code);
                                                                            } else {
                                                                                newValues = [...currentValues, code].sort();
                                                                            }
                                                                            handleInputChange(originalIndex, "classCode", newValues.join(","));
                                                                        }}
                                                                    >
                                                                        {code}
                                                                    </Button>
                                                                );
                                                            })}
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={item.fullTeacherName}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(originalIndex, "fullTeacherName", e.target.value)}
                                                    placeholder="선생님 성함 입력"
                                                    className={`max-w-[200px] ${isDisabled ? "pointer-events-none" : ""}`}
                                                    disabled={isDisabled}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant={item.isMovingClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${item.isMovingClass ? "bg-blue-600 hover:bg-blue-700" : "text-gray-400"} ${isDisabled ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isMovingClass", true);
                                                        }}
                                                        disabled={isDisabled}
                                                    >
                                                        이동 O
                                                    </Button>
                                                    <Button
                                                        variant={!item.isMovingClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${!item.isMovingClass ? "bg-red-600 hover:bg-red-700" : "text-gray-400"} ${isDisabled ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isMovingClass", false);
                                                            handleInputChange(originalIndex, "className", ""); // clear className when turned off
                                                        }}
                                                        disabled={isDisabled}
                                                    >
                                                        이동 X
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={item.className || ""}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(originalIndex, "className", e.target.value)}
                                                    placeholder="예: 1,2,3"
                                                    className={`max-w-[100px] ${(!item.isMovingClass || isDisabled) ? "bg-gray-100 pointer-events-none text-gray-400" : ""}`}
                                                    disabled={!item.isMovingClass || isDisabled}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant={item.isCombinedClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${item.isCombinedClass ? "bg-blue-600 hover:bg-blue-700" : "text-gray-400"} ${isDisabled ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isCombinedClass", true);
                                                        }}
                                                        disabled={isDisabled || isDeleted}
                                                    >
                                                        통반 O
                                                    </Button>
                                                    <Button
                                                        variant={!item.isCombinedClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${!item.isCombinedClass ? "bg-red-600 hover:bg-red-700" : "text-gray-400"} ${isDisabled ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isCombinedClass", false);
                                                        }}
                                                        disabled={isDisabled || isDeleted}
                                                    >
                                                        통반 X
                                                    </Button>
                                                </div>
                                                {isDeleted && (
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="mt-2 h-7 w-full"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(originalIndex);
                                                        }}
                                                    >
                                                        <Trash2 className="w-3 h-3 mr-1" /> 삭제
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody >
                    </Table >
                </div >
            </div >
        </div >
    );
}

// ----------------------------------------------------------------------
// 6. Data Transfer Manager Component (Import/Export)
// ----------------------------------------------------------------------
function DataTransferManager({ adminPassword }: { adminPassword: string }) {
    const [isExporting, setIsExporting] = React.useState(false);
    const [isImporting, setIsImporting] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await fetch("/api/admin/import_export", {
                method: "GET",
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("Failed to export data");

            // Extract filename from Content-Disposition if available
            const contentDisposition = res.headers.get("Content-Disposition");
            let filename = `backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match && match[1]) filename = match[1];
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success("데이터 백업이 완료되었습니다.");
        } catch (error: any) {
            toast.error("백업 오류: " + error.message);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm("경고: 업로드한 데이터로 현재 데이터베이스의 모든 내용이 덮어씌워집니다. 계속하시겠습니까? (이 작업은 되돌릴 수 없습니다.)")) {
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        setIsImporting(true);
        try {
            const fileReader = new FileReader();
            fileReader.onload = async (event) => {
                try {
                    const jsonStr = event.target?.result as string;
                    const parsedData = JSON.parse(jsonStr);

                    if (!parsedData.success || !parsedData.data) {
                        throw new Error("유효하지 않은 백업 파일 형식입니다.");
                    }

                    const res = await fetch("/api/admin/import_export", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-Admin-Password": adminPassword
                        },
                        body: JSON.stringify({ action: "import", data: parsedData.data })
                    });

                    const resultText = await res.text();
                    let result;
                    try { result = JSON.parse(resultText); } catch { result = { error: "Unknown error parsing response" }; }

                    if (!res.ok) throw new Error(result.error || "복원 실패");

                    toast.success("데이터베이스 복원이 완료되었습니다. 변경사항을 반영하기 위해 페이지를 새로고침하세요.");
                    setTimeout(() => window.location.reload(), 2000);
                } catch (err: any) {
                    toast.error("파일 처리 오류: " + err.message);
                } finally {
                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                }
            };
            fileReader.onerror = () => {
                toast.error("파일을 읽는 중 오류가 발생했습니다.");
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            };
            fileReader.readAsText(file);
        } catch (err: any) {
            toast.error("복원 중 오류 발생: " + err.message);
            setIsImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5" /> 데이터 추출 (백업)
                    </CardTitle>
                    <CardDescription>
                        데이터베이스의 모든 테이블 데이터를 JSON 파일로 다운로드합니다. 이 파일은 나중에 '복원' 기능에서 다시 사용할 수 있습니다.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleExport} disabled={isExporting} className="w-full sm:w-auto">
                        {isExporting ? "백업 파일 생성 중..." : "백업 데이터 다운로드 (.json)"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-red-200">
                <CardHeader className="bg-red-50/50 rounded-t-xl pb-4 border-b border-red-100">
                    <CardTitle className="text-red-700 flex items-center gap-2">
                        <Upload className="w-5 h-5" /> 데이터 삽입 (복원)
                    </CardTitle>
                    <CardDescription className="text-red-600 font-medium">
                        주의: 백업된 JSON 파일을 업로드하면 <strong>현재 데이터베이스의 모든 내용이 완전히 덮어씌워집니다.</strong> 복원 전에는 반드시 현재 상태를 먼저 백업하세요.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <input
                        type="file"
                        accept=".json"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <Button
                        variant="destructive"
                        onClick={handleImportClick}
                        disabled={isImporting}
                        className="w-full sm:w-auto"
                    >
                        {isImporting ? "데이터 복원 중..." : "백업 파일 업로드 및 복원"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

// ----------------------------------------------------------------------
// 6.5 Group Checker (Override configuration for dynamic grouping)
// ----------------------------------------------------------------------
function GroupChecker({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [grade, setGrade] = useState("2");

    // 1. Fetch data
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings", "groupOverrides"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", {
                headers: { "X-Admin-Password": adminPassword },
            });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        },
    });

    const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({
        "2": {},
        "3": {},
    });

    useEffect(() => {
        if (settingsQuery.data?.elective_group_overrides) {
            try {
                const parsed = JSON.parse(settingsQuery.data.elective_group_overrides);
                setOverrides({
                    "2": parsed["2"] || {},
                    "3": parsed["3"] || {},
                });
            } catch (e) {
                console.error("Failed to parse elective_group_overrides", e);
            }
        }
    }, [settingsQuery.data]);

    const saveMutation = useMutation({
        mutationFn: async (newData: any) => {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword,
                },
                body: JSON.stringify(newData),
            });
            if (!res.ok) throw new Error("Failed to save settings");
            return res.json();
        },
        onSuccess: () => {
            toast.success("그룹 강제 지정이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
        },
        onError: (err) => {
            toast.error(`저장 실패: ${err.message}`);
        },
    });

    const handleSave = () => {
        saveMutation.mutate({
            elective_group_overrides: JSON.stringify(overrides),
        });
    };

    const handleClearOverrides = () => {
        if (confirm("정말로 모든 그룹 강제 지정을 초기화하시겠습니까?")) {
            setOverrides({ "2": {}, "3": {} });
        }
    };

    // --- Mocking Data needed for computation. In reality we should fetch raw_comcigan and elective configs ---
    // But since Admin.tsx already can fetch raw_comcigan, let's use it.
    const [schoolSearchQuery] = useState("부산성지고"); // Can make configurable if needed
    const rawDataQuery = useQuery({
        queryKey: ["admin", "rawComcigan", schoolSearchQuery],
        queryFn: async () => {
            const res = await fetch("/api/admin/raw_comcigan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword
                },
                body: JSON.stringify({ schoolName: schoolSearchQuery })
            });
            const json = await res.json();
            if (!res.ok || json?.error) return null;
            return json.data;
        }
    });

    const { data: dbData } = useQuery({
        queryKey: ['adminData'],
        queryFn: async () => {
            const res = await fetch("/api/admin/data", { headers: { "X-Admin-Password": adminPassword } });
            return res.json();
        }
    });

    // Compute Groups (Similar logic to Dashboard)
    const computedBaseGroups = useMemo(() => {
        if (grade !== "2" && grade !== "3") return {};
        const rawTimetableData = rawDataQuery.data;
        const electiveConfigs = dbData?.electiveSubjects?.filter((c: any) => c.grade.toString() === grade) || [];

        if (!rawTimetableData || !electiveConfigs || electiveConfigs.length === 0) return {};

        const subjectTeacherToGroups = new Map<string, string[]>();
        const subjectToGroups = new Map<string, string[]>();

        electiveConfigs.forEach((c: any) => {
            if (c.isMovingClass !== 0 && c.classCode) {
                const codes = c.classCode.split(',').map((code: string) => code.trim()).filter(Boolean);
                const subj = c.subject.trim();

                const existing = subjectToGroups.get(subj) || [];
                subjectToGroups.set(subj, Array.from(new Set([...existing, ...codes])));

                const teacherNames = [];
                if (c.originalTeacher) teacherNames.push(...c.originalTeacher.split(',').map((t: string) => t.trim()).filter(Boolean));
                if (c.fullTeacherName) teacherNames.push(...c.fullTeacherName.split(',').map((t: string) => t.trim()).filter(Boolean));

                Array.from(new Set(teacherNames)).forEach((tName: string) => {
                    const key = `${subj}|${tName}`;
                    const existingKey = subjectTeacherToGroups.get(key) || [];
                    subjectTeacherToGroups.set(key, Array.from(new Set([...existingKey, ...codes])));
                });
            }
        });

        const cellGroups: Record<string, string> = {};
        for (let w = 0; w < 5; w++) {
            for (let p = 1; p <= 7; p++) {
                const slots = rawTimetableData.filter((t: any) => parseInt(t.grade) === parseInt(grade) && t.weekday === w && t.classTime === p);
                if (slots.length === 0) continue;

                const groupCounts: Record<string, number> = {};
                slots.forEach((slot: any) => {
                    const key = `${slot.subject.trim()}|${slot.teacher.trim()}`;
                    let groups = subjectTeacherToGroups.get(key) || subjectToGroups.get(slot.subject.trim());
                    if (groups) {
                        groups.forEach(g => { groupCounts[g] = (groupCounts[g] || 0) + 1; });
                    }
                });

                const entries = Object.entries(groupCounts);
                if (entries.length > 0) {
                    entries.sort((a, b) => b[1] - a[1]);
                    if (entries[0][1] >= 1) {
                        cellGroups[`${w}-${p}`] = entries[0][0];
                    }
                }
            }
        }
        return cellGroups;
    }, [rawDataQuery.data, dbData?.electiveSubjects, grade]);

    const isDirty = JSON.stringify(overrides) !== (settingsQuery.data?.elective_group_overrides || '{"2":{},"3":{}}');

    const handleOverrideChange = (w: number, p: number, val: string) => {
        const cellKey = `${w}-${p}`;
        setOverrides(prev => {
            const next = { ...prev };
            const gradeOverrides = { ...(next[grade] || {}) };

            if (val === "AUTO") {
                delete gradeOverrides[cellKey];
            } else {
                gradeOverrides[cellKey] = val;
            }

            next[grade] = gradeOverrides;
            return next;
        });
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>선택과목 그룹 지정기</CardTitle>
                <CardDescription>
                    아래 시간표는 <b>데이터를 기반으로 판별한 {grade}학년 이동수업 그룹</b>을 표시합니다.
                    <br />"강제 할당 없음"이 기본값입니다. 직접 값을 선택해 강제로 그룹을 덮어쓸 수 있습니다.<br />
                    저장 버튼을 클릭해야 반영됩니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 flex flex-col items-center">
                <div className="flex gap-4 items-center self-start w-full">
                    <label className="text-sm font-medium whitespace-nowrap">학년 선택:</label>
                    <Select value={grade} onValueChange={setGrade}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="학년" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2">2학년</SelectItem>
                            <SelectItem value="3">3학년</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex-1 flex justify-end gap-2 text-sm text-gray-500">
                        {rawDataQuery.isLoading ? "시간표 로딩중..." : ""}
                        {dbData ? "" : "강의설정 로딩중..."}
                    </div>
                </div>

                <div className="border rounded-xl bg-slate-50 w-full overflow-x-auto shadow-inner text-sm p-4">
                    <div className="grid grid-cols-6 gap-2 w-[600px] min-w-max mx-auto">
                        <div className="font-bold text-center text-slate-500 rounded bg-slate-200 py-1">교시</div>
                        {['월', '화', '수', '목', '금'].map(d => (
                            <div key={d} className="font-bold text-center text-slate-500 rounded bg-slate-200 py-1">{d}</div>
                        ))}

                        {[1, 2, 3, 4, 5, 6, 7].map(p => (
                            <React.Fragment key={`period-${p}`}>
                                <div className="font-bold flex items-center justify-center bg-slate-100 rounded text-slate-500 h-[60px]">
                                    {p}
                                </div>
                                {[0, 1, 2, 3, 4].map(w => {
                                    const cellKey = `${w}-${p}`;
                                    const autoGroup = computedBaseGroups[cellKey] || null;
                                    const overrideValue = overrides[grade]?.[cellKey];

                                    const isNone = overrideValue === "NONE";
                                    const finalGroup = isNone ? null : (overrideValue || autoGroup);
                                    const isOverridden = !!overrideValue;

                                    return (
                                        <div key={cellKey} className={`flex flex-col items-center justify-center p-1 rounded border overflow-hidden relative shadow-sm h-[60px]
                                            ${finalGroup ? 'bg-white border-blue-200' : 'bg-white opacity-60 border-gray-200'}
                                            ${isOverridden ? 'ring-2 ring-orange-400' : ''}
                                        `}>
                                            <div className={`font-bold text-lg leading-none mb-1 
                                                ${finalGroup ? 'text-blue-600' : 'text-gray-300'}`}>
                                                {finalGroup || '없음'}
                                            </div>
                                            <div className="w-full">
                                                <select
                                                    className={`w-full text-xs text-center border-none bg-transparent outline-none cursor-pointer p-0 m-0 ${isOverridden ? 'text-orange-600 font-bold' : 'text-slate-500'}`}
                                                    value={overrideValue || 'AUTO'}
                                                    onChange={e => handleOverrideChange(w, p, e.target.value)}
                                                >
                                                    <option value="AUTO">--자동--</option>
                                                    <option value="NONE">-없음 강제-</option>
                                                    <option value="A">A 지정</option>
                                                    <option value="B">B 지정</option>
                                                    <option value="C">C 지정</option>
                                                    <option value="D">D 지정</option>
                                                    <option value="E">E 지정</option>
                                                    <option value="F">F 지정</option>
                                                    <option value="G">G 지정</option>
                                                </select>
                                            </div>
                                        </div>
                                    )
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 justify-end w-full">
                    <Button variant="outline" onClick={handleClearOverrides} className="text-red-500 hover:text-red-600 mr-auto">
                        전체 초기화 (All Clear)
                    </Button>
                    <Button variant="outline" onClick={() => setOverrides(JSON.parse(settingsQuery.data?.elective_group_overrides || '{"2":{},"3":{}}'))} disabled={!isDirty || saveMutation.isPending}>
                        저장 취소
                    </Button>
                    <Button onClick={handleSave} disabled={!isDirty || saveMutation.isPending}>
                        {saveMutation.isPending ? "저장 중..." : "오버라이드 저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ----------------------------------------------------------------------
// 7. Etc Manager (Miscellaneous features like Raw Comcigan Data)
// ----------------------------------------------------------------------
function EtcManager({ adminPassword }: { adminPassword: string }) {
    const [selectedMenu, setSelectedMenu] = useState("raw-comcigan");
    const [schoolSearchQuery, setSchoolSearchQuery] = useState("성지");
    const [schoolNameInput, setSchoolNameInput] = useState("부산성지고");

    const rawDataQuery = useQuery({
        queryKey: ["admin", "rawComcigan", schoolSearchQuery],
        queryFn: async () => {
            const res = await fetch("/api/admin/raw_comcigan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword
                },
                body: JSON.stringify({ schoolName: schoolSearchQuery })
            });
            let json;
            try {
                json = await res.json();
            } catch (e) {
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            }

            if (json?.error) throw new Error(json.error);
            if (!res.ok) throw new Error("Failed to fetch raw data");

            return json.data;
        },
        enabled: (selectedMenu === "raw-comcigan" || selectedMenu === "dataset-selector") && !!schoolSearchQuery,
        retry: 1
    });

    const handleFetchRaw = () => {
        setSchoolSearchQuery(schoolNameInput);
    };

    return (
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-200px)] min-h-[600px] md:h-[600px]">
            {/* Sidebar List */}
            <div className="w-full md:w-64 flex flex-row md:flex-col gap-2 p-2 border-b md:border-b-0 md:border-r shrink-0 overflow-x-auto">
                <Button
                    variant={selectedMenu === "raw-comcigan" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("raw-comcigan")}
                >
                    <BookOpen className="w-4 h-4 mr-2" />
                    컴시간알리미 전체 데이터
                </Button>
                <Button
                    variant={selectedMenu === "dataset-selector" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("dataset-selector")}
                >
                    <Database className="w-4 h-4 mr-2" />
                    시간표 데이터셋 선택기
                </Button>
                <Button
                    variant={selectedMenu === "visit-restriction" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("visit-restriction")}
                >
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    방문제한 설정
                </Button>
                <Button
                    variant={selectedMenu === "group-checker" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("group-checker")}
                >
                    <Grid2X2 className="w-4 h-4 mr-2" />
                    그룹 확인기 / 오버라이드
                </Button>
                {/* Additional list items can go here later */}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden border rounded-md bg-white p-4">
                {selectedMenu === "raw-comcigan" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">컴시간알리미 원본 데이터 구조</h3>
                            <Input
                                value={schoolNameInput}
                                onChange={(e) => setSchoolNameInput(e.target.value)}
                                placeholder="학교명 (예: 부산성지고)"
                                className="w-[180px]"
                            />
                            <Button onClick={handleFetchRaw} disabled={rawDataQuery.isFetching}>
                                {rawDataQuery.isFetching ? "조회 중..." : "조회"}
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {rawDataQuery.isLoading ? (
                                <div className="text-gray-400 p-4">데이터를 불러오는 중입니다...</div>
                            ) : rawDataQuery.isError ? (
                                <div className="text-red-400 flex items-center gap-2 p-4">
                                    <AlertCircle className="w-4 h-4" />
                                    오류가 발생했습니다: {(rawDataQuery.error as Error).message}
                                </div>
                            ) : rawDataQuery.data ? (
                                <RawTimetableViewer rawData={rawDataQuery.data} />
                            ) : (
                                <div className="text-gray-400 p-4">학교 이름을 입력하고 조회를 눌러주세요.</div>
                            )}
                        </div>
                    </div>
                )}

                {selectedMenu === "dataset-selector" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">시간표 데이터셋 선택기</h3>
                            <Input
                                value={schoolNameInput}
                                onChange={(e) => setSchoolNameInput(e.target.value)}
                                placeholder="학교명 (예: 부산성지고)"
                                className="w-[180px]"
                            />
                            <Button onClick={handleFetchRaw} disabled={rawDataQuery.isFetching}>
                                {rawDataQuery.isFetching ? "조회 중..." : "조회"}
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {rawDataQuery.isLoading ? (
                                <div className="text-gray-400 p-4">데이터를 불러오는 중입니다...</div>
                            ) : rawDataQuery.isError ? (
                                <div className="text-red-400 flex items-center gap-2 p-4">
                                    <AlertCircle className="w-4 h-4" />
                                    오류가 발생했습니다: {(rawDataQuery.error as Error).message}
                                </div>
                            ) : rawDataQuery.data ? (
                                <DatasetSelector rawData={rawDataQuery.data} adminPassword={adminPassword} />
                            ) : (
                                <div className="text-gray-400 p-4">학교 이름을 입력하고 조회를 눌러주세요.</div>
                            )}
                        </div>
                    </div>
                )}

                {selectedMenu === "visit-restriction" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">방문제한 설정</h3>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            <VisitRestrictionSettings adminPassword={adminPassword} />
                        </div>
                    </div>
                )}

                {selectedMenu === "group-checker" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">그룹 확인기 / 오버라이드</h3>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            <GroupChecker adminPassword={adminPassword} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function RawTimetableViewer({ rawData }: { rawData: any }) {
    const [selectedProp, setSelectedProp] = useState<string>('');
    const [selectedGrade, setSelectedGrade] = useState<string>('1');
    const [selectedClassNum, setSelectedClassNum] = useState<string>('1');

    const dataKeys = Object.keys(rawData || {});
    // 모든 자료 속성을 포함하여 선택 가능하게 함
    const timetableProps = dataKeys.filter(k => k.startsWith('자료'));

    React.useEffect(() => {
        if (timetableProps.length > 0 && !selectedProp) {
            setSelectedProp(timetableProps[timetableProps.length - 1]);
        }
    }, [timetableProps, selectedProp]);

    if (!rawData) return null;

    let teacherKey = dataKeys.find(k => Array.isArray(rawData[k]) && rawData[k].some((s: any) => typeof s === 'string' && s.endsWith('*')));
    const keywords = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학", "체육", "음악", "미술", "진로", "운동", "독서", "문학"];
    let subjectKey = dataKeys.find(k => {
        const val = rawData[k];
        if (!Array.isArray(val)) return false;
        for (let i = 0; i < Math.min(val.length, 100); i++) {
            if (typeof val[i] === 'string' && keywords.some(kw => val[i].includes(kw))) return true;
        }
        return false;
    });

    if (!subjectKey) {
        const stringArrays = dataKeys.filter(k => k !== teacherKey && Array.isArray(rawData[k]) && typeof rawData[k][0] === 'string');
        stringArrays.sort((a, b) => rawData[b].length - rawData[a].length);
        if (stringArrays.length > 0) subjectKey = stringArrays[0];
    }

    const bunri = rawData['분리'] !== undefined ? rawData['분리'] : 100;
    const teachers = teacherKey ? rawData[teacherKey] : [];
    const subjects = subjectKey ? rawData[subjectKey] : [];

    const renderCell = (code: number) => {
        if (!code || code === 0) return "-";

        // Use the exact parsing logic from Cloudflare/local parser
        let teacherCode: number;
        let subjectCode: number;
        if (bunri === 100) {
            teacherCode = Math.floor(code / bunri);
            subjectCode = code % bunri;
        } else { // bunri === 1000 or other
            teacherCode = code % bunri;
            subjectCode = Math.floor(code / bunri);
        }

        const teacherStr = teachers[teacherCode] || teacherCode;
        const subjectStr = subjects[subjectCode] || subjectCode;

        // Strip trailing asterisks and underscores exactly like the parser does
        const cleanTeacherStr = typeof teacherStr === 'string' ? teacherStr.replace(/\*$/, '') : teacherStr;
        const cleanSubjectStr = typeof subjectStr === 'string' ? subjectStr.replace(/_/g, '') : subjectStr;

        return (
            <div className="flex flex-col items-center justify-center text-xs p-1">
                <span className="font-bold text-blue-700">{cleanSubjectStr}</span>
                <span className="text-gray-500">{cleanTeacherStr}</span>
                <span className="text-[10px] text-gray-300 mt-1">({code})</span>
            </div>
        );
    };

    const scheduleData = selectedProp ? rawData[selectedProp] : null;
    const gradeData = scheduleData ? scheduleData[Number(selectedGrade)] : null;
    const classData = gradeData ? gradeData[Number(selectedClassNum)] : null;

    // 해당 속성이 시간표 구조(3차원 배열)인지 판별
    const isTimetableProp = scheduleData && Array.isArray(scheduleData) && scheduleData[1] && scheduleData[1][1] && Array.isArray(scheduleData[1][1]);

    const weekdays = ["월", "화", "수", "목", "금"];

    return (
        <div className="flex flex-col gap-4 bg-white p-4 rounded-md border text-black shadow-sm">
            <div className="flex flex-wrap gap-4 items-center mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">시간표 속성:</span>
                    <Select value={selectedProp} onValueChange={setSelectedProp}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="속성" />
                        </SelectTrigger>
                        <SelectContent>
                            {timetableProps.map(prop => (
                                <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">학년:</span>
                    <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                        <SelectTrigger className="w-[80px]">
                            <SelectValue placeholder="학년" />
                        </SelectTrigger>
                        <SelectContent>
                            {[1, 2, 3].map(g => (
                                <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">반:</span>
                    <Select value={selectedClassNum} onValueChange={setSelectedClassNum}>
                        <SelectTrigger className="w-[80px]">
                            <SelectValue placeholder="반" />
                        </SelectTrigger>
                        <SelectContent>
                            {Array.from({ length: 15 }, (_, i) => i + 1).map(c => (
                                <SelectItem key={c} value={String(c)}>{c}반</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="border border-slate-200 rounded-md overflow-hidden">
                {!isTimetableProp ? (
                    <div className="p-4 bg-slate-50 text-slate-800 font-mono text-xs overflow-auto max-h-96 whitespace-pre-wrap break-all">
                        {JSON.stringify(scheduleData, null, 2)}
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-16 text-center border-r font-bold text-slate-700">교시</TableHead>
                                {weekdays.map(day => (
                                    <TableHead key={day} className="text-center border-r last:border-0 font-bold text-slate-700">{day}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!classData ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-32 text-slate-400">
                                        해당 학년/반 데이터가 없습니다. 속성이나 반을 변경해주세요.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                Array.from({ length: 7 }, (_, i) => i + 1).map(period => (
                                    <TableRow key={period} className="hover:bg-slate-50">
                                        <TableCell className="text-center font-bold bg-slate-50 border-r text-slate-700">
                                            {period}
                                        </TableCell>
                                        {weekdays.map((day, i) => {
                                            const weekdayIndex = i + 1;
                                            const dayData = classData[weekdayIndex];
                                            const code = dayData && dayData.length > period ? dayData[period] : 0;

                                            return (
                                                <TableCell key={day} className="text-center p-0 border-r last:border-0 align-middle">
                                                    {renderCell(code)}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            <div className="mt-4 border-t pt-4">
                <h4 className="text-sm font-bold mb-2">원시 JSON 구조 (Raw Data)</h4>
                <div className="h-64 overflow-auto bg-slate-950 text-green-400 p-4 rounded-md font-mono text-xs shadow-inner">
                    <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(rawData, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );
}

export default function Admin() {
    const [password, setPassword] = useState("");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [userIp, setUserIp] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState("24h");
    const queryClient = useQueryClient();

    // Factory Reset State
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [resetConfirmation, setResetConfirmation] = useState("");
    const [isResetting, setIsResetting] = useState(false);
    const TARGET_PHRASE = "햇빛이 선명하게 나뭇잎을 핥고 있었다";

    const handleFactoryReset = async () => {
        if (resetConfirmation !== TARGET_PHRASE) {
            toast.error("확인 문구가 일치하지 않습니다.");
            return;
        }

        if (!confirm("정말로 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            return;
        }

        setIsResetting(true);

        try {
            const res = await fetch("/api/admin/reset_db", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": password
                },
                body: JSON.stringify({ confirmation: resetConfirmation })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Reset failed");
            }

            toast.success("초기화 완료. 메인 페이지로 이동합니다.");

            // Clear Cookies
            document.cookie.split(";").forEach((c) => {
                document.cookie = c
                    .replace(/^ +/, "")
                    .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });

            // Redirect
            setTimeout(() => {
                window.location.href = "/";
            }, 1000);

        } catch (error: any) {
            toast.error(error.message);
            setIsResetting(false);
        }
    };

    useEffect(() => {
        fetch('/api/my-ip')
            .then(res => res.json())
            .then(data => setUserIp(data.ip))
            .catch(() => setUserIp(null));
    }, []);

    // --- Authentication ---
    // --- Authentication ---
    // Password persistence removed for security

    const checkPasswordMutation = useMutation({
        mutationFn: async (password: string) => {
            const res = await fetch("/api/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                return true;
            } else {
                throw new Error(data.message || data.error || "Invalid password");
            }
        },
        onSuccess: () => {
            setIsAuthenticated(true);
            toast.success("관리자 로그인 성공");

            // Background DB Migration/Sync
            fetch("/api/admin/migrate_db", {
                headers: { "X-Admin-Password": password }
            }).catch(console.error);
        },
        onError: (error: Error) => {
            toast.error(error.message || "로그인 실패");
            setPassword("");
        },
    });

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        checkPasswordMutation.mutate(password);
    };

    // --- Assessment Management ---
    const [selectedAssessments, setSelectedAssessments] = useState<number[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<IPProfile | null>(null);
    const [selectedIp, setSelectedIp] = useState<string | null>(null);
    const [isOthersExpanded, setIsOthersExpanded] = useState(false);

    const { data: assessments } = useQuery({
        queryKey: ["admin", "assessments"],
        queryFn: async () => {
            const res = await fetch("/api/admin/assessments", {
                headers: { "X-Admin-Password": password },
            });
            if (!res.ok) throw new Error("Failed to fetch assessments");
            return res.json();
        },
        enabled: isAuthenticated,
        refetchInterval: 5000,
    });

    const deleteAssessmentsMutation = useMutation({
        mutationFn: async (ids: number[]) => {
            const res = await fetch("/api/admin/assessments", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": password,
                },
                body: JSON.stringify({ ids }),
            });
            if (!res.ok) throw new Error("Failed to delete assessments");
            return res.json();
        },
        onSuccess: () => {
            toast.success("수행평가가 삭제되었습니다.");
            setSelectedAssessments([]);
            queryClient.invalidateQueries({ queryKey: ["admin", "assessments"] });
        },
        onError: () => toast.error("삭제 실패"),
    });

    // --- User Management ---
    const { data: userData } = useQuery({
        queryKey: ["admin", "users", timeRange],
        queryFn: async () => {
            const res = await fetch(`/api/admin/users?range=${timeRange}`, {
                headers: { "X-Admin-Password": password },
            });
            if (!res.ok) throw new Error("Failed to fetch users");
            return res.json() as Promise<{ activeUsers: any[], blockedUsers: any[] }>;
        },
        enabled: isAuthenticated,
        refetchInterval: 5000,
    });

    const blockUserMutation = useMutation({
        mutationFn: async ({ identifier, type, reason }: { identifier: string, type: string, reason?: string }) => {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": password,
                },
                body: JSON.stringify({ identifier, type, reason }),
            });
            if (!res.ok) throw new Error("Failed to block user");
            return res.json();
        },
        onSuccess: () => {
            toast.success("사용자가 차단되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        },
        onError: () => toast.error("차단 실패"),
    });

    const unblockUserMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": password,
                },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error("Failed to unblock user");
            return res.json();
        },
        onSuccess: () => {
            toast.success("차단이 해제되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        },

        onError: () => toast.error("해제 실패"),
    });



    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <Card className="w-full max-w-md shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl text-center flex items-center justify-center gap-2">
                            <Lock className="h-6 w-6" />
                            관리사무소
                        </CardTitle>
                        <CardDescription className="text-center">
                            관리자 암호를 입력하세요
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="암호"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-gray-500" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-gray-500" />
                                    )}
                                    <span className="sr-only">
                                        {showPassword ? "암호 숨기기" : "암호 보기"}
                                    </span>
                                </Button>
                            </div>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={checkPasswordMutation.isPending}
                            >
                                {checkPasswordMutation.isPending ? "확인 중..." : "입장하기"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container max-w-6xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <Settings className="h-6 w-6 md:h-8 md:w-8 text-gray-700" />
                    <h1 className="text-2xl md:text-3xl font-bold">관리사무소</h1>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="ml-4"

                        onClick={() => setIsResetDialogOpen(true)}
                    >
                        <TriangleAlert className="h-4 w-4 mr-2" />
                        <span className="hidden md:inline">DB 초기화</span>
                        <span className="md:hidden">초기화</span>
                    </Button>
                </div>
                {userIp && (
                    <div className="self-end md:self-auto flex items-center gap-2 text-xs md:text-sm text-gray-500 font-mono bg-gray-50 px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-gray-200">
                        <span className="text-gray-400">현재 IP:</span>
                        <span className="font-bold text-gray-700">{userIp}</span>
                    </div>
                )}
            </div>

            <Tabs defaultValue="assessments" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-8 h-auto">
                    <TabsTrigger value="assessments">등록된 수행평가</TabsTrigger>
                    <TabsTrigger value="users">사용자 관리</TabsTrigger>
                    <TabsTrigger value="electives">선택과목</TabsTrigger>
                    <TabsTrigger
                        value="database"
                        className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800"
                    >
                        DB 관리
                    </TabsTrigger>
                    <TabsTrigger
                        value="datatransfer"
                        className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800"
                    >
                        데이터 출입
                    </TabsTrigger>
                    <TabsTrigger
                        value="manualplan"
                        className="data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800"
                    >
                        학기별 계획
                    </TabsTrigger>
                    <TabsTrigger
                        value="etc"
                    >
                        기타
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="assessments">
                    {/* ... existing assessments content ... */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>수행평가 목록</CardTitle>
                                <CardDescription>
                                    등록된 모든 수행평가를 확인하고 일괄 삭제할 수 있습니다.
                                </CardDescription>
                            </div>
                            {selectedAssessments.length > 0 && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                        if (confirm(`${selectedAssessments.length}개의 항목을 삭제하시겠습니까?`)) {
                                            deleteAssessmentsMutation.mutate(selectedAssessments);
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    선택 삭제 ({selectedAssessments.length})
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px] text-center">
                                                <Checkbox
                                                    checked={assessments?.length > 0 && selectedAssessments.length === assessments.length}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedAssessments(assessments.map((a: any) => a.id));
                                                        } else {
                                                            setSelectedAssessments([]);
                                                        }
                                                    }}
                                                />
                                            </TableHead>
                                            <TableHead className="w-[80px] text-center">학년</TableHead>
                                            <TableHead className="w-[80px] text-center">반</TableHead>
                                            <TableHead>과목</TableHead>
                                            <TableHead>제목</TableHead>
                                            <TableHead className="w-[120px]">마감일</TableHead>
                                            <TableHead className="w-[120px]">수정 IP</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {assessments?.map((assessment: any) => (
                                            <TableRow key={assessment.id}>
                                                <TableCell className="text-center">
                                                    <Checkbox
                                                        checked={selectedAssessments.includes(assessment.id)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedAssessments([...selectedAssessments, assessment.id]);
                                                            } else {
                                                                setSelectedAssessments(selectedAssessments.filter((id) => id !== assessment.id));
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-center font-bold">{assessment.grade}</TableCell>
                                                <TableCell className="text-center">{assessment.classNum}</TableCell>
                                                <TableCell>{assessment.subject}</TableCell>
                                                <TableCell>{assessment.title}</TableCell>
                                                <TableCell>{assessment.dueDate}</TableCell>
                                                <TableCell className="text-xs font-mono text-gray-500">
                                                    {assessment.lastModifiedIp || '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(!assessments || assessments.length === 0) && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center">
                                                    등록된 수행평가가 없습니다.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="users">
                    {/* ... existing users content ... */}
                    <div className="grid gap-6">
                        <div className="flex justify-end">
                            <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="기간 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="24h">최근 24시간</SelectItem>
                                    <SelectItem value="7d">최근 1주일</SelectItem>
                                    <SelectItem value="all">전체 사용자</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Card>
                            <CardHeader>
                                <CardTitle>활성 사용자 ({timeRange === '24h' ? '최근 24시간' : timeRange === '7d' ? '최근 1주일' : '전체 사용자'})</CardTitle>
                                <CardDescription>
                                    최근 접속한 IP 및 카카오 계정 목록입니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    // Helper to classify users
                                    const isKnownUser = (user: IPProfile) => {
                                        // 1. Check User Agent
                                        if (!user.recentUserAgents || user.recentUserAgents.length === 0) return false;
                                        const knownKeywords = ['Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Whale', 'Kakao', 'iPhone', 'Android'];
                                        const hasKnownUA = user.recentUserAgents.some(ua => knownKeywords.some(keyword => ua.includes(keyword)));

                                        // 2. Check Grade/Class (Must be present per user request)
                                        const hasInfo = !!(user.grade && user.classNum);

                                        return hasKnownUA && hasInfo;
                                    };

                                    const activeUsers = userData?.activeUsers || [];
                                    const knownUsers = activeUsers.filter(isKnownUser);
                                    const unknownUsers = activeUsers.filter((u: any) => !isKnownUser(u));

                                    const UserRow = ({ user }: { user: IPProfile }) => (
                                        <TableRow key={user.ip}>
                                            <TableCell className="font-mono">
                                                <Button
                                                    variant="link"
                                                    className="p-0 h-auto font-mono text-blue-600 hover:text-blue-800 underline decoration-dotted"
                                                    onClick={() => setSelectedProfile(user)}
                                                >
                                                    {user.ip}
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                {user.grade && user.classNum ? (
                                                    <Badge variant="outline" className="font-mono text-green-600 border-green-200 bg-green-50">
                                                        {user.grade}-{user.classNum}{user.studentNumber ? `-${user.studentNumber}` : ''}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-gray-300 text-xs">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    {user.kakaoAccounts && user.kakaoAccounts.length > 0 ? (
                                                        user.kakaoAccounts.map((k, i) => (
                                                            <span key={i} className="font-bold text-xs">{k.kakaoNickname}</span>
                                                        ))
                                                    ) : (
                                                        <span className="text-gray-400 text-xs">-</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {user.modificationCount > 0 ? (
                                                    <Badge variant="secondary" className="font-mono">
                                                        {user.modificationCount}회
                                                    </Badge>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{user.lastAccess ? new Date(user.lastAccess).toLocaleString() : '-'}</TableCell>

                                            <TableCell>
                                                {user.kakaoAccounts && user.kakaoAccounts.length > 0 ? (
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-purple-500 hover:text-purple-600 hover:bg-purple-50"
                                                            onClick={async () => {
                                                                if (!confirm("이 사용자에게 '수행평가 알림' 캘린더 일정을 등록하시겠습니까?\n(1분 후 시작, 10분간 지속, 즉시 알림)")) return;

                                                                const targetKakaoId = user.kakaoAccounts![0].kakaoId;
                                                                try {
                                                                    const response = await fetch('/api/admin/users/calendar', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                            'X-Admin-Password': password
                                                                        },
                                                                        body: JSON.stringify({
                                                                            kakaoId: targetKakaoId,
                                                                            title: "🔔 수행평가 확인 알림",
                                                                            description: "관리자가 보낸 수행평가 확인 알림입니다."
                                                                        })
                                                                    });
                                                                    const data = await response.json();
                                                                    if (response.ok && data.success) {
                                                                        alert('캘린더 일정이 등록되었습니다. (카카오톡 알림 발송됨)');
                                                                    } else {
                                                                        const errorMessage = data.error || data.message || JSON.stringify(data);
                                                                        const errorDetails = data.details ? `\n상세: ${JSON.stringify(data.details)}` : '';
                                                                        alert(`실패: ${errorMessage}${errorDetails}`);
                                                                    }
                                                                } catch (error: any) {
                                                                    const msg = error instanceof Error ? error.message : String(error);
                                                                    alert(`오류 발생: ${msg}`);
                                                                    console.error(error);
                                                                }
                                                            }}
                                                        >
                                                            <Calendar className="h-4 w-4 mr-1" />
                                                            캘린더
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                                                            title="할 일(Task) 등록"
                                                            onClick={async () => {
                                                                if (!confirm("이 사용자에게 '수행평가 태스크'를 등록하시겠습니까?\n(내일 오전 9시 알림 설정됨)")) return;

                                                                const targetKakaoId = user.kakaoAccounts![0].kakaoId;
                                                                try {
                                                                    const response = await fetch('/api/admin/users/task', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                            'X-Admin-Password': password
                                                                        },
                                                                        body: JSON.stringify({
                                                                            kakaoId: targetKakaoId,
                                                                            title: "🔔 수행평가 할 일 체크",
                                                                            description: "관리자 할 일(Task) 등록 테스트"
                                                                        })
                                                                    });
                                                                    const data = await response.json();
                                                                    if (response.ok && data.success) {
                                                                        alert('태스크(할 일)가 등록되었습니다.');
                                                                    } else {
                                                                        const errorMessage = data.error || data.message || JSON.stringify(data);
                                                                        const errorDetails = data.details ? `\n상세: ${JSON.stringify(data.details)}` : '';
                                                                        alert(`실패: ${errorMessage}${errorDetails}`);
                                                                    }
                                                                } catch (error: any) {
                                                                    const msg = error instanceof Error ? error.message : String(error);
                                                                    alert(`오류 발생: ${msg}`);
                                                                    console.error(error);
                                                                }
                                                            }}
                                                        >
                                                            <CheckSquare className="h-4 w-4 mr-1" />
                                                            태스크
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                                                            onClick={async () => {
                                                                const message = prompt("전송할 메시지를 입력하세요:");
                                                                if (!message) return;
                                                                const targetKakaoId = user.kakaoAccounts![0].kakaoId;

                                                                try {
                                                                    const response = await fetch('/api/admin/users/notify', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                            'X-Admin-Password': password
                                                                        },
                                                                        body: JSON.stringify({
                                                                            ip: user.ip,
                                                                            kakaoId: targetKakaoId,
                                                                            message
                                                                        })
                                                                    });
                                                                    const data = await response.json();
                                                                    if (data.success) {
                                                                        alert('알림이 전송되었습니다 (개발중)');
                                                                    } else {
                                                                        alert('알림 전송에 실패했습니다: ' + data.error);
                                                                    }
                                                                } catch (error) {
                                                                    alert('알림 전송 중 오류가 발생했습니다.');
                                                                }
                                                            }}
                                                        >
                                                            📱 알림
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {user.isBlocked ? (
                                                    <Badge variant="destructive">차단됨</Badge>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                        onClick={() => {
                                                            if (confirm(`IP ${user.ip}를 차단하시겠습니까?`)) {
                                                                blockUserMutation.mutate({ identifier: user.ip, type: 'IP' });
                                                            }
                                                        }}
                                                    >
                                                        <Ban className="h-4 w-4 mr-1" />
                                                        차단
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );

                                    return (
                                        <div className="space-y-6">
                                            {/* Known Users */}
                                            <div className="rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>IP 주소</TableHead>
                                                            <TableHead className="w-[100px]">학년/반/번호</TableHead>
                                                            <TableHead>카카오 계정</TableHead>
                                                            <TableHead>수정 횟수</TableHead>
                                                            <TableHead>마지막 접속</TableHead>
                                                            <TableHead className="w-[100px]">알림</TableHead>
                                                            <TableHead className="w-[100px]">관리</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {knownUsers.map((user: IPProfile, idx: number) => (
                                                            <UserRow key={idx} user={user} />
                                                        ))}
                                                        {knownUsers.length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                                                                    일반 접속 기록이 없습니다.
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            {/* Unknown/Others Section */}
                                            {unknownUsers.length > 0 && (
                                                <div className="border rounded-md overflow-hidden">
                                                    <div
                                                        className="flex items-center justify-between p-4 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                                                        onClick={() => setIsOthersExpanded(!isOthersExpanded)}
                                                    >
                                                        <div className="flex items-center gap-2 font-semibold text-gray-700">
                                                            {isOthersExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                                                            기타 접속 ({unknownUsers.length})
                                                        </div>
                                                        <span className="text-xs text-gray-500">
                                                            학년/반 미기입 또는 브라우저 불분명
                                                        </span>
                                                    </div>

                                                    {isOthersExpanded && (
                                                        <div className="bg-gray-50 border-t">
                                                            <Table>
                                                                <TableBody>
                                                                    {unknownUsers.map((user: IPProfile, idx: number) => (
                                                                        <UserRow key={idx} user={user} />
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>차단된 사용자 목록</CardTitle>
                                <CardDescription>
                                    현재 차단 중인 대상입니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>대상 (IP/ID)</TableHead>
                                                <TableHead>사유</TableHead>
                                                <TableHead>차단 일시</TableHead>
                                                <TableHead className="w-[100px]">관리</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {userData?.blockedUsers?.map((blocked: any) => (
                                                <TableRow key={blocked.id}>
                                                    <TableCell className="font-mono">
                                                        {blocked.identifier}
                                                        <Badge variant="outline" className="ml-2 text-[10px]">{blocked.type}</Badge>
                                                    </TableCell>
                                                    <TableCell>{blocked.reason}</TableCell>
                                                    <TableCell>{new Date(blocked.createdAt).toLocaleString()}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                            onClick={() => {
                                                                if (confirm("차단을 해제하시겠습니까?")) {
                                                                    unblockUserMutation.mutate(blocked.id);
                                                                }
                                                            }}
                                                        >
                                                            <ShieldCheck className="h-4 w-4 mr-1" />
                                                            해제
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {(!userData?.blockedUsers || userData.blockedUsers.length === 0) && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="h-24 text-center text-gray-500">
                                                        차단된 사용자가 없습니다.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                            </CardContent>
                        </Card>

                    </div>
                </TabsContent>

                <TabsContent value="electives" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>선택과목 관리</CardTitle>
                            <CardDescription>
                                2, 3학년 선택과목의 반 코드(A, B, C...)와 선생님 성함을 관리합니다.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ElectiveManager password={password} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="database" className="space-y-6">
                    <DatabaseManager adminPassword={password} />
                </TabsContent>

                <TabsContent value="datatransfer" className="space-y-6">
                    <DataTransferManager adminPassword={password} />
                </TabsContent>

                <TabsContent value="manualplan" className="space-y-6">
                    <ManualSemesterPlan adminPassword={password} />
                </TabsContent>

                <TabsContent value="etc" className="space-y-6">
                    <EtcManager adminPassword={password} />
                </TabsContent>
            </Tabs>

            <IPProfileViewer
                initialData={selectedProfile}
                isOpen={!!selectedProfile}
                onClose={() => setSelectedProfile(null)}
                adminPassword={password}
            />

            {/* Factory Reset Dialog */}
            <Dialog open={isResetDialogOpen} onOpenChange={(open) => {
                setIsResetDialogOpen(open);
                if (!open) setResetConfirmation("");
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600 font-bold flex items-center gap-2">
                            <TriangleAlert className="h-5 w-5" />
                            데이터베이스 초기화
                        </DialogTitle>
                        <DialogDescription>
                            모든 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                            <br />
                            확인을 위해 아래 문구를 정확히 입력하세요:
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-gray-50 border rounded-md text-center font-bold text-sm select-none">
                            {TARGET_PHRASE}
                        </div>
                        <Input
                            value={resetConfirmation}
                            onChange={(e) => setResetConfirmation(e.target.value)}
                            placeholder="위 문구를 입력하세요"
                            className="text-center"
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsResetDialogOpen(false)}>취소</Button>
                        <Button
                            variant="destructive"
                            onClick={handleFactoryReset}
                            disabled={resetConfirmation !== TARGET_PHRASE || isResetting}
                        >
                            {isResetting ? "초기화 중..." : "초기화 실행"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DatasetSelector({ rawData, adminPassword }: { rawData: any; adminPassword: string }) {
    const queryClient = useQueryClient();
    const [selectedProp, setSelectedProp] = useState<string>('');

    // Fetch current setting
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", {
                headers: {
                    "X-Admin-Password": adminPassword
                }
            });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        }
    });

    useEffect(() => {
        if (settingsQuery.data) {
            setSelectedProp(settingsQuery.data.comcigan_dataset_selected || '');
        }
    }, [settingsQuery.data]);

    const saveMutation = useMutation({
        mutationFn: async (newData: any) => {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword
                },
                body: JSON.stringify(newData)
            });
            if (!res.ok) throw new Error("Failed to save settings");
            return res.json();
        },
        onSuccess: () => {
            toast.success("설정이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
        },
        onError: (err) => {
            toast.error(`저장 실패: ${err.message}`);
        }
    });

    if (settingsQuery.isLoading) return <div className="p-4">설정을 불러오는 중...</div>;

    // Available timetable datasets
    const keys = Object.keys(rawData);
    const timetableProps = keys.filter(k => {
        const val = rawData[k];
        return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]);
    });

    const handleSave = () => {
        saveMutation.mutate({ comcigan_dataset_selected: selectedProp });
    };

    const handleCancel = () => {
        setSelectedProp(settingsQuery.data?.comcigan_dataset_selected || '');
    };

    // To allow selecting an empty string (auto), we use a special value in SelectItem
    // because Shadcn UI Select doesn't always handle empty string values gracefully.
    // We'll use "_auto_" instead of "" for the internal state.
    const displayValue = selectedProp || "_auto_";

    const handleValueChange = (val: string) => {
        if (val === "_auto_") {
            setSelectedProp('');
        } else {
            setSelectedProp(val);
        }
    };

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader>
                <CardTitle>출처 데이터셋 선택</CardTitle>
                <CardDescription>
                    메인 화면의 시간표에서 출력할 원본 데이터셋을 선택합니다.
                    "자동"으로 설정할 경우 가장 최신 데이터셋을 자동으로 선택합니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium">데이터셋</label>
                    <Select value={displayValue} onValueChange={handleValueChange}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="자동 (최신 유효 데이터셋)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_auto_">자동 (최신 데이터셋)</SelectItem>
                            <SelectItem value="MANUAL_PLAN">MANUAL_PLAN (학기별 계획 수동 입력)</SelectItem>
                            {timetableProps.map(prop => (
                                <SelectItem key={prop} value={prop}>
                                    {prop}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={saveMutation.isPending}>
                        변경 취소
                    </Button>
                    <Button onClick={handleSave} disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? "저장 중..." : "저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function AutoFillElectivesView({ adminPassword, onBack, currentPlan }: { adminPassword: string, onBack: () => void, currentPlan: any }) {
    const { grade } = currentPlan;
    const queryClient = useQueryClient();
    const [selectedDataset, setSelectedDataset] = useState<string>('');

    // Fetch current setting to determine default
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", { headers: { "X-Admin-Password": adminPassword } });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        }
    });

    useEffect(() => {
        if (settingsQuery.data) {
            const current = settingsQuery.data.comcigan_dataset_selected;
            if (current) {
                setSelectedDataset(current);
            }
        }
    }, [settingsQuery.data]);

    const displayDataset = selectedDataset || "_auto_";
    const handleDatasetChange = (val: string) => {
        setSelectedDataset(val === "_auto_" ? "" : val);
    };

    // Fetch raw comcigan to build the dataset list
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

    const timetableProps = React.useMemo(() => {
        if (!rawDataQuery.data) return [];
        return Object.keys(rawDataQuery.data).filter((k: string) => {
            const val = rawDataQuery.data[k];
            return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]);
        });
    }, [rawDataQuery.data]);

    // 1. Fetch Live Subjects from Comcigan
    const liveSubjectsQuery = useQuery({
        queryKey: ["admin", "comcigan-subjects", grade, selectedDataset],
        queryFn: async () => {
            const res = await fetch(`/api/admin/comcigan-subjects?grade=${grade}&dataset=${selectedDataset}`);
            if (!res.ok) throw new Error("Failed to fetch live subjects");
            return res.json();
        }
    });

    // 2. Algorithm to analyze manual plan and map subjects to predefined groups
    const analysis = React.useMemo(() => {
        let warnings: string[] = [];
        let manualSubjects = new Set<string>();

        const periodMap: Record<string, { classNum: number, subject: string }[]> = {};
        let maxClassNum = 0;

        Object.keys(currentPlan.timetables || {}).forEach(classKey => {
            const [g, c] = classKey.split('-');
            if (parseInt(g) !== grade) return;
            const classNum = parseInt(c);
            if (classNum > maxClassNum) maxClassNum = classNum;

            const tt = currentPlan.timetables[classKey];
            Object.keys(tt).forEach(timeKey => {
                const subject = tt[timeKey];
                if (subject) {
                    if (!periodMap[timeKey]) periodMap[timeKey] = [];
                    periodMap[timeKey].push({ classNum, subject });
                    manualSubjects.add(subject);
                }
            });
        });

        const subjectToBlocks = new Map<string, Set<string>>();
        const blockToOccurrences = new Map<string, string[]>();

        Object.keys(periodMap).forEach(timeKey => {
            const classesInPeriod = periodMap[timeKey];
            const uniqueSubjsInPeriod = new Set(classesInPeriod.map(c => c.subject));

            // Look up the explicit group from the currentPlan.groups for this timeKey
            const explicitGroup = currentPlan.groups?.[String(grade)]?.[timeKey];

            if (explicitGroup && explicitGroup !== "학년공강") {
                // Associate all subjects in this period with this block
                uniqueSubjsInPeriod.forEach(subj => {
                    if (!subjectToBlocks.has(subj)) subjectToBlocks.set(subj, new Set());
                    subjectToBlocks.get(subj)!.add(explicitGroup);
                });

                if (!blockToOccurrences.has(explicitGroup)) {
                    blockToOccurrences.set(explicitGroup, []);
                }
                const timeStr = `${['월', '화', '수', '목', '금'][parseInt(timeKey.split('-')[0])]}${timeKey.split('-')[1]}교시`;
                if (!blockToOccurrences.get(explicitGroup)!.includes(timeStr)) {
                    blockToOccurrences.get(explicitGroup)!.push(timeStr);
                }
            } else if (!explicitGroup && uniqueSubjsInPeriod.size > 1) {
                // If there are multiple subjects but no explicit block assigned
                const timeStr = `${['월', '화', '수', '목', '금'][parseInt(timeKey.split('-')[0])]}${timeKey.split('-')[1]}교시`;
                const msg = `[${timeStr}] 다중 과목이 있는데 블록이 지정되지 않았습니다.`;
                if (!warnings.includes(msg)) warnings.push(msg);
            }
        });

        // Detect conflicts (a subject assigned to multiple blocks)
        subjectToBlocks.forEach((blocks, subj) => {
            if (blocks.size > 1) {
                warnings.push(`[${subj}] 과목이 여러 블록(${Array.from(blocks).join(', ')})에 중복 배정되었습니다.`);
            }
        });

        // Group the subjects by block for display
        const blocks: { code: string, subjects: Set<string>, occurrences: string[] }[] = [];
        const allBlocks = Array.from(blockToOccurrences.keys()).sort();

        allBlocks.forEach(code => {
            const subjsInBlock = new Set<string>();
            subjectToBlocks.forEach((bSet, subj) => {
                if (bSet.has(code)) subjsInBlock.add(subj);
            });
            blocks.push({
                code: code,
                subjects: subjsInBlock,
                occurrences: blockToOccurrences.get(code) || []
            });
        });

        const validManualSubjects = Array.from(manualSubjects).filter(subj => subjectToBlocks.has(subj)).sort();

        if (maxClassNum === 0 || validManualSubjects.length === 0) {
            warnings.push("학기별 계획에 등록된 선택과목이 없습니다 (블록이 지정된 과목 없음).");
        }

        return { blocks, manualSubjects: validManualSubjects, warnings, subjectToBlocks };
    }, [currentPlan, grade]);

    const [mappings, setMappings] = useState<Record<string, string>>({});

    // Auto-match subjects on load
    useEffect(() => {
        if (liveSubjectsQuery.data && analysis.manualSubjects.length > 0) {
            const initialMap: Record<string, string> = {};
            analysis.manualSubjects.forEach(mSubj => {
                const parts = mSubj.split(' ');
                let liveMatch = null;

                // Smart matching: try to find teacher name
                if (parts.length >= 2) {
                    const teacherName = parts[parts.length - 1];
                    const subjectKeyword = parts[0].replace(/^[A-Z]_/, ''); // remove prefix like A_

                    liveMatch = liveSubjectsQuery.data.find((ls: any) =>
                        ls.teacher === teacherName && ls.subject.includes(subjectKeyword)
                    );
                }

                // Fallback matching
                if (!liveMatch) {
                    liveMatch = liveSubjectsQuery.data.find((ls: any) => mSubj.includes(ls.teacher) && mSubj.includes(ls.subject));
                }

                if (liveMatch) {
                    initialMap[mSubj] = `${liveMatch.subject}-${liveMatch.teacher}`;
                }
            });
            setMappings(initialMap);
        }
    }, [liveSubjectsQuery.data, analysis.manualSubjects]);

    const executeMutation = useMutation({
        mutationFn: async () => {
            const payloads = [];
            for (const mSubj of analysis.manualSubjects) {
                const mappingKey = mappings[mSubj];
                if (!mappingKey) throw new Error(`${mSubj} 과목의 매핑이 누락되었습니다.`);

                const [subj, teacher] = mappingKey.split('-');
                const block = analysis.blocks.find(b => b.subjects.has(mSubj))?.code;
                if (!block) throw new Error(`${mSubj} 과목의 블록을 찾을 수 없습니다.`);

                payloads.push({
                    grade: grade,
                    subject: subj,
                    originalTeacher: teacher,
                    classCode: block,
                    isMovingClass: true,
                    isCombinedClass: false,
                    dataset: selectedDataset
                });
            }

            const promises = payloads.map(p => fetch("/api/admin/electives", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify(p)
            }));

            const results = await Promise.all(promises);
            for (const res of results) {
                if (!res.ok) throw new Error("전송 중 오류가 발생했습니다: " + res.statusText);
            }
        },
        onSuccess: () => {
            toast.success("선택과목 자동 채우기가 완료되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "electives"] });
            onBack();
        },
        onError: (err) => {
            toast.error(`실행 실패: ${err.message}`);
        }
    });

    return (
        <Card className="w-full border-orange-200 shadow-sm">
            <CardHeader className="bg-orange-50/50 border-b border-orange-100">
                <CardTitle className="text-orange-800 flex items-center gap-2">
                    <Wand2 className="w-5 h-5" />
                    선택과목 자동 채우기 ({grade}학년)
                </CardTitle>
                <CardDescription>
                    학기별 계획 데이터를 이용해 선택과목 DB를 자동으로 채웁니다. 수동으로 입력한 시간표에서 특정 시간에 동시에 열리는 과목들을 찾아 자동으로 A블록, B블록 등을 계산하고, 실제 라이브 데이터셋과 매핑하여 일괄 저장합니다.
                </CardDescription>
                <div className="mt-4 flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-700">대상 데이터셋:</span>
                    <Select value={displayDataset} onValueChange={handleDatasetChange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="자동 (현재 시간표)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_auto_">자동 (현재 시간표)</SelectItem>
                            <SelectItem value="MANUAL_PLAN">수동 시간표 (MANUAL_PLAN)</SelectItem>
                            {timetableProps.map((prop: string) => (
                                <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">

                {analysis.warnings.length > 0 && (
                    <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                        <div className="text-sm">
                            <p className="font-bold mb-1">경고</p>
                            <ul className="list-disc pl-4 space-y-1">
                                {analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border rounded-md p-4 bg-slate-50">
                        <h4 className="font-bold text-sm text-slate-700 mb-2">추출된 선택과목 그룹 (수동 버젼)</h4>
                        {analysis.blocks.length === 0 ? (
                            <p className="text-sm text-slate-500">감지된 그룹이 없습니다.</p>
                        ) : (
                            <ul className="space-y-3">
                                {analysis.blocks.map(b => (
                                    <li key={b.code} className="text-sm">
                                        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 mr-2">{b.code} 블록</Badge>
                                        <span className="text-slate-600">{Array.from(b.subjects).join(', ')}</span>
                                        <div className="text-xs text-slate-400 mt-1 pl-10">
                                            {b.occurrences.join(', ')}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="border rounded-md p-4 bg-slate-50 overflow-hidden flex flex-col">
                        <h4 className="font-bold text-sm text-slate-700 mb-2">라이브 과목 매핑</h4>
                        <div className="overflow-y-auto flex-1 pr-2">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>수동 과목</TableHead>
                                        <TableHead>자동매핑 (라이브)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysis.manualSubjects.map(mSubj => {
                                        const block = analysis.blocks.find(b => b.subjects.has(mSubj))?.code || "?";
                                        const isMapped = !!mappings[mSubj];

                                        return (
                                            <TableRow key={mSubj}>
                                                <TableCell className="text-sm p-2">
                                                    <div className="flex items-center gap-1">
                                                        <Badge variant="outline" className="text-[10px] px-1">{block}</Badge>
                                                        <span className="truncate max-w-[100px]" title={mSubj}>{mSubj}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="p-2">
                                                    <Select value={mappings[mSubj] || ""} onValueChange={(val) => setMappings({ ...mappings, [mSubj]: val })}>
                                                        <SelectTrigger className={`h-8 w-full bg-white text-xs ${!isMapped && 'border-red-300 ring-1 ring-red-100'}`}>
                                                            <SelectValue placeholder="매핑 선택..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {liveSubjectsQuery.data?.map((ls: any) => (
                                                                <SelectItem key={`${ls.subject}-${ls.teacher}`} value={`${ls.subject}-${ls.teacher}`} className="text-xs">
                                                                    {ls.subject} ({ls.teacher})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between gap-2 pt-4 border-t border-orange-100">
                    <Button variant="outline" onClick={onBack} disabled={executeMutation.isPending}>
                        취소 (뒤로가기)
                    </Button>
                    <Button
                        className="bg-orange-600 hover:bg-orange-700"
                        disabled={analysis.warnings.some(w => w.includes("중복") || w.includes("미확인")) || liveSubjectsQuery.isLoading || executeMutation.isPending || Object.values(mappings).some(v => !v) || Object.keys(mappings).length !== analysis.manualSubjects.length}
                        onClick={() => executeMutation.mutate()}
                    >
                        {executeMutation.isPending ? "저장 중..." : "1:1 매핑 후 DB 저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function ManualSemesterPlan({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [showAutoFill, setShowAutoFill] = useState(false);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [newSubject, setNewSubject] = useState("");
    const [grade, setGrade] = useState("2");
    const [classNum, setClassNum] = useState("1");

    // timetables structure: { "2-1": { "0-1": "과목 교사", "1-3": "..." }, "2-2": ... }
    const [timetables, setTimetables] = useState<Record<string, Record<string, string>>>({});
    // groups structure: { "2": { "0-1": "A", "1-3": "B", ... }, "3": ... } // (weekday 0-4, period 1-7)
    const [groups, setGroups] = useState<Record<string, Record<string, string>>>({ "2": {}, "3": {} });

    const settingsQuery = useQuery({
        queryKey: ["admin", "settings", "manualPlan"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", {
                headers: { "X-Admin-Password": adminPassword },
            });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        },
    });

    useEffect(() => {
        if (settingsQuery.data?.manual_semester_plan) {
            try {
                const data = JSON.parse(settingsQuery.data.manual_semester_plan);
                setSubjects(data.subjects || []);
                setTimetables(data.timetables || {});
                setGroups(data.groups || { "2": {}, "3": {} });
            } catch (e) {
                console.error("Failed to parse manual_semester_plan", e);
            }
        }
    }, [settingsQuery.data]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            // Save payload
            const payload = {
                manual_semester_plan: JSON.stringify({ subjects, timetables, groups })
            };

            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword,
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Failed to save settings");
            return res.json();
        },
        onSuccess: () => {
            toast.success("수동 학기별 계획이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
        },
        onError: (err) => {
            toast.error(`저장 실패: ${err.message}`);
        },
    });

    const addSubject = () => {
        if (!newSubject.trim()) return;
        if (subjects.includes(newSubject.trim())) {
            toast.error("이미 존재하는 과목입니다.");
            return;
        }
        setSubjects([...subjects, newSubject.trim()]);
        setNewSubject("");
    };

    const removeSubject = (subj: string) => {
        setSubjects(subjects.filter(s => s !== subj));
    };

    const handleTimetableChange = (weekday: number, period: number, subj: string) => {
        const classKey = `${grade}-${classNum}`;
        const prevClassTimetable = timetables[classKey] || {};

        const newTimetables = { ...timetables };
        if (subj === "") {
            // Remove entry
            const newClassTimetable = { ...prevClassTimetable };
            delete newClassTimetable[`${weekday}-${period}`];
            newTimetables[classKey] = newClassTimetable;
        } else {
            // Add or update entry
            newTimetables[classKey] = {
                ...prevClassTimetable,
                [`${weekday}-${period}`]: subj
            };
        }
        setTimetables(newTimetables);
    };

    const currentKey = `${grade}-${classNum}`;
    const currentTimetable = timetables[currentKey] || {};
    const weekdays = ['월', '화', '수', '목', '금'];

    const handleGroupChange = (weekday: number, period: number, val: string) => {
        setGroups(prev => {
            const next = { ...prev };
            const gradeGroups = { ...(next[grade] || {}) };
            const cellKey = `${weekday}-${period}`;

            if (val === "NONE" || val === "") {
                delete gradeGroups[cellKey];
            } else {
                gradeGroups[cellKey] = val;
            }

            next[grade] = gradeGroups;
            return next;
        });
    };

    if (showAutoFill) {
        return <AutoFillElectivesView adminPassword={adminPassword} onBack={() => setShowAutoFill(false)} currentPlan={{ subjects, timetables, groups, grade: parseInt(grade) }} />;
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>학기별 계획 (수동 시간표 기입기)</CardTitle>
                <CardDescription>
                    아직 컴시간 데이터셋이 서버에 반영되지 않았거나, 예비 수동 시간표를 작성할 때 사용합니다.
                    과목 목록을 먼저 정의한 후, 표에 기입할 수 있습니다.
                    이후 <b>출처 데이터셋 선택기</b>에서 MANUAL_PLAN 을 선택해야 실제로 표시됩니다.
                </CardDescription>

                <div className="flex justify-end pt-2">
                    <Select value={grade} onValueChange={setGrade}>
                        <SelectTrigger className="w-24 bg-white font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2">2학년</SelectItem>
                            <SelectItem value="3">3학년</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Elective Group Grid */}
                <div className="border border-orange-200 bg-orange-50/30 rounded-lg p-4 space-y-4">
                    <h3 className="font-bold text-orange-900 border-b pb-2 flex items-center gap-2">
                        <Grid2X2 className="w-4 h-4" />
                        선택과목 요일/교시별 블록(그룹) 지정 [{grade}학년]
                    </h3>
                    <p className="text-sm text-orange-800">
                        수동 시간표 작성 전, 요일별/교시별로 어떤 선택과목 그룹이 열리는지 미리 지정합니다.
                    </p>

                    <div className="border rounded-xl bg-white w-full overflow-x-auto shadow-inner text-sm p-4">
                        <div className="grid grid-cols-6 gap-2 w-[500px] min-w-max mx-auto">
                            <div className="font-bold text-center text-slate-500 rounded bg-slate-100 py-1">교시</div>
                            {weekdays.map(d => (
                                <div key={d} className="font-bold text-center text-slate-500 rounded bg-slate-100 py-1">{d}</div>
                            ))}

                            {[1, 2, 3, 4, 5, 6, 7].map(period => (
                                <React.Fragment key={`group-period-${period}`}>
                                    <div className="font-bold flex items-center justify-center bg-slate-50 rounded text-slate-500 h-[40px]">
                                        {period}
                                    </div>
                                    {[0, 1, 2, 3, 4].map(weekday => {
                                        const cellKey = `${weekday}-${period}`;
                                        const groupValue = groups[grade]?.[cellKey] || "";

                                        return (
                                            <div key={cellKey} className={`flex items-center justify-center p-1 rounded border shadow-sm h-[40px] transition-colors
                                                ${groupValue ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'}
                                            `}>
                                                <select
                                                    className={`w-full h-full text-xs text-center border-none bg-transparent outline-none cursor-pointer p-0 m-0 ${groupValue ? 'text-orange-700 font-bold' : 'text-slate-400'}`}
                                                    value={groupValue || "NONE"}
                                                    onChange={e => handleGroupChange(weekday, period, e.target.value)}
                                                >
                                                    <option value="NONE">-빈칸-</option>
                                                    <option value="학년공강">학년공강</option>
                                                    <option value="A">A 블록</option>
                                                    <option value="B">B 블록</option>
                                                    <option value="C">C 블록</option>
                                                    <option value="D">D 블록</option>
                                                    <option value="E">E 블록</option>
                                                    <option value="F">F 블록</option>
                                                    <option value="G">G 블록</option>
                                                    <option value="H">H 블록</option>
                                                    <option value="I">I 블록</option>
                                                </select>
                                            </div>
                                        )
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Subject Manager */}
                <div className="border border-purple-200 bg-purple-50/30 rounded-lg p-4 space-y-4">
                    <h3 className="font-bold text-purple-900 border-b pb-2 flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        과목 및 기입어 관리 [{grade}학년]
                    </h3>
                    <p className="text-sm text-purple-800">
                        과목명과 교사명을 띄어쓰기로 구분하여 입력하세요. (교사명은 생략 가능)
                    </p>

                    <div className="flex gap-2">
                        <Input
                            placeholder="예: 일본어 이소라 또는 물리 임아영 (그룹 기호 없이 입력)"
                            value={newSubject}
                            onChange={(e) => setNewSubject(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addSubject(); }}
                        />
                        <Button onClick={addSubject}>추가</Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {subjects.length === 0 && <span className="text-gray-400 text-sm">등록된 과목이 없습니다.</span>}
                        {subjects.map(subj => (
                            <Badge key={subj} variant="secondary" className="px-3 py-1 flex items-center gap-1 text-sm border bg-white shadow-sm">
                                {subj}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 ml-1 hover:bg-red-100 hover:text-red-500 rounded-full"
                                    onClick={() => removeSubject(subj)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Timetable Editor */}
                <div className="border border-blue-200 rounded-lg overflow-hidden">
                    <div className="bg-blue-50/50 p-4 border-b flex flex-wrap items-center gap-4">
                        <div className="font-bold flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            조회 및 수정
                        </div>
                        <div className="flex-1"></div>
                        <Select value={classNum} onValueChange={setClassNum}>
                            <SelectTrigger className="w-32 bg-white font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Array.from({ length: 15 }, (_, i) => i + 1).map(c => (
                                    <SelectItem key={c} value={String(c)}>{grade}학년 {c}반</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="p-4 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16 text-center border-r font-bold">교시</TableHead>
                                    {weekdays.map(day => (
                                        <TableHead key={day} className="text-center border-r min-w-[120px] font-bold">{day}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.from({ length: 7 }, (_, i) => i + 1).map(period => (
                                    <TableRow key={period}>
                                        <TableCell className="text-center font-bold bg-slate-50 border-r">{period}</TableCell>
                                        {Array.from({ length: 5 }, (_, i) => i).map(weekday => {
                                            const key = `${weekday}-${period}`;
                                            const currentVal = currentTimetable[key] || "";
                                            const groupInfo = groups[grade]?.[key];

                                            return (
                                                <TableCell key={weekday} className="p-1 border-r text-center align-middle relative h-[50px]">
                                                    {groupInfo && groupInfo !== "학년공강" && (
                                                        <div className="absolute top-1 left-1 bg-orange-100 text-orange-800 text-[9px] font-bold px-1 rounded shadow-sm z-10 pointer-events-none">
                                                            {groupInfo}
                                                        </div>
                                                    )}
                                                    {groupInfo === "학년공강" && (
                                                        <div className="absolute top-1 left-1 bg-gray-200 text-gray-500 text-[9px] font-bold px-1 rounded shadow-sm z-10 pointer-events-none">
                                                            학년공강
                                                        </div>
                                                    )}
                                                    <Select value={currentVal || "__EMPTY__"} onValueChange={(val) => handleTimetableChange(weekday, period, val === "__EMPTY__" ? "" : val)}>
                                                        <SelectTrigger className={`w-full h-full text-xs border-transparent hover:border-blue-300 transition-colors shadow-none pt-2 ${currentVal ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
                                                            <SelectValue placeholder="비어있음" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="__EMPTY__" className="text-slate-400">비어있음</SelectItem>
                                                            {subjects.map(subj => (
                                                                <SelectItem key={subj} value={subj}>
                                                                    {subj}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="flex justify-between gap-2 pt-4 border-t">
                    <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" onClick={() => setShowAutoFill(true)}>
                        <Wand2 className="w-4 h-4 mr-2" />
                        선택과목 자동 채우기
                    </Button>
                    <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? "저장 중..." : "수동 계획 전체 저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function VisitRestrictionSettings({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [restrictedGrades, setRestrictedGrades] = useState<number[]>([]);
    const [restrictionReason, setRestrictionReason] = useState("");
    const [ipWhitelist, setIpWhitelist] = useState("");
    const [kakaoLoginRestricted, setKakaoLoginRestricted] = useState(false);

    const settingsQuery = useQuery({
        queryKey: ["admin", "settings", "visitRestriction"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", {
                headers: { "X-Admin-Password": adminPassword },
            });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        },
    });

    const resetState = () => {
        if (settingsQuery.data) {
            try {
                const parsedGrades = settingsQuery.data.restricted_grades
                    ? JSON.parse(settingsQuery.data.restricted_grades)
                    : [];
                setRestrictedGrades(Array.isArray(parsedGrades) ? parsedGrades : []);
            } catch {
                setRestrictedGrades([]);
            }

            setRestrictionReason(
                settingsQuery.data.restriction_reason || "현재 해당 학년은 서비스 이용이 제한되어 있습니다."
            );

            setKakaoLoginRestricted(settingsQuery.data.kakao_login_restricted === 'true');

            try {
                const parsedIps = settingsQuery.data.ip_whitelist
                    ? JSON.parse(settingsQuery.data.ip_whitelist)
                    : [];
                setIpWhitelist(Array.isArray(parsedIps) ? parsedIps.join('\n') : "");
            } catch {
                setIpWhitelist("");
            }
        }
    };

    useEffect(() => {
        resetState();
    }, [settingsQuery.data]);

    const saveMutation = useMutation({
        mutationFn: async (newData: any) => {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword,
                },
                body: JSON.stringify(newData),
            });
            if (!res.ok) throw new Error("Failed to save settings");
            return res.json();
        },
        onSuccess: () => {
            toast.success("방문제한 설정이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
        },
        onError: (err) => {
            toast.error(`저장 실패: ${err.message}`);
        },
    });

    const handleSave = () => {
        const ips = ipWhitelist.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 0);
        saveMutation.mutate({
            restricted_grades: JSON.stringify(restrictedGrades),
            restriction_reason: restrictionReason,
            ip_whitelist: JSON.stringify(ips),
            kakao_login_restricted: String(kakaoLoginRestricted),
        });
    };

    const toggleGrade = (grade: number) => {
        if (restrictedGrades.includes(grade)) {
            setRestrictedGrades(restrictedGrades.filter(g => g !== grade));
        } else {
            setRestrictedGrades([...restrictedGrades, grade]);
        }
    };

    if (settingsQuery.isLoading) return <div className="p-4">설정을 불러오는 중...</div>;

    // Check if dirty
    const savedGradesStr = settingsQuery.data?.restricted_grades || "[]";
    const currentGradesStr = JSON.stringify(restrictedGrades.sort());
    const isGradesDirty = savedGradesStr !== currentGradesStr && !(savedGradesStr === "[]" && restrictedGrades.length === 0);

    const savedReason = settingsQuery.data?.restriction_reason || "현재 해당 학년은 서비스 이용이 제한되어 있습니다.";
    const isReasonDirty = savedReason !== restrictionReason;

    const savedKakaoRestricted = settingsQuery.data?.kakao_login_restricted === 'true';
    const isKakaoRestrictedDirty = savedKakaoRestricted !== kakaoLoginRestricted;

    let savedIpsStr = "";
    try {
        const parsed = settingsQuery.data?.ip_whitelist ? JSON.parse(settingsQuery.data.ip_whitelist) : [];
        savedIpsStr = Array.isArray(parsed) ? parsed.join('\n') : "";
    } catch { }
    const currentIpsNormalized = ipWhitelist.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 0).join('\n');
    const savedIpsNormalized = savedIpsStr.split('\n').map(r => r.trim()).filter(r => r.length > 0).join('\n');
    const isIpsDirty = currentIpsNormalized !== savedIpsNormalized;

    const isDirty = isGradesDirty || isReasonDirty || isKakaoRestrictedDirty || isIpsDirty;

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader>
                <CardTitle>방문제한 및 예외 IP 관리</CardTitle>
                <CardDescription>
                    특정 학년의 접속을 일시적으로 제한하고, 사유를 안내할 수 있습니다. 화이트리스트에 등록된 IP는 제한을 무시하고 접속할 수 있습니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-3">
                    <label className="text-sm font-medium">제한할 학년 선택</label>
                    <div className="flex gap-4">
                        {[1, 2, 3].map((grade) => (
                            <div key={grade} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`grade-${grade}`}
                                    checked={restrictedGrades.includes(grade)}
                                    onCheckedChange={() => toggleGrade(grade)}
                                />
                                <label
                                    htmlFor={`grade-${grade}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    {grade}학년
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">제한 사유 안내문구</label>
                    <Input
                        value={restrictionReason}
                        onChange={(e) => setRestrictionReason(e.target.value)}
                        placeholder="예: 2학기 시간표 업데이트 중입니다."
                    />
                    <p className="text-xs text-gray-500">
                        제한된 학년의 학생이 학번을 입력하면 시간표 대신 이 문구가 표시됩니다.
                    </p>
                </div>

                <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-bold">카카오 연동 제한</h4>
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="kakao-restrict"
                            checked={kakaoLoginRestricted}
                            onCheckedChange={(c) => setKakaoLoginRestricted(!!c)}
                        />
                        <label
                            htmlFor="kakao-restrict"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            카카오 로그인 연동 제한 (모든 학년 적용)
                        </label>
                    </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-100">
                    <label className="text-sm font-medium">IP 화이트리스트 (줄바꿈으로 구분)</label>
                    <Textarea
                        value={ipWhitelist}
                        onChange={(e) => setIpWhitelist(e.target.value)}
                        placeholder="192.168.1.100&#10;10.0.0.5"
                        rows={5}
                        className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500">
                        여기에 등록된 IP는 위에서 설정된 방문제한의 영향을 받지 않습니다. (예: 교내망 IP, 관리자 IP 등)
                    </p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={resetState} disabled={!isDirty || saveMutation.isPending}>
                        변경 취소
                    </Button>
                    <Button onClick={handleSave} disabled={!isDirty || saveMutation.isPending}>
                        {saveMutation.isPending ? "저장 중..." : "설정 저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
