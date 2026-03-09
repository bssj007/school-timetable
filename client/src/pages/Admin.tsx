import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    AlertCircle, Calendar, Edit2, Save, Trash2, Users, Download, Upload, Server, Database, Key, Check, ShieldAlert, ShieldCheck, Link2, Settings, ArrowUp, X,
    BookOpen, Eye, EyeOff, Lock, Search, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, GripVertical, CheckCircle2, Plus,
    TriangleAlert, CheckSquare, Ban, Wand2, Grid2X2, Info, ArrowRight, Bug, Palette, TrendingUp, ArrowUpDown
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { BridgeManager } from './AdminBridge';
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
        if (settingsQuery.data) {
            if (!selectedDataset) {
                setSelectedDataset('_auto_');
            }
        }
    }, [settingsQuery.data, selectedDataset]);

    useEffect(() => {
        if (!selectedDataset) return; // Wait until dataset is selected
        fetchData();
    }, [selectedGrade, selectedDataset]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            console.log("Fetching data for grade", selectedGrade);

            let targetDataset = selectedDataset === "_auto_" ? (settingsQuery.data?.comcigan_dataset_selected || "") : selectedDataset;
            if (!targetDataset && timetableProps && timetableProps.length > 0) {
                targetDataset = timetableProps[0];
            }

            // 1. Fetch Comcigan Subjects
            let comciganData = [];
            try {
                const comciganDataset = targetDataset === "MANUAL_PLAN" ? "SEMESTER_PLAN" : targetDataset;
                const comciganRes = await fetch(`/api/admin/comcigan-subjects?grade=${selectedGrade}&dataset=${comciganDataset}`);
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
                const configRes = await fetch(`/api/admin/electives?grade=${selectedGrade}&dataset=${targetDataset}`, {
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

            // Sort: Alphabetical (ㄱㄴㄷ) but push "빈교실", "공강", etc. to the bottom
            const FREE_KEYWORDS = ["빈교실", "공강", "창체", "자습", "동아리", "점심시간", "Empty", "Free"];
            merged.sort((a, b) => {
                const aFree = FREE_KEYWORDS.some(k => a.subject.trim().includes(k));
                const bFree = FREE_KEYWORDS.some(k => b.subject.trim().includes(k));

                if (aFree && !bFree) return 1;
                if (!aFree && bFree) return -1;

                return a.subject.localeCompare(b.subject, 'ko-KR');
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
            // Determine the actual dataset to save to
            let targetDataset = selectedDataset === "_auto_" ? (settingsQuery.data?.comcigan_dataset_selected || "") : selectedDataset;
            if (!targetDataset && timetableProps && timetableProps.length > 0) {
                targetDataset = timetableProps[0];
            }

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
                            dataset: targetDataset
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
        let targetDataset = selectedDataset === "_auto_" ? (settingsQuery.data?.comcigan_dataset_selected || "") : selectedDataset;
        if (!targetDataset && timetableProps && timetableProps.length > 0) {
            targetDataset = timetableProps[0];
        }

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
                    dataset: targetDataset
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

    let activeTimetable = settingsQuery.data?.comcigan_dataset_selected || "";
    if (!activeTimetable && timetableProps && timetableProps.length > 0) {
        activeTimetable = timetableProps[0];
    }
    const autoLabel = `자동 (현재: ${activeTimetable || '없음'})`;

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
                            onValueChange={(val) => setSelectedDataset(val)}
                        >
                            <SelectTrigger className="w-[160px] h-9">
                                <SelectValue placeholder="데이터셋 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="_auto_">{autoLabel}</SelectItem>
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

                <div className="flex-1 overflow-auto border rounded-md [&>div]:overflow-visible">
                    <Table className="w-full min-w-[900px] md:min-w-[1000px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px] md:w-[90px]">과목명</TableHead>
                                <TableHead className="w-[150px]">과목 풀네임</TableHead>
                                <TableHead className="w-[60px] md:w-[70px]">원래 쌤</TableHead>
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
                                    const subjectKeyword = ["빈교실", "공강", "창체", "자습", "동아리", "점심시간", "Empty", "Free"].filter(ex => item.subject.trim().includes(ex))[0];

                                    const matchedKeyword = subjectKeyword || null;
                                    const isFreePeriod = !!matchedKeyword;
                                    const isDeleted = Boolean(item.isDeleted);

                                    return (
                                        <TableRow
                                            key={`${item.subject}-${item.teacher}`}
                                            className={`${isFreePeriod ? "opacity-75 bg-gray-50/50" : ""} ${isDeleted ? "opacity-60 bg-red-50/30" : ""}`}
                                            onClick={() => {
                                                // Optional wrapper if we want clicking to still work
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
                                                    className={`max-w-[150px] ${isFreePeriod ? "pointer-events-none" : ""}`}
                                                    disabled={isFreePeriod || isDeleted}
                                                />
                                            </TableCell>
                                            <TableCell className={`text-gray-500 ${isDeleted ? "line-through text-red-400" : ""}`}>{item.teacher}</TableCell>
                                            <TableCell>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={`w-[130px] justify-between ${isFreePeriod ? "" : ""}`} // Allowed even if free period
                                                        >
                                                            <span className="truncate">
                                                                {item.classCode ? item.classCode.split(',').filter(Boolean).join(", ") : (isFreePeriod ? "분반 선택(공강)" : "선택")}
                                                            </span>
                                                            <ChevronDown className="h-4 w-4 opacity-70 shrink-0" />
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
                                                    value={item.fullTeacherName || ""}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(originalIndex, "fullTeacherName", e.target.value)}
                                                    placeholder="선생님 성함 입력"
                                                    className={`max-w-[200px] ${isFreePeriod ? "pointer-events-none" : ""}`}
                                                    disabled={isFreePeriod || isDeleted}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant={item.isMovingClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${item.isMovingClass ? "bg-blue-600 hover:bg-blue-700" : "text-gray-400"} ${isFreePeriod ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isMovingClass", true);
                                                        }}
                                                        disabled={isFreePeriod || isDeleted}
                                                    >
                                                        이동 O
                                                    </Button>
                                                    <Button
                                                        variant={!item.isMovingClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${!item.isMovingClass ? "bg-red-600 hover:bg-red-700" : "text-gray-400"} ${isFreePeriod ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isMovingClass", false);
                                                            handleInputChange(originalIndex, "className", "{}"); // clear className when turned off
                                                        }}
                                                        disabled={isFreePeriod || isDeleted}
                                                    >
                                                        이동 X
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    const isDisabled = !item.isMovingClass || isFreePeriod || isDeleted;
                                                    let classCodes = (item.classCode || "").split(",").filter(Boolean);

                                                    // Parse className JSON safely
                                                    let parsedClassNames: Record<string, string> = {};
                                                    if (item.className) {
                                                        try {
                                                            parsedClassNames = JSON.parse(item.className);
                                                        } catch (e) {
                                                            // Legacy string fallback - assign to all current groups
                                                            if (classCodes.length > 0) {
                                                                classCodes.forEach((code: string) => {
                                                                    parsedClassNames[code] = item.className;
                                                                });
                                                            } else {
                                                                parsedClassNames["_global"] = item.className;
                                                            }
                                                        }
                                                    }

                                                    const handleGroupClassNameChange = (groupCode: string, newValue: string) => {
                                                        const newParsed = { ...parsedClassNames, [groupCode]: newValue };
                                                        handleInputChange(originalIndex, "className", JSON.stringify(newParsed));
                                                    };

                                                    if (classCodes.length === 0) {
                                                        return (
                                                            <Input
                                                                value={parsedClassNames["_global"] || ""}
                                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleGroupClassNameChange("_global", e.target.value)}
                                                                placeholder="예: 1,2,3"
                                                                className={`max-w-[100px] ${isDisabled ? "bg-gray-100 pointer-events-none text-gray-400" : ""}`}
                                                                disabled={isDisabled}
                                                            />
                                                        );
                                                    }

                                                    return (
                                                        <div className="flex flex-col gap-1 w-full max-w-[120px]">
                                                            {classCodes.map((code: string) => (
                                                                <div key={code} className="flex items-center gap-1">
                                                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded shrink-0">{code}</span>
                                                                    <Input
                                                                        value={parsedClassNames[code] || ""}
                                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleGroupClassNameChange(code, e.target.value)}
                                                                        placeholder="예: 1,2"
                                                                        className={`h-7 text-xs ${isDisabled ? "bg-gray-100 pointer-events-none text-gray-400" : ""}`}
                                                                        disabled={isDisabled}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant={item.isCombinedClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${item.isCombinedClass ? "bg-blue-600 hover:bg-blue-700" : "text-gray-400"} ${isFreePeriod ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isCombinedClass", true);
                                                        }}
                                                        disabled={isFreePeriod || isDeleted}
                                                    >
                                                        통반 O
                                                    </Button>
                                                    <Button
                                                        variant={!item.isCombinedClass ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 text-xs px-2 ${!item.isCombinedClass ? "bg-red-600 hover:bg-red-700" : "text-gray-400"} ${isFreePeriod ? "pointer-events-none" : ""}`}
                                                        onClick={() => {
                                                            handleInputChange(originalIndex, "isCombinedClass", false);
                                                        }}
                                                        disabled={isFreePeriod || isDeleted}
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
            queryClient.invalidateQueries({ queryKey: ["publicSettings"] });
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

    const [currentDatasetId, setCurrentDatasetId] = useState<string>('');
    const [selectedDataset, setSelectedDataset] = useState<string>('_auto_');

    const adminRawQuery = useQuery({
        queryKey: ["admin", "rawComcigan_GroupChecker"],
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

    const timetableProps = useMemo(() => {
        const raw = adminRawQuery.data;
        if (!raw) return [];
        const keys = Object.keys(raw);
        return keys.filter(k => {
            const val = raw[k];
            return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]);
        });
    }, [adminRawQuery.data]);

    const rawDataQuery = useQuery({
        queryKey: ["admin", "groupChecker", grade, selectedDataset],
        queryFn: async () => {
            const url = `/api/comcigan?type=timetable&grade=${grade}&classNum=all` + (selectedDataset !== '_auto_' ? `&dataset=${selectedDataset}` : '');
            const res = await fetch(url);
            const json = await res.json();
            if (!res.ok || json?.error) return [];

            if (json.datasetId) {
                setCurrentDatasetId(json.datasetId);
            }
            return json.data || [];
        }
    });

    const { data: dbData } = useQuery({
        queryKey: ['adminData', currentDatasetId, grade],
        queryFn: async () => {
            if (!currentDatasetId) return { electiveSubjects: [] };
            const res = await fetch(`/api/admin/electives?grade=${grade}&dataset=${currentDatasetId}`, { headers: { "X-Admin-Password": adminPassword } });
            const data = await res.json();
            return { electiveSubjects: data };
        },
        enabled: !!currentDatasetId
    });

    // Compute Groups (Similar logic to Dashboard)
    const computedBaseGroups = useMemo(() => {
        if (grade !== "2" && grade !== "3") return {};
        const rawTimetableData = rawDataQuery.data || [];

        const electiveConfigs = dbData?.electiveSubjects || [];

        if (!rawTimetableData || !electiveConfigs || electiveConfigs.length === 0) return {};

        const subjectTeacherToGroups = new Map<string, string[]>();
        const subjectToGroups = new Map<string, string[]>();

        electiveConfigs.forEach((c: any) => {
            const isFreePeriod = ["빈교실", "공강", "Empty", "Free"].some(k => (c.subject || "").includes(k));
            if ((c.isMovingClass !== 0 || isFreePeriod) && c.classCode) {
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

                    <label className="text-sm font-medium whitespace-nowrap ml-4">데이터셋 오버라이드:</label>
                    <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="데이터셋" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_auto_">자동 (현재 설정)</SelectItem>
                            <SelectItem value="MANUAL_PLAN">MANUAL_PLAN</SelectItem>
                            {timetableProps.map(prop => (
                                <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2 text-sm ml-4 font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-100">
                        출처 데이터셋: {currentDatasetId || "로딩중..."}
                    </div>

                    <div className="flex-1 flex justify-end gap-2 text-sm text-gray-500">
                        {rawDataQuery.isLoading ? "시간표 로딩중..." : ""}
                        {(dbData === undefined && currentDatasetId) ? "강의설정 로딩중..." : ""}
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
// 6.55 반/공강 확인기 (Class & Free-Period Checker)
// 사진 형식: 그룹 | 선택과목 | 강의실 | 비고(공강 시)
// ----------------------------------------------------------------------
function ClassFreePeriodChecker({ adminPassword }: { adminPassword: string }) {
    const [grade, setGrade] = useState("2");
    const [selectedDataset, setSelectedDataset] = useState("_auto_");
    const [resolvedDataset, setResolvedDataset] = useState("");

    const WEEKDAY_LABELS = ["월", "화", "수", "목", "금"];

    // 1. settings (active_datasets)
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings", "groupOverrides"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", { headers: { "X-Admin-Password": adminPassword } });
            if (!res.ok) throw new Error("settings fetch failed");
            return res.json();
        },
    });

    // 2. raw comcigan data (for dataset list)
    const adminRawQuery = useQuery({
        queryKey: ["admin", "rawComcigan_FreePeriodChecker"],
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

    const timetableProps = useMemo(() => {
        const raw = adminRawQuery.data;
        if (!raw) return [];
        const keys = Object.keys(raw);
        return keys.filter(k => {
            const val = raw[k];
            return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]);
        });
    }, [adminRawQuery.data]);

    // Resolve dataset: _auto_ → active from settings, else manual
    useEffect(() => {
        if (selectedDataset === "_auto_" && settingsQuery.data) {
            const ds = grade === "1" ? settingsQuery.data.comcigan_dataset_selected_grade1 : settingsQuery.data.comcigan_dataset_selected;
            setResolvedDataset(ds || "");
        } else if (selectedDataset !== "_auto_") {
            setResolvedDataset(selectedDataset);
        }
    }, [selectedDataset, settingsQuery.data, grade]);

    // 3. elective configs (그룹별 과목·반 정보)
    const electiveConfigQuery = useQuery({
        queryKey: ["admin", "electiveConfig", grade, resolvedDataset],
        queryFn: async () => {
            if (!resolvedDataset) return [];
            const res = await fetch(`/api/electives?grade=${grade}&dataset=${resolvedDataset}`);
            if (!res.ok) throw new Error("elective config fetch failed");
            return res.json();
        },
        enabled: !!resolvedDataset,
    });

    // 4. all-class timetable (공강 교시 감지용)
    const timetableQuery = useQuery({
        queryKey: ["admin", "allClassesTimetable_FreePeriodChecker", grade, resolvedDataset],
        queryFn: async () => {
            if (!resolvedDataset) return [];
            const url = `/api/comcigan?type=timetable&grade=${grade}&classNum=all` +
                (selectedDataset !== '_auto_' ? `&dataset=${resolvedDataset}` : '');
            const res = await fetch(url);
            if (!res.ok) throw new Error("timetable fetch failed");
            const json = await res.json();
            return json.data || [];
        },
        enabled: !!resolvedDataset,
    });

    const configs: any[] = useMemo(() => electiveConfigQuery.data || [], [electiveConfigQuery.data]);
    const allSlots: any[] = useMemo(() => timetableQuery.data || [], [timetableQuery.data]);

    const FREE_KEYWORDS = ["빈교실", "공강", "Empty", "Free"];

    const tableRows = useMemo(() => {
        const grouped: Record<string, { subject: string; fullSubjectName?: string; className?: string; freePeriods: string[] }[]> = {};

        configs.forEach((c: any) => {
            const isFreePeriod = FREE_KEYWORDS.some(k => (c.subject || "").includes(k));
            if (c.isMovingClass === 0 && !isFreePeriod) return;
            if (!c.classCode) return;
            const codes = (c.classCode as string).split(",").map(s => s.trim()).filter(Boolean);
            codes.forEach(code => {
                if (!grouped[code]) grouped[code] = [];
                if (grouped[code].some(r => r.subject === c.subject)) return;

                // Check every possible class period (Mon-Fri, 1-7 period)
                // A true free period means:
                // 1. There is a free period (빈교실, 공강, etc) in at least one class during this time block
                // 2. No class slot exists in this period with the exact same subject name
                const freePeriodSet = new Set<string>();

                for (let weekday = 0; weekday <= 4; weekday++) {
                    for (let classTime = 1; classTime <= 7; classTime++) {
                        const sameTimeSlots = allSlots.filter((s: any) =>
                            s.weekday === weekday &&
                            s.classTime === classTime
                        );

                        if (sameTimeSlots.length === 0) continue;

                        const matchingSlot = sameTimeSlots.find((s: any) =>
                            s.subject && s.subject.trim() === c.subject.trim()
                        );

                        const hasFreePeriodSlot = sameTimeSlots.some((s: any) =>
                            FREE_KEYWORDS.some(k => (s.subject || "").includes(k))
                        );

                        if (hasFreePeriodSlot && !matchingSlot) {
                            // Weekdays are 0-4 (Mon-Fri) in comcigan
                            const label = `${WEEKDAY_LABELS[weekday]}${classTime}`;
                            freePeriodSet.add(label);
                        }
                    }
                }

                let parsedClassName = c.className || "";
                try {
                    const parsed = JSON.parse(c.className);
                    parsedClassName = parsed[code] || parsed["_global"] || "";
                } catch {
                    // Fallback to legacy string
                }

                grouped[code].push({
                    subject: c.subject,
                    fullSubjectName: c.fullSubjectName,
                    className: parsedClassName,
                    freePeriods: Array.from(freePeriodSet).sort(),
                });
            });
        });

        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
    }, [configs, allSlots]);

    const isLoading = settingsQuery.isLoading || electiveConfigQuery.isLoading || timetableQuery.isLoading;

    return (
        <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-base">반 / 공강 확인기</CardTitle>
                    <select value={grade} onChange={e => { setGrade(e.target.value); setSelectedDataset("_auto_"); }} className="border rounded px-2 py-1 text-sm">
                        <option value="2">2학년</option>
                        <option value="3">3학년</option>
                    </select>
                    <select
                        value={selectedDataset}
                        onChange={e => setSelectedDataset(e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                    >
                        <option value="_auto_">자동 (활성 데이터셋)</option>
                        <option value="MANUAL_PLAN">MANUAL_PLAN</option>
                        {timetableProps.map(tp => (
                            <option key={tp} value={tp}>{tp}</option>
                        ))}
                    </select>
                    {resolvedDataset && (
                        <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">{resolvedDataset}</span>
                    )}
                </div>
                <CardDescription>그룹이 있는 이동반 과목의 강의실(반)과 공강 정보를 표시합니다.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-slate-400 py-6 text-center text-sm">로딩 중...</div>
                ) : !resolvedDataset ? (
                    <div className="text-amber-600 text-sm py-4">
                        데이터셋을 선택하거나 활성 데이터셋을 설정해주세요.
                    </div>
                ) : tableRows.length === 0 ? (
                    <div className="text-slate-400 text-sm py-4">그룹이 할당된 이동반 과목이 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700">
                                    <th className="border border-slate-300 px-4 py-2 font-bold text-center w-14">그룹</th>
                                    <th className="border border-slate-300 px-4 py-2 font-bold text-center">선택과목</th>
                                    <th className="border border-slate-300 px-4 py-2 font-bold text-center">강의실</th>
                                    <th className="border border-slate-300 px-4 py-2 font-bold text-center">비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map(([groupCode, subjects]) =>
                                    subjects.map((row, idx) => (
                                        <tr key={`${groupCode}-${row.subject}`} className="hover:bg-slate-50">
                                            {idx === 0 && (
                                                <td
                                                    className="border border-slate-300 px-4 py-2 font-bold text-center align-middle bg-orange-50 text-orange-700 text-base"
                                                    rowSpan={subjects.length}
                                                >
                                                    {groupCode}
                                                </td>
                                            )}
                                            <td className="border border-slate-300 px-4 py-2 text-center">{row.subject}</td>
                                            <td className="border border-slate-300 px-4 py-2 text-center">
                                                {row.className || <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="border border-slate-300 px-4 py-2 text-center">
                                                {row.freePeriods.length > 0
                                                    ? row.freePeriods.map(fp => (
                                                        <span key={fp} className="inline-block mr-1 text-blue-600 font-medium">{fp} 공강</span>
                                                    ))
                                                    : <span className="text-slate-300">-</span>
                                                }
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}






// ----------------------------------------------------------------------
function ElectiveInputModeSettings({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [selectedMode, setSelectedMode] = useState<'auto' | 'manual'>('auto');

    const settingsQuery = useQuery({
        queryKey: ["admin", "settings", "electiveInputMode"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", {
                headers: { "X-Admin-Password": adminPassword },
            });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        },
    });

    useEffect(() => {
        if (settingsQuery.data) {
            setSelectedMode((settingsQuery.data.elective_input_mode as 'auto' | 'manual') || 'auto');
        }
    }, [settingsQuery.data]);

    const saveMutation = useMutation({
        mutationFn: async (mode: string) => {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({ elective_input_mode: mode }),
            });
            if (!res.ok) throw new Error("Failed to save");
            return res.json();
        },
        onSuccess: () => {
            toast.success("설정이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
        },
        onError: (err: Error) => toast.error(`저장 실패: ${err.message}`),
    });

    const originalMode = (settingsQuery.data?.elective_input_mode as 'auto' | 'manual') || 'auto';
    const isDirty = selectedMode !== originalMode;

    return (
        <Card className="w-full max-w-lg">
            <CardHeader>
                <CardTitle>학생 선택과목 입력방식</CardTitle>
                <CardDescription>
                    메인 화면의 선택과목 편집창에서 사용할 입력 방식을 선택합니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    <label
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedMode === 'auto' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                        onClick={() => setSelectedMode('auto')}
                    >
                        <input type="radio" className="mt-0.5" checked={selectedMode === 'auto'} onChange={() => setSelectedMode('auto')} />
                        <div>
                            <p className="font-semibold text-sm">자동 탐색 (기본값)</p>
                            <p className="text-xs text-slate-500">
                                학생이 과목명만 선택하면 가능한 ABCD 조합을 자동으로 탐색합니다.
                                조합이 하나이면 자동 배정, 여러 가지이면 선택 카드 표시.
                            </p>
                        </div>
                    </label>

                    <label
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedMode === 'manual' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:bg-slate-50'}`}
                        onClick={() => setSelectedMode('manual')}
                    >
                        <input type="radio" className="mt-0.5" checked={selectedMode === 'manual'} onChange={() => setSelectedMode('manual')} />
                        <div>
                            <p className="font-semibold text-sm">수동 입력</p>
                            <p className="text-xs text-slate-500">
                                자동 탐색 없이 ABCD 그룹별로 직접 드롭다운으로 입력합니다.
                            </p>
                        </div>
                    </label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={() => setSelectedMode(originalMode)} disabled={!isDirty || saveMutation.isPending}>
                        취소
                    </Button>
                    <Button onClick={() => saveMutation.mutate(selectedMode)} disabled={!isDirty || saveMutation.isPending}>
                        {saveMutation.isPending ? "저장 중..." : "저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ----------------------------------------------------------------------
// 6.9 Bug Report Manager (오류신고 현황)
// ----------------------------------------------------------------------
function BugReportManager({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();

    // Fetch settings to get current toggle state
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", { headers: { "X-Admin-Password": adminPassword } });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        }
    });

    const isBugReportEnabled = settingsQuery.data?.bug_report_enabled !== 'false';

    const toggleMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({ bug_report_enabled: enabled ? 'true' : 'false' })
            });
            if (!res.ok) throw new Error("Failed to update setting");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
        }
    });

    // Fetch all bug reports
    const reportsQuery = useQuery({
        queryKey: ["admin", "bugReports"],
        queryFn: async () => {
            const res = await fetch("/api/bug-reports", { headers: { "X-Admin-Password": adminPassword } });
            if (!res.ok) throw new Error("Failed to fetch bug reports");
            return res.json();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/bug-reports?id=${id}`, {
                method: "DELETE",
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("Failed to delete");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "bugReports"] });
        }
    });

    const reports = reportsQuery.data || [];

    return (
        <div className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                    <Bug className="w-5 h-5 text-red-500" />
                    <div>
                        <p className="font-semibold text-sm">버그제보 버튼 표시</p>
                        <p className="text-xs text-gray-500">OFF 시 메인페이지에서 오류신고 버튼을 숨깁니다</p>
                    </div>
                </div>
                <Switch
                    checked={isBugReportEnabled}
                    onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                />
            </div>

            {/* Reports List */}
            <div className="space-y-2">
                <p className="text-sm font-bold text-gray-700">신고 목록 ({reports.length}건)</p>
                {reportsQuery.isLoading ? (
                    <p className="text-sm text-gray-400">로딩 중...</p>
                ) : reports.length === 0 ? (
                    <p className="text-sm text-gray-400">접수된 오류신고가 없습니다.</p>
                ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {reports.map((report: any) => (
                            <div key={report.id} className="p-3 border rounded-lg bg-white flex flex-col gap-1">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs">
                                            {report.grade ? `${report.grade}학년 ${report.classNum}반 ${report.studentNumber}번` : '미입력'}
                                        </Badge>
                                        <span className="text-xs text-gray-400">
                                            {report.createdAt ? new Date(report.createdAt + 'Z').toLocaleString() : ''}
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-gray-400 hover:text-red-500"
                                        onClick={() => deleteMutation.mutate(report.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.message}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 6.95 Student Elective Pre-Entry (학생 선택과목 사전입력)
// ----------------------------------------------------------------------
function StudentElectivePreEntry({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [selectedGrade, setSelectedGrade] = useState("2");
    const [selectedDataset, setSelectedDataset] = useState("_auto_");
    const [resolvedDataset, setResolvedDataset] = useState("");
    const [selectedClass, setSelectedClass] = useState("");
    // pendingChanges: key = "classNum-studentNumber", value = full electives object for that student
    const [pendingChanges, setPendingChanges] = useState<Record<string, Record<string, any>>>({});
    const [isSaving, setIsSaving] = useState(false);

    const hasPendingChanges = Object.keys(pendingChanges).length > 0;

    // Fetch admin settings (for active_datasets)
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings", "electivePreEntry"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("settings fetch failed");
            return res.json();
        }
    });

    // Fetch raw comcigan data (for dataset list)
    const adminRawQuery = useQuery({
        queryKey: ["admin", "rawComcigan_ElectivePreEntry"],
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

    const timetableProps = useMemo(() => {
        const raw = adminRawQuery.data;
        if (!raw) return [];
        return Object.keys(raw).filter(k => {
            const val = raw[k];
            return Array.isArray(val) && val[1] && val[1][1] && Array.isArray(val[1][1]);
        });
    }, [adminRawQuery.data]);

    // Resolve dataset: _auto_ → active from settings, else manual
    useEffect(() => {
        if (selectedDataset === "_auto_" && settingsQuery.data) {
            const ds = selectedGrade === "1" ? settingsQuery.data.comcigan_dataset_selected_grade1 : settingsQuery.data.comcigan_dataset_selected;
            setResolvedDataset(ds || "");
        } else if (selectedDataset !== "_auto_") {
            setResolvedDataset(selectedDataset);
        }
    }, [selectedDataset, settingsQuery.data, selectedGrade]);

    // Fetch elective configs (groups + subjects) for the dataset
    const electiveConfigQuery = useQuery({
        queryKey: ["admin", "electiveConfig", selectedGrade, resolvedDataset],
        queryFn: async () => {
            const res = await fetch(`/api/electives?grade=${selectedGrade}&dataset=${encodeURIComponent(resolvedDataset)}`);
            return res.json();
        },
        enabled: !!resolvedDataset
    });

    // Fetch all student profiles for the grade — real-time refresh when no pending changes
    const profilesQuery = useQuery({
        queryKey: ["admin", "allStudentProfiles", selectedGrade],
        queryFn: async () => {
            const res = await fetch(`/api/electives?type=all-students&grade=${selectedGrade}`);
            return res.json();
        },
        enabled: !!selectedGrade,
        refetchInterval: hasPendingChanges ? false : 5000, // 5s auto-refresh when no edits
    });

    // Build group → subjects mapping from elective config
    // classCode can be compound like "A,B" or "A,B,C,D", split into individual groups.
    // Filter out "?" entries (no valid classCode).
    const groupSubjects = useMemo(() => {
        if (!electiveConfigQuery.data || !Array.isArray(electiveConfigQuery.data)) return {};
        const map: Record<string, { subject: string; teacher: string; fullSubjectName: string }[]> = {};
        const EXCLUDED_SUBJECTS = ["빈교실", "공강", "창체", "자습", "동아리", "점심시간", "채플", "Empty", "Free"];
        for (const cfg of electiveConfigQuery.data) {
            const rawCode = cfg.classCode || "";
            if (!rawCode || rawCode === "?") continue; // Skip invalid classCodes
            // Skip excluded subjects (빈교실, 공강 etc.)
            if (EXCLUDED_SUBJECTS.some(ex => (cfg.subject || "").trim().includes(ex))) continue;
            const codes = rawCode.split(",").map((c: string) => c.trim()).filter(Boolean);
            const entry = {
                subject: cfg.subject,
                teacher: cfg.originalTeacher || cfg.fullTeacherName || "",
                fullSubjectName: cfg.fullSubjectName || cfg.subject,
            };
            for (const code of codes) {
                if (!map[code]) map[code] = [];
                if (!map[code].some((e: { subject: string }) => e.subject === entry.subject)) {
                    map[code].push(entry);
                }
            }
        }
        return map;
    }, [electiveConfigQuery.data]);

    const groupCodes = useMemo(() => Object.keys(groupSubjects).sort(), [groupSubjects]);

    // Build profiles lookup: key = "classNum-studentNumber" → electives object
    const profilesMap = useMemo(() => {
        if (!profilesQuery.data || !Array.isArray(profilesQuery.data)) return {};
        const map: Record<string, any> = {};
        for (const p of profilesQuery.data) {
            map[`${p.classNum}-${p.studentNumber}`] = p;
        }
        return map;
    }, [profilesQuery.data]);

    // Generate student rows
    const studentRows = useMemo(() => {
        const rows: { classNum: number; studentNumber: number; key: string }[] = [];
        const maxClass = 9;
        const maxNum = 30;
        for (let c = 1; c <= maxClass; c++) {
            if (selectedClass !== "all" && c !== parseInt(selectedClass)) continue;
            for (let n = 1; n <= maxNum; n++) {
                rows.push({ classNum: c, studentNumber: n, key: `${c}-${n}` });
            }
        }
        return rows;
    }, [selectedClass]);

    // Get current elective for a student + group (server state)
    const getServerElective = (key: string, groupCode: string): string => {
        const profile = profilesMap[key];
        if (!profile || !profile.electives) return "";
        try {
            const electives = typeof profile.electives === "string" ? JSON.parse(profile.electives) : profile.electives;
            if (typeof electives === "object" && !Array.isArray(electives)) {
                const entry = electives[groupCode];
                if (!entry) return "";
                if (typeof entry === "object" && entry.subject) return entry.subject;
                if (typeof entry === "string") return entry;
            }
        } catch { }
        return "";
    };

    // Get display value: pending change > server value
    const getDisplayElective = (key: string, groupCode: string): string => {
        if (pendingChanges[key] && groupCode in pendingChanges[key]) {
            const entry = pendingChanges[key][groupCode];
            if (!entry) return "";
            if (typeof entry === "object" && entry.subject) return entry.subject;
            if (typeof entry === "string") return entry;
            return "";
        }
        return getServerElective(key, groupCode);
    };

    // Handle local cell change (does NOT save to server)
    const handleCellChange = (classNum: number, studentNumber: number, groupCode: string, subject: string) => {
        const key = `${classNum}-${studentNumber}`;
        const subjectConfig = groupSubjects[groupCode]?.find(s => s.subject === subject);

        setPendingChanges(prev => {
            const existing = prev[key] || {};
            const newEntry = subject
                ? { subject, teacher: subjectConfig?.teacher || "", fullSubjectName: subjectConfig?.fullSubjectName || subject }
                : null; // null means "clear this group"
            return { ...prev, [key]: { ...existing, [groupCode]: newEntry } };
        });
    };

    // Cancel all pending changes
    const handleCancel = () => {
        setPendingChanges({});
    };

    // Save all pending changes to server
    const handleSaveAll = async () => {
        setIsSaving(true);
        let successCount = 0;
        let errorCount = 0;

        for (const [key, groupChanges] of Object.entries(pendingChanges)) {
            const [classNumStr, studentNumberStr] = key.split("-");
            const classNum = parseInt(classNumStr);
            const studentNumber = parseInt(studentNumberStr);

            // Build the full electives object: merge server state + pending changes
            const profile = profilesMap[key];
            let electives: Record<string, any> = {};
            if (profile?.electives) {
                try {
                    electives = typeof profile.electives === "string" ? JSON.parse(profile.electives) : { ...profile.electives };
                } catch { electives = {}; }
            }

            // Apply pending changes
            for (const [groupCode, value] of Object.entries(groupChanges)) {
                if (value) {
                    electives[groupCode] = value;
                } else {
                    delete electives[groupCode];
                }
            }

            // If all electives cleared, send with allowEmpty flag
            const isEmpty = Object.keys(electives).length === 0;
            if (isEmpty) {
                electives = {}; // explicitly empty
            }

            try {
                await fetch("/api/electives", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        grade: parseInt(selectedGrade),
                        classNum,
                        studentNumber,
                        electives: isEmpty ? {} : electives,
                        dataset: resolvedDataset,
                        allowEmpty: isEmpty,
                    }),
                });
                successCount++;
            } catch {
                errorCount++;
            }
        }

        if (errorCount > 0) {
            toast.error(`${errorCount}건 저장 실패, ${successCount}건 성공`);
        } else if (successCount > 0) {
            toast.success(`${successCount}건 저장 완료`);
        }

        setPendingChanges({});
        queryClient.invalidateQueries({ queryKey: ["admin", "allStudentProfiles", selectedGrade] });
        setIsSaving(false);
    };

    const isLoading = electiveConfigQuery.isLoading || profilesQuery.isLoading;
    const changedStudentCount = Object.keys(pendingChanges).length;

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Header Controls */}
            <div className="flex flex-wrap gap-2 items-center pb-4 border-b">
                <h3 className="text-lg font-bold flex-1">학생 선택과목 사전입력</h3>
                <Select value={selectedGrade} onValueChange={(val) => { setSelectedGrade(val); setPendingChanges({}); }}>
                    <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="학년" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="2">2학년</SelectItem>
                        <SelectItem value="3">3학년</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={selectedDataset} onValueChange={(val) => { setSelectedDataset(val); setPendingChanges({}); }}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="데이터셋" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="_auto_">자동{resolvedDataset && selectedDataset === "_auto_" ? ` (${resolvedDataset})` : ""}</SelectItem>
                        <SelectItem value="MANUAL_PLAN">MANUAL_PLAN</SelectItem>
                        {timetableProps.map((prop: string) => (
                            <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Class Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
                <Button
                    variant={selectedClass === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedClass("all")}
                >
                    전체
                </Button>
                {Array.from({ length: 9 }, (_, i) => i + 1).map(c => (
                    <Button
                        key={c}
                        variant={selectedClass === String(c) ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedClass(String(c))}
                    >
                        {c}반
                    </Button>
                ))}
            </div>

            {/* Grid Table */}
            <div className="flex-1 overflow-auto border rounded-md">
                {!selectedClass ? (
                    <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center h-full">
                        <p className="text-lg font-medium">선택된 반이 없습니다.</p>
                        <p className="text-sm mt-1">위의 탭에서 열람할 반(또는 전체)을 선택해 주세요.</p>
                    </div>
                ) : isLoading ? (
                    <div className="p-8 text-center text-gray-400">데이터를 불러오는 중...</div>
                ) : groupCodes.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        선택과목 설정이 없습니다. 선택과목 관리에서 먼저 설정해주세요.
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50">
                                <TableHead className="sticky left-0 bg-gray-50 z-10 min-w-[80px] font-bold">학번</TableHead>
                                {groupCodes.map(code => (
                                    <TableHead key={code} className="text-center min-w-[120px] font-bold">
                                        {code}그룹
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {studentRows.map(row => {
                                const hasAnyData = groupCodes.some(code => getDisplayElective(row.key, code));
                                const hasChanges = !!pendingChanges[row.key];
                                return (
                                    <TableRow
                                        key={row.key}
                                        className={hasChanges ? "bg-yellow-50/60" : hasAnyData ? "bg-blue-50/30" : ""}
                                    >
                                        <TableCell className="sticky left-0 bg-white z-10 font-mono font-bold text-sm border-r">
                                            {selectedGrade}{row.classNum}{String(row.studentNumber).padStart(2, "0")}
                                        </TableCell>
                                        {groupCodes.map(code => {
                                            const display = getDisplayElective(row.key, code);
                                            const serverVal = getServerElective(row.key, code);
                                            const isChanged = pendingChanges[row.key] && code in pendingChanges[row.key];
                                            return (
                                                <TableCell key={code} className="p-1">
                                                    <Select
                                                        value={display || "_empty_"}
                                                        onValueChange={(val) => handleCellChange(
                                                            row.classNum,
                                                            row.studentNumber,
                                                            code,
                                                            val === "_empty_" ? "" : val
                                                        )}
                                                        disabled={isSaving}
                                                    >
                                                        <SelectTrigger className={`h-8 text-xs ${isChanged ? "border-yellow-400 bg-yellow-50 ring-1 ring-yellow-300" : display ? "border-blue-200 bg-blue-50" : "border-gray-200"}`}>
                                                            <SelectValue placeholder="-" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="_empty_">-</SelectItem>
                                                            {(groupSubjects[code] || []).map(s => (
                                                                <SelectItem key={s.subject} value={s.subject}>
                                                                    {s.subject}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Status Bar */}
            <div className="flex justify-between items-center text-xs pt-1 border-t">
                <span className="text-gray-400">
                    총 {studentRows.length}명 ·
                    저장된 프로필: {profilesQuery.data?.length || 0}개
                    {!hasPendingChanges && <span className="ml-2 text-green-500">● 실시간 동기화 중</span>}
                </span>
                {hasPendingChanges ? (
                    <div className="flex items-center gap-2">
                        <span className="text-yellow-600 font-medium">{changedStudentCount}명 변경됨</span>
                        <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                            취소
                        </Button>
                        <Button size="sm" onClick={handleSaveAll} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isSaving ? "저장 중..." : "변경사항 저장"}
                        </Button>
                    </div>
                ) : (
                    <span className="text-gray-400">변경사항 없음</span>
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 6.96 Site Design Settings (사이트 디자인 설정)
// ----------------------------------------------------------------------
function SiteDesignSettings({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [siteTitle, setSiteTitle] = useState("");
    const [siteFaviconUrl, setSiteFaviconUrl] = useState("");
    const [pwaAppTitle, setPwaAppTitle] = useState("");
    const [pwaAppIconUrl, setPwaAppIconUrl] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const titleHtmlRef = React.useRef<HTMLDivElement>(null);
    const [htmlChanged, setHtmlChanged] = useState(false);

    // Load current settings
    const { data: currentSettings, isLoading } = useQuery({
        queryKey: ['admin', 'settings', 'site-design'],
        queryFn: async () => {
            const res = await fetch('/api/admin/settings', {
                headers: { 'X-Admin-Password': adminPassword }
            });
            if (!res.ok) throw new Error('Failed to load settings');
            return res.json();
        }
    });

    // Initialize form values from fetched settings
    useEffect(() => {
        if (currentSettings) {
            if (!isInitialized) {
                setSiteTitle(currentSettings.site_title || '');
                if (titleHtmlRef.current) {
                    titleHtmlRef.current.innerHTML = currentSettings.site_title_html || '<span style="color: #2563eb">수행 일정공유</span>';
                }
                setSiteFaviconUrl(currentSettings.site_favicon_url || '');
                setPwaAppTitle(currentSettings.pwa_app_title || '성지수행');
                setPwaAppIconUrl(currentSettings.pwa_app_icon_url || currentSettings.site_favicon_url || '');
                setIsInitialized(true);
                setHtmlChanged(false);
            } else if (!htmlChanged) {
                // Background update sync
                setSiteTitle(currentSettings.site_title || '');
                if (titleHtmlRef.current && titleHtmlRef.current.innerHTML !== (currentSettings.site_title_html || '<span style="color: #2563eb">수행 일정공유</span>')) {
                    titleHtmlRef.current.innerHTML = currentSettings.site_title_html || '<span style="color: #2563eb">수행 일정공유</span>';
                }
                setSiteFaviconUrl(currentSettings.site_favicon_url || '');
                setPwaAppTitle(currentSettings.pwa_app_title || '성지수행');
                setPwaAppIconUrl(currentSettings.pwa_app_icon_url || currentSettings.site_favicon_url || '');
            }
        }
    }, [currentSettings, isInitialized, htmlChanged]);

    // 실시간으로 브라우저 탭에 입력값 반영
    useEffect(() => {
        if (siteTitle !== undefined && isInitialized) {
            document.title = siteTitle || '수행 일정공유';
        }
    }, [siteTitle, isInitialized]);

    useEffect(() => {
        if (siteFaviconUrl !== undefined && isInitialized) {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            if (siteFaviconUrl) {
                link.href = siteFaviconUrl;
            }
        }
    }, [siteFaviconUrl, isInitialized]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let finalHtml = titleHtmlRef.current?.innerHTML.trim() || '';
            if (finalHtml === '<br>' || finalHtml === '<div><br></div>' || finalHtml === '') {
                finalHtml = '';
            }
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Password': adminPassword
                },
                body: JSON.stringify({
                    site_title: siteTitle,
                    site_title_html: finalHtml,
                    site_favicon_url: siteFaviconUrl,
                    pwa_app_title: pwaAppTitle,
                    pwa_app_icon_url: pwaAppIconUrl
                })
            });
            if (!res.ok) throw new Error('Failed to save');
            toast.success('사이트 설정이 저장되었습니다.');

            // Optimistically update the cache to prevent the input from reverting to old data momentarily
            queryClient.setQueryData(['admin', 'settings', 'site-design'], (old: any) => ({
                ...old,
                site_title: siteTitle,
                site_title_html: finalHtml,
                site_favicon_url: siteFaviconUrl,
                pwa_app_title: pwaAppTitle,
                pwa_app_icon_url: pwaAppIconUrl
            }));

            queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'site-design'] });
            queryClient.invalidateQueries({ queryKey: ['publicSettings'] });
            setHtmlChanged(false); // Reset changed state to let useEffect sync it back
        } catch (e: any) {
            toast.error(`저장 실패: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setSiteTitle(currentSettings?.site_title || '');
        if (titleHtmlRef.current) {
            titleHtmlRef.current.innerHTML = currentSettings?.site_title_html || '<span style="color: #2563eb">수행 일정공유</span>';
        }
        setSiteFaviconUrl(currentSettings?.site_favicon_url || '');
        setPwaAppTitle(currentSettings?.pwa_app_title || '성지수행');
        setPwaAppIconUrl(currentSettings?.pwa_app_icon_url || currentSettings?.site_favicon_url || '');
        setHtmlChanged(false);
    };

    const savedTitle = currentSettings?.site_title || '';
    const savedFavicon = currentSettings?.site_favicon_url || '';
    const savedPwaTitle = currentSettings?.pwa_app_title || '성지수행';
    const savedPwaIcon = currentSettings?.pwa_app_icon_url || currentSettings?.site_favicon_url || '';
    const hasChanges = siteTitle !== savedTitle || siteFaviconUrl !== savedFavicon || htmlChanged || pwaAppTitle !== savedPwaTitle || pwaAppIconUrl !== savedPwaIcon;

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">설정을 불러오는 중...</div>;
    }

    return (
        <div className="space-y-6 max-w-lg">
            {/* 사이트 제목 */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold">브라우저 탭 제목 (순수 텍스트)</Label>
                <Input
                    value={siteTitle}
                    onChange={(e) => setSiteTitle(e.target.value)}
                    placeholder="예: 수행평가 일정공유 - 성지고"
                    className="max-w-md"
                />
                <p className="text-xs text-gray-400">브라우저 탭에 표시되는 제목입니다. 비워두면 기본값이 사용됩니다.</p>
            </div>

            {/* 화면용 사이트 제목 (색상 지원) */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold">화면용 사이트 제목 (색상 변경 지원)</Label>
                <div className="flex items-center gap-2 mb-1">
                    <input
                        type="color"
                        className="w-8 h-8 p-1 border rounded cursor-pointer bg-white"
                        onChange={(e) => {
                            document.execCommand('styleWithCSS', false, 'true');
                            document.execCommand('foreColor', false, e.target.value);
                            setHtmlChanged(true);
                        }}
                        title="글자를 드래그한 후 색상을 골라주세요"
                    />
                    <span className="text-xs text-gray-500">마우스로 변경하고 싶은 글자를 드래그한 뒤 색상을 선택하세요. (기본 텍스트: 수행 일정공유)</span>
                </div>
                <div
                    ref={titleHtmlRef}
                    className="w-full max-w-md min-h-[42px] px-3 py-2 border rounded-md text-lg font-bold shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() => setHtmlChanged(true)}
                />
                <p className="text-xs text-gray-400">PC와 모바일 화면 상단에 표시되는 제목입니다. 서식이 포함된 HTML 형태로 저장됩니다.</p>
            </div>

            {/* 파비콘 업로드 */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold">사이트 아이콘 (Favicon)</Label>
                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp"
                        className="hidden"
                        id="favicon-upload"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 1024 * 1024) {
                                toast.error('파일 크기가 1MB를 초과합니다.');
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                                const dataUrl = ev.target?.result as string;
                                if (dataUrl) setSiteFaviconUrl(dataUrl);
                            };
                            reader.readAsDataURL(file);
                            e.target.value = ''; // reset for re-upload
                        }}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('favicon-upload')?.click()}
                        className="shrink-0"
                    >
                        <Upload className="w-4 h-4 mr-1.5" />
                        이미지 업로드
                    </Button>
                    {siteFaviconUrl && (
                        <>
                            <div className="shrink-0 w-10 h-10 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                                <img
                                    src={siteFaviconUrl}
                                    alt="favicon preview"
                                    className="w-8 h-8 object-contain"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 px-2"
                                onClick={() => setSiteFaviconUrl('')}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </div>
                <p className="text-xs text-gray-400">브라우저 탭에 표시되는 아이콘입니다. PNG, ICO, SVG 형식 권장 (최대 1MB).</p>
            </div>

            <hr className="my-6 border-slate-200" />

            {/* PWA 앱 제목 */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold text-green-700">PWA 앱 설치 이름 (바탕화면용)</Label>
                <Input
                    value={pwaAppTitle}
                    onChange={(e) => setPwaAppTitle(e.target.value)}
                    placeholder="예: 성지고 시간표"
                    className="max-w-md"
                />
                <p className="text-xs text-gray-400">모바일 기기 바탕화면에 추가될 때 표시되는 앱 이름입니다.</p>
            </div>

            {/* PWA 앱 아이콘 업로드 */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold text-green-700">PWA 앱 아이콘 (바탕화면용)</Label>
                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp"
                        className="hidden"
                        id="pwa-icon-upload"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 1024 * 1024) {
                                toast.error('파일 크기가 1MB를 초과합니다.');
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                                const dataUrl = ev.target?.result as string;
                                if (dataUrl) setPwaAppIconUrl(dataUrl);
                            };
                            reader.readAsDataURL(file);
                            e.target.value = ''; // reset for re-upload
                        }}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('pwa-icon-upload')?.click()}
                        className="shrink-0 border-green-200 text-green-700 hover:bg-green-50"
                    >
                        <Upload className="w-4 h-4 mr-1.5" />
                        아이콘 업로드
                    </Button>
                    {pwaAppIconUrl && (
                        <>
                            <div className="shrink-0 w-10 h-10 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                                <img
                                    src={pwaAppIconUrl}
                                    alt="PWA icon preview"
                                    className="w-10 h-10 object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 px-2"
                                onClick={() => setPwaAppIconUrl('')}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </div>
                <p className="text-xs text-gray-400">모바일 앱 설치 시 표시되는 아이콘입니다. 정사각형(1:1)의 PNG 권장. 미지정시 기본 이미지(/icon.svg)가 적용됩니다.</p>
            </div>

            {/* 미리보기 */}
            {(siteTitle || siteFaviconUrl) && (
                <div className="rounded-lg border bg-slate-50 p-4 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">미리보기</p>
                    <div className="flex items-center gap-2 bg-white rounded-md border px-3 py-2 max-w-sm">
                        {siteFaviconUrl ? (
                            <img src={siteFaviconUrl} alt="" className="w-4 h-4 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                            <div className="w-4 h-4 rounded bg-gray-200" />
                        )}
                        <span className="text-sm text-slate-700 truncate">{siteTitle || '브라우저 탭 기본 제목'}</span>
                    </div>
                </div>
            )}

            {/* 취소 / 적용 */}
            <div className="flex gap-2 pt-2">
                <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={!hasChanges || isSaving}
                >
                    취소
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={!hasChanges || isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {isSaving ? '적용 중...' : '적용'}
                </Button>
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 6.97 Visitor Trends (접속자 추이)
// ----------------------------------------------------------------------
function VisitorTrends({ adminPassword }: { adminPassword: string }) {
    const [unit, setUnit] = useState<string>("day");
    const [excludeInput, setExcludeInput] = useState("");
    const [excludeApplied, setExcludeApplied] = useState("");
    const [totalMetric, setTotalMetric] = useState<"student" | "ip">("student");

    const { data: trendData, isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'visitor-trends', unit, excludeApplied],
        queryFn: async () => {
            const params = new URLSearchParams({ unit });
            if (excludeApplied) params.set('exclude', excludeApplied);
            const res = await fetch(`/api/admin/visit-trends?${params}`, {
                headers: { 'X-Admin-Password': adminPassword }
            });
            if (!res.ok) throw new Error('Failed to fetch trends');
            return res.json();
        },
        refetchInterval: 5000,
    });

    const formatLabel = (label: string) => {
        if (!label) return '';
        if (unit === 'hour') {
            // "2026-03-05 14:00" → "14시"
            const parts = label.split(' ');
            return parts[1] ? parts[1].replace(':00', '시') : label;
        }
        if (unit === 'day') {
            // "2026-03-05" → "3/5"
            const [, m, d] = label.split('-');
            return `${parseInt(m)}/${parseInt(d)}`;
        }
        if (unit === 'week') {
            return label.replace(/^\d{4}-/, '');
        }
        if (unit === 'month') {
            // "2026-03" → "3월"
            const [, m] = label.split('-');
            return `${parseInt(m)}월`;
        }
        return label;
    };

    const unitOptions = [
        { value: 'hour', label: '시간' },
        { value: 'day', label: '일' },
        { value: 'week', label: '1주일' },
        { value: 'month', label: '1달' },
        { value: 'all', label: '전체' },
    ];

    const buckets = trendData?.buckets || [];

    const isBucketCurrent = (label: string, unit: string) => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');

        console.log("isBucketCurrent DEBUG:", {
            incomingLabel: label,
            unit,
            targetHour: `${yyyy}-${mm}-${dd} ${hh}:00`,
            targetDay: `${yyyy}-${mm}-${dd}`,
            targetMonth: `${yyyy}-${mm}`
        });

        if (unit === 'hour') return label === `${yyyy}-${mm}-${dd} ${hh}:00`;
        if (unit === 'day') return label === `${yyyy}-${mm}-${dd}`;
        if (unit === 'month' || unit === 'all') return label === `${yyyy}-${mm}`;

        if (unit === 'week') {
            const firstDay = new Date(yyyy, 0, 1);
            let firstMondayDate = 1 + (8 - firstDay.getDay()) % 7;
            if (firstDay.getDay() === 1) firstMondayDate = 1;
            const firstMonday = new Date(yyyy, 0, firstMondayDate);

            let weekNum;
            if (now < firstMonday) {
                weekNum = 0;
            } else {
                weekNum = Math.floor((now.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
            }
            return label === `${yyyy}-W${String(weekNum).padStart(2, '0')}`;
        }
        return false;
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-wrap gap-3 items-end">
                {/* Time unit tabs */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {unitOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setUnit(opt.value)}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${unit === opt.value
                                ? 'bg-white shadow text-blue-700 font-semibold'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Exclude input */}
                <div className="flex items-center gap-2">
                    <Input
                        value={excludeInput}
                        onChange={(e) => setExcludeInput(e.target.value)}
                        placeholder="제외 학번 (예: 2101,2305)"
                        className="w-[200px] h-9 text-sm"
                        onKeyDown={(e) => { if (e.key === 'Enter') setExcludeApplied(excludeInput); }}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExcludeApplied(excludeInput)}
                    >
                        적용
                    </Button>
                    {excludeApplied && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setExcludeInput(''); setExcludeApplied(''); }}
                            className="text-red-500 px-2"
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="text-center text-gray-400 py-12">데이터를 불러오는 중...</div>
            ) : isError ? (
                <div className="text-center text-red-400 py-12">오류: {(error as Error).message}</div>
            ) : buckets.length === 0 ? (
                <div className="text-center text-gray-400 py-12">해당 기간에 데이터가 없습니다.</div>
            ) : (
                <div className="space-y-8">
                    {/* Graph 1: Unique Students */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-600 mb-3">고유 접속자 수 (학번 기준)</h4>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={buckets}>
                                    <defs>
                                        <pattern id="stripe-blue" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                                            <rect width="8" height="8" fill="#3b82f6" />
                                            <rect width="4" height="8" fill="#bfdbfe" />
                                        </pattern>
                                        <pattern id="stripe-purple" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                                            <rect width="8" height="8" fill="#8b5cf6" />
                                            <rect width="4" height="8" fill="#ddd6fe" />
                                        </pattern>
                                        <pattern id="stripe-green" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                                            <rect width="8" height="8" fill="#10b981" />
                                            <rect width="4" height="8" fill="#a7f3d0" />
                                        </pattern>
                                        <pattern id="stripe-orange" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                                            <rect width="8" height="8" fill="#f59e0b" />
                                            <rect width="4" height="8" fill="#fde68a" />
                                        </pattern>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis dataKey="label" tickFormatter={formatLabel} tick={{ fontSize: 12 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        labelFormatter={(v) => `구간: ${v}`}
                                        formatter={(v: number) => [`${v}명`, '고유 접속자']}
                                    />
                                    <Bar dataKey="uniqueStudents" name="고유 접속자" radius={[4, 4, 0, 0]}>
                                        {buckets.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={isBucketCurrent(entry.label, unit) ? "url(#stripe-blue)" : "#3b82f6"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Graph 1.5: Unique IPs */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-600 mb-3">고유 접속자 수 (IP 기준)</h4>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={buckets}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis dataKey="label" tickFormatter={formatLabel} tick={{ fontSize: 12 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        labelFormatter={(v) => `구간: ${v}`}
                                        formatter={(v: number) => [`${v}개`, '고유 IP']}
                                    />
                                    <Bar dataKey="uniqueIPs" name="고유 IP" radius={[4, 4, 0, 0]}>
                                        {buckets.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={isBucketCurrent(entry.label, unit) ? "url(#stripe-purple)" : "#8b5cf6"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Graph 2: Total Visits */}
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-gray-600">총 접속 횟수</h4>
                                <span className="text-xs text-gray-400 font-normal shadow-none">(10분당 1회 제한)</span>
                            </div>
                            <div className="flex bg-gray-100 rounded-md p-0.5">
                                <button
                                    onClick={() => setTotalMetric("student")}
                                    className={`px-2 py-1 text-xs rounded-sm transition-colors ${totalMetric === "student"
                                        ? 'bg-white shadow-sm text-blue-600 font-bold'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    학번 기준
                                </button>
                                <button
                                    onClick={() => setTotalMetric("ip")}
                                    className={`px-2 py-1 text-xs rounded-sm transition-colors ${totalMetric === "ip"
                                        ? 'bg-white shadow-sm text-purple-600 font-bold'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    IP 기준
                                </button>
                            </div>
                        </div>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={buckets}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis dataKey="label" tickFormatter={formatLabel} tick={{ fontSize: 12 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        labelFormatter={(v) => `구간: ${v}`}
                                        formatter={(v: number) => [`${v}회`, totalMetric === 'student' ? '접속 횟수 (학번 매핑됨)' : '접속 횟수 (모든 IP)']}
                                    />
                                    <Bar
                                        dataKey={totalMetric === "student" ? "totalVisitsStudent" : "totalVisitsIP"}
                                        radius={[4, 4, 0, 0]}
                                        name="접속 횟수"
                                    >
                                        {buckets.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={isBucketCurrent(entry.label, unit) ? (totalMetric === "student" ? "url(#stripe-green)" : "url(#stripe-orange)") : (totalMetric === "student" ? "#10b981" : "#f59e0b")} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Summary stats */}
                    <div className="flex gap-4 text-sm text-gray-500 border-t pt-3">
                        <span>구간 수: {buckets.length}</span>
                        <span>총 고유 접속자(학번): {buckets.reduce((s: number, b: any) => s + b.uniqueStudents, 0)}명</span>
                        <span>총 고유 IP: {buckets.reduce((s: number, b: any) => s + (b.uniqueIPs || 0), 0)}개</span>
                        <span>총 접속: {buckets.reduce((s: number, b: any) => s + b.totalVisits, 0)}회</span>
                        {excludeApplied && <span className="text-orange-500">제외: {excludeApplied}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// 7. Etc Manager (Miscellaneous features like Raw Comcigan Data)
// ----------------------------------------------------------------------
function EtcManager({ adminPassword }: { adminPassword: string }) {
    const [selectedMenu, setSelectedMenu] = useState("raw-comcigan");
    const [schoolSearchQuery, setSchoolSearchQuery] = useState("성지");
    const [schoolNameInput, setSchoolNameInput] = useState("부산성지고");

    // Fetch bug reports for real-time count in the sidebar badge
    const reportsQuery = useQuery({
        queryKey: ["admin", "bugReports"],
        queryFn: async () => {
            const res = await fetch("/api/bug-reports", { headers: { "X-Admin-Password": adminPassword } });
            if (!res.ok) throw new Error("Failed to fetch bug reports");
            return res.json();
        },
        refetchInterval: 10000,
    });

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
                <Button
                    variant={selectedMenu === "elective-input-mode" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("elective-input-mode")}
                >
                    <Settings className="w-4 h-4 mr-2" />
                    선택과목 입력방식
                </Button>
                <Button
                    variant={selectedMenu === "class-free-period-checker" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("class-free-period-checker")}
                >
                    <Grid2X2 className="w-4 h-4 mr-2" />
                    반 / 공강 확인기
                </Button>
                <Button
                    variant={selectedMenu === "bug-report-manager" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("bug-report-manager")}
                >
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center">
                            <Bug className="w-4 h-4 mr-2" />
                            오류신고 현황
                        </div>
                        {reportsQuery.data && reportsQuery.data.length > 0 && (
                            <span className="text-xs text-red-500 font-bold ml-2">
                                ({reportsQuery.data.length})
                            </span>
                        )}
                    </div>
                </Button>
                <Button
                    variant={selectedMenu === "student-elective-preentry" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("student-elective-preentry")}
                >
                    <Users className="w-4 h-4 mr-2" />
                    학생 선택과목 사전입력
                </Button>
                <Button
                    variant={selectedMenu === "site-design" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("site-design")}
                >
                    <Palette className="w-4 h-4 mr-2" />
                    사이트 디자인설정
                </Button>
                <Button
                    variant={selectedMenu === "visitor-trends" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("visitor-trends")}
                >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    접속자 추이
                </Button>
                <Button
                    variant={selectedMenu === "allow-download-settings" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left"
                    onClick={() => setSelectedMenu("allow-download-settings")}
                >
                    <Download className="w-4 h-4 mr-2" />
                    내려받기 허용
                </Button>
                <Button
                    variant={selectedMenu === "unresolved-issues" ? "default" : "ghost"}
                    className="justify-start whitespace-nowrap text-left text-orange-600 hover:text-orange-700"
                    onClick={() => setSelectedMenu("unresolved-issues")}
                >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    미해결 문제
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

                {selectedMenu === "elective-input-mode" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">학생 선택과목 입력방식</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <ElectiveInputModeSettings adminPassword={adminPassword} />
                        </div>
                    </div>
                )}

                {selectedMenu === "class-free-period-checker" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">반 / 공강 확인기</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <ClassFreePeriodChecker adminPassword={adminPassword} />
                        </div>
                    </div>
                )}

                {selectedMenu === "bug-report-manager" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">오류신고 현황</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <BugReportManager adminPassword={adminPassword} />
                        </div>
                    </div>
                )}

                {selectedMenu === "student-elective-preentry" && (
                    <StudentElectivePreEntry adminPassword={adminPassword} />
                )}

                {selectedMenu === "site-design" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">사이트 디자인설정</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <SiteDesignSettings adminPassword={adminPassword} />
                        </div>
                    </div>
                )}

                {selectedMenu === "visitor-trends" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">접속자 추이</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <VisitorTrends adminPassword={adminPassword} />
                        </div>
                    </div>
                )}

                {selectedMenu === "allow-download-settings" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1">프린트 및 내려받기 설정</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <AllowDownloadSettings adminPassword={adminPassword} />
                        </div>
                    </div>
                )}

                {selectedMenu === "unresolved-issues" && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex gap-2 items-center pb-4 border-b">
                            <h3 className="text-lg font-bold flex-1 text-orange-600">⚠️ 미해결 문제</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <SamsungInstallSettings adminPassword={adminPassword} />
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

    // AutoFill states
    const [showAutoFill, setShowAutoFill] = useState(false);
    const [autoFillData, setAutoFillData] = useState<{ grade: number, fromDataset: string, toDataset: string, mappingRules: any[] } | null>(null);

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
    const [sortColumn, setSortColumn] = useState<'id' | 'modCount' | 'lastAccess'>('lastAccess');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

    // Intercept with AutoFill Analyzer fullscreen
    if (showAutoFill) {
        return (
            <div className="container max-w-6xl mx-auto px-4 py-8">
                <AutoFillAnalyzer
                    data={autoFillData!}
                    adminPassword={password}
                    onBack={() => setShowAutoFill(false)}
                />
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
                        value="bridge"
                        className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800"
                    >
                        BRIDGE
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
                                    최근 접속한 IP 및 카카오 계정 목록입니다. 같은 학번의 여러 IP는 하나의 항목으로 묶입니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    const isKnownUser = (user: IPProfile) => {
                                        if (!user.recentUserAgents || user.recentUserAgents.length === 0) return false;
                                        const knownKeywords = ['Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Whale', 'Kakao', 'iPhone', 'Android'];
                                        const hasKnownUA = user.recentUserAgents.some(ua => knownKeywords.some(keyword => ua.includes(keyword)));
                                        const hasInfo = !!(user.grade && user.classNum);
                                        return hasKnownUA && hasInfo;
                                    };

                                    const activeUsers = userData?.activeUsers || [];
                                    const knownUsers = activeUsers.filter(isKnownUser);
                                    const unknownUsers = activeUsers.filter((u: any) => !isKnownUser(u));

                                    // --- Group known users by student ID ---
                                    type UserGroup = {
                                        key: string;
                                        grade: number | null;
                                        classNum: number | null;
                                        studentNumber: number | null;
                                        ips: IPProfile[];
                                        modificationCount: number;
                                        printCount: number;
                                        downloadCount: number;
                                        lastAccess: string | null;
                                        kakaoAccounts: { kakaoId: string; kakaoNickname: string }[];
                                        isBlocked: boolean;
                                        hasElectives?: boolean;
                                    };

                                    const groupMap = new Map<string, UserGroup>();
                                    for (const user of knownUsers) {
                                        const key = (user.grade && user.classNum && user.studentNumber)
                                            ? `${user.grade}-${user.classNum}-${user.studentNumber}`
                                            : user.ip;
                                        const existing = groupMap.get(key);
                                        if (existing) {
                                            existing.ips.push(user);
                                            existing.modificationCount += user.modificationCount || 0;
                                            existing.printCount += user.printCount || 0;
                                            existing.downloadCount += user.downloadCount || 0;
                                            if (!existing.lastAccess || (user.lastAccess && user.lastAccess > existing.lastAccess)) {
                                                existing.lastAccess = user.lastAccess;
                                            }
                                            for (const acc of (user.kakaoAccounts || [])) {
                                                if (!existing.kakaoAccounts.some(a => a.kakaoId === acc.kakaoId)) {
                                                    existing.kakaoAccounts.push(acc);
                                                }
                                            }
                                            if (user.isBlocked) existing.isBlocked = true;
                                            if (user.hasElectives) existing.hasElectives = true;
                                        } else {
                                            groupMap.set(key, {
                                                key,
                                                grade: user.grade ?? null,
                                                classNum: user.classNum ?? null,
                                                studentNumber: user.studentNumber ?? null,
                                                ips: [user],
                                                modificationCount: user.modificationCount || 0,
                                                printCount: user.printCount || 0,
                                                downloadCount: user.downloadCount || 0,
                                                lastAccess: user.lastAccess,
                                                kakaoAccounts: [...(user.kakaoAccounts || [])],
                                                isBlocked: !!user.isBlocked,
                                                hasElectives: !!user.hasElectives,
                                            });
                                        }
                                    }

                                    let groups = Array.from(groupMap.values());

                                    // --- Sort ---
                                    const handleSort = (col: 'id' | 'modCount' | 'lastAccess') => {
                                        if (sortColumn === col) {
                                            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setSortColumn(col);
                                            setSortDirection('asc');
                                        }
                                    };

                                    groups = groups.sort((a, b) => {
                                        let cmp = 0;
                                        if (sortColumn === 'id') {
                                            cmp = (a.grade ?? 99) - (b.grade ?? 99)
                                                || (a.classNum ?? 99) - (b.classNum ?? 99)
                                                || (a.studentNumber ?? 99) - (b.studentNumber ?? 99);
                                        } else if (sortColumn === 'modCount') {
                                            cmp = a.modificationCount - b.modificationCount;
                                        } else if (sortColumn === 'lastAccess') {
                                            const aT = a.lastAccess ?? '';
                                            const bT = b.lastAccess ?? '';
                                            cmp = aT < bT ? -1 : aT > bT ? 1 : 0;
                                        }
                                        return sortDirection === 'asc' ? cmp : -cmp;
                                    });

                                    const SortHeader = ({ col, label, className }: { col: 'id' | 'modCount' | 'lastAccess'; label: string; className?: string }) => (
                                        <TableHead
                                            className={`cursor-pointer select-none hover:bg-slate-50 transition-colors ${className ?? ''}`}
                                            onClick={() => handleSort(col)}
                                        >
                                            <div className="flex items-center gap-1">
                                                {label}
                                                {sortColumn === col
                                                    ? (sortDirection === 'asc'
                                                        ? <ChevronUp className="h-3 w-3 text-blue-500" />
                                                        : <ChevronDown className="h-3 w-3 text-blue-500" />)
                                                    : <ArrowUpDown className="h-3 w-3 text-gray-300" />
                                                }
                                            </div>
                                        </TableHead>
                                    );

                                    const toggleGroup = (key: string) => {
                                        setExpandedGroups(prev => {
                                            const next = new Set(prev);
                                            if (next.has(key)) next.delete(key);
                                            else next.add(key);
                                            return next;
                                        });
                                    };

                                    const IpSubRow = ({ user }: { user: IPProfile }) => (
                                        <TableRow className="bg-slate-50/80 text-xs">
                                            <TableCell className="pl-8 font-mono text-slate-500">
                                                <Button
                                                    variant="link"
                                                    className="p-0 h-auto font-mono text-blue-500 hover:text-blue-700 text-xs underline decoration-dotted"
                                                    onClick={() => setSelectedProfile(user)}
                                                >
                                                    ↳ {user.ip}
                                                </Button>
                                            </TableCell>
                                            <TableCell />
                                            <TableCell>
                                                {user.kakaoAccounts && user.kakaoAccounts.length > 0 ? (
                                                    user.kakaoAccounts.map((k, i) => (
                                                        <span key={i} className="text-xs text-slate-500">{k.kakaoNickname}</span>
                                                    ))
                                                ) : <span className="text-gray-300">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                {user.modificationCount > 0
                                                    ? <Badge variant="secondary" className="font-mono text-xs">{user.modificationCount}회</Badge>
                                                    : <span className="text-gray-300">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                {user.printCount && user.printCount > 0
                                                    ? <Badge variant="secondary" className="font-mono text-xs bg-blue-50 text-blue-700 border-blue-200">{user.printCount}회</Badge>
                                                    : <span className="text-gray-300">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                {user.downloadCount && user.downloadCount > 0
                                                    ? <Badge variant="secondary" className="font-mono text-xs bg-green-50 text-green-700 border-green-200">{user.downloadCount}회</Badge>
                                                    : <span className="text-gray-300">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                {user.isStandalone
                                                    ? <Badge variant="secondary" className="font-mono text-xs bg-purple-50 text-purple-700 border-purple-200">설치됨</Badge>
                                                    : <span className="text-gray-300">-</span>}
                                            </TableCell>
                                            <TableCell className="text-slate-400">
                                                {user.lastAccess ? new Date(user.lastAccess + 'Z').toLocaleString() : '-'}
                                            </TableCell>
                                            <TableCell />
                                            <TableCell>
                                                {user.isBlocked
                                                    ? <Badge variant="destructive" className="text-xs">차단됨</Badge>
                                                    : (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 px-2 text-xs"
                                                            onClick={() => {
                                                                if (confirm(`IP ${user.ip}를 차단하시겠습니까?`)) {
                                                                    blockUserMutation.mutate({ identifier: user.ip, type: 'IP' });
                                                                }
                                                            }}
                                                        >
                                                            <Ban className="h-3 w-3 mr-1" />차단
                                                        </Button>
                                                    )}
                                            </TableCell>
                                        </TableRow>
                                    );

                                    const GroupRow = ({ group }: { group: UserGroup }) => {
                                        const isExpanded = expandedGroups.has(group.key);
                                        const hasMultiple = group.ips.length > 1;
                                        const representativeUser = group.ips[0];
                                        return (
                                            <>
                                                <TableRow
                                                    className={`${hasMultiple ? 'cursor-pointer hover:bg-blue-50/50' : ''} ${group.isBlocked ? 'bg-red-50/30' : ''}`}
                                                    onClick={hasMultiple ? () => toggleGroup(group.key) : undefined}
                                                >
                                                    <TableCell className="font-mono">
                                                        {hasMultiple ? (
                                                            <div className="flex items-center gap-2">
                                                                {isExpanded
                                                                    ? <ChevronDown className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                                                    : <ChevronRight className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                                                }
                                                                <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 font-mono text-xs">
                                                                    IP {group.ips.length}개
                                                                </Badge>
                                                                <span className="text-xs text-slate-400 font-mono">{representativeUser.ip} 외</span>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                variant="link"
                                                                className="p-0 h-auto font-mono text-blue-600 hover:text-blue-800 underline decoration-dotted"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedProfile(representativeUser); }}
                                                            >
                                                                {representativeUser.ip}
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {group.grade && group.classNum ? (
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className="font-mono text-green-600 border-green-200 bg-green-50">
                                                                    {group.grade}-{group.classNum}{group.studentNumber ? `-${group.studentNumber}` : ''}
                                                                </Badge>
                                                                {group.hasElectives && (
                                                                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 px-1 py-0 h-4">
                                                                        선택과목
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        ) : <span className="text-gray-300 text-xs">-</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            {group.kakaoAccounts.length > 0 ? (
                                                                group.kakaoAccounts.map((k, i) => (
                                                                    <span key={i} className="font-bold text-xs">{k.kakaoNickname}</span>
                                                                ))
                                                            ) : <span className="text-gray-400 text-xs">-</span>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {group.modificationCount > 0 ? (
                                                            <Badge variant="secondary" className="font-mono">{group.modificationCount}회</Badge>
                                                        ) : <span className="text-gray-400 text-xs">-</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {group.printCount > 0 ? (
                                                            <Badge variant="secondary" className="font-mono bg-blue-50 text-blue-700 border-blue-200">{group.printCount}회</Badge>
                                                        ) : <span className="text-gray-400 text-xs">-</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {group.downloadCount > 0 ? (
                                                            <Badge variant="secondary" className="font-mono bg-green-50 text-green-700 border-green-200">{group.downloadCount}회</Badge>
                                                        ) : <span className="text-gray-400 text-xs">-</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {group.ips.some(ip => ip.isStandalone) ? (
                                                            <Badge variant="secondary" className="font-mono bg-purple-50 text-purple-700 border-purple-200">설치됨</Badge>
                                                        ) : <span className="text-gray-400 text-xs">-</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {group.lastAccess ? new Date(group.lastAccess + 'Z').toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                        {!hasMultiple && group.kakaoAccounts.length > 0 ? (
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    variant="outline" size="sm"
                                                                    className="text-purple-500 hover:text-purple-600 hover:bg-purple-50"
                                                                    onClick={async () => {
                                                                        if (!confirm("이 사용자에게 '수행평가 알림' 캘린더 일정을 등록하시겠습니까?\n(1분 후 시작, 10분간 지속, 즉시 알림)")) return;
                                                                        const targetKakaoId = group.kakaoAccounts[0].kakaoId;
                                                                        try {
                                                                            const response = await fetch('/api/admin/users/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password }, body: JSON.stringify({ kakaoId: targetKakaoId, title: "🔔 수행평가 확인 알림", description: "관리자가 보낸 수행평가 확인 알림입니다." }) });
                                                                            const data = await response.json();
                                                                            if (response.ok && data.success) { alert('캘린더 일정이 등록되었습니다.'); } else { alert(`실패: ${data.error || JSON.stringify(data)}`); }
                                                                        } catch (error: any) { alert(`오류: ${error.message}`); }
                                                                    }}
                                                                ><Calendar className="h-4 w-4 mr-1" />캘린더</Button>
                                                                <Button
                                                                    variant="outline" size="sm"
                                                                    className="text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                                                                    onClick={async () => {
                                                                        const message = prompt("전송할 메시지를 입력하세요:");
                                                                        if (!message) return;
                                                                        const targetKakaoId = group.kakaoAccounts[0].kakaoId;
                                                                        try {
                                                                            const response = await fetch('/api/admin/users/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password }, body: JSON.stringify({ ip: representativeUser.ip, kakaoId: targetKakaoId, message }) });
                                                                            const data = await response.json();
                                                                            alert(data.success ? '알림 전송됨 (개발중)' : '실패: ' + data.error);
                                                                        } catch { alert('오류 발생'); }
                                                                    }}
                                                                >📱 알림</Button>
                                                            </div>
                                                        ) : <span className="text-gray-400 text-xs">{hasMultiple ? '(펼쳐서 확인)' : '-'}</span>}
                                                    </TableCell>
                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                        {group.isBlocked ? (
                                                            <Badge variant="destructive">차단됨</Badge>
                                                        ) : (
                                                            <Button
                                                                variant="outline" size="sm"
                                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                                onClick={() => {
                                                                    if (confirm(`IP ${representativeUser.ip}를 차단하시겠습니까?`)) {
                                                                        blockUserMutation.mutate({ identifier: representativeUser.ip, type: 'IP' });
                                                                    }
                                                                }}
                                                            ><Ban className="h-4 w-4 mr-1" />차단</Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                                {hasMultiple && isExpanded && group.ips.map((user, idx) => (
                                                    <IpSubRow key={idx} user={user} />
                                                ))}
                                            </>
                                        );
                                    };

                                    return (
                                        <div className="space-y-6">
                                            <div className="rounded-md border overflow-x-auto">
                                                <Table className="min-w-[1000px]">
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="w-[120px] min-w-[120px]">IP 주소</TableHead>
                                                            <SortHeader col="id" label="학년/반/번호" className="w-[140px] min-w-[140px]" />
                                                            <TableHead className="w-[180px] min-w-[180px]">카카오 계정</TableHead>
                                                            <SortHeader col="modCount" label="수정 횟수" className="w-[100px] min-w-[100px]" />
                                                            <TableHead className="w-[80px] min-w-[80px]">출력</TableHead>
                                                            <TableHead className="w-[80px] min-w-[80px]">다운로드</TableHead>
                                                            <TableHead className="w-[80px] min-w-[80px]">앱설치</TableHead>
                                                            <SortHeader col="lastAccess" label="마지막 접속" className="w-[160px] min-w-[160px]" />
                                                            <TableHead className="w-[160px] min-w-[160px]">알림</TableHead>
                                                            <TableHead className="w-[160px] min-w-[160px]">관리</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {groups.map((group) => (
                                                            <GroupRow key={group.key} group={group} />
                                                        ))}
                                                        {groups.length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={10} className="h-24 text-center text-gray-500">
                                                                    일반 접속 기록이 없습니다.
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>

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
                                                        <span className="text-xs text-gray-500">학년/반 미기입 또는 브라우저 불분명</span>
                                                    </div>
                                                    {isOthersExpanded && (
                                                        <div className="bg-gray-50 border-t overflow-x-auto">
                                                            <Table className="min-w-[1000px]">
                                                                <TableBody>
                                                                    {unknownUsers.map((user: IPProfile, idx: number) => (
                                                                        <TableRow key={idx}>
                                                                            <TableCell className="font-mono">
                                                                                <Button variant="link" className="p-0 h-auto font-mono text-blue-600 hover:text-blue-800 underline decoration-dotted" onClick={() => setSelectedProfile(user)}>
                                                                                    {user.ip}
                                                                                </Button>
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                {user.grade && user.classNum ? (
                                                                                    <Badge variant="outline" className="font-mono text-green-600 border-green-200 bg-green-50">
                                                                                        {user.grade}-{user.classNum}{user.studentNumber ? `-${user.studentNumber}` : ''}
                                                                                    </Badge>
                                                                                ) : <span className="text-gray-300 text-xs">-</span>}
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                {user.modificationCount > 0 ? (
                                                                                    <Badge variant="secondary" className="font-mono">{user.modificationCount}회</Badge>
                                                                                ) : <span className="text-gray-400 text-xs">-</span>}
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                {user.printCount && user.printCount > 0 ? (
                                                                                    <Badge variant="secondary" className="font-mono bg-blue-50 text-blue-700 border-blue-200">{user.printCount}회</Badge>
                                                                                ) : <span className="text-gray-400 text-xs">-</span>}
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                {user.downloadCount && user.downloadCount > 0 ? (
                                                                                    <Badge variant="secondary" className="font-mono bg-green-50 text-green-700 border-green-200">{user.downloadCount}회</Badge>
                                                                                ) : <span className="text-gray-400 text-xs">-</span>}
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                {user.isStandalone ? (
                                                                                    <Badge variant="secondary" className="font-mono bg-purple-50 text-purple-700 border-purple-200">설치됨</Badge>
                                                                                ) : <span className="text-gray-400 text-xs">-</span>}
                                                                            </TableCell>
                                                                            <TableCell>{user.lastAccess ? new Date(user.lastAccess + 'Z').toLocaleString() : '-'}</TableCell>
                                                                            <TableCell>
                                                                                {user.isBlocked ? (
                                                                                    <Badge variant="destructive">차단됨</Badge>
                                                                                ) : (
                                                                                    <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                                                        onClick={() => { if (confirm(`IP ${user.ip}를 차단하시겠습니까?`)) blockUserMutation.mutate({ identifier: user.ip, type: 'IP' }); }}
                                                                                    ><Ban className="h-4 w-4 mr-1" />차단</Button>
                                                                                )}
                                                                            </TableCell>
                                                                        </TableRow>
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
                                <CardDescription>현재 차단 중인 대상입니다.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[180px] min-w-[180px]">대상 (IP/ID)</TableHead>
                                                <TableHead>사유</TableHead>
                                                <TableHead className="w-[160px] min-w-[160px]">차단 일시</TableHead>
                                                <TableHead className="w-[100px] min-w-[100px]">관리</TableHead>
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
                                                        <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                            onClick={() => { if (confirm("차단을 해제하시겠습니까?")) unblockUserMutation.mutate(blocked.id); }}>
                                                            <ShieldCheck className="h-4 w-4 mr-1" />해제
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {(!userData?.blockedUsers || userData.blockedUsers.length === 0) && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="h-24 text-center text-gray-500">차단된 사용자가 없습니다.</TableCell>
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

                <TabsContent value="class-free" className="space-y-6">
                    <ClassFreePeriodChecker adminPassword={password} />
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

                <TabsContent value="bridge" className="space-y-6">
                    <BridgeManager
                        adminPassword={password}
                        goAutoFillAnalysis={(bridgeData) => {
                            setAutoFillData(bridgeData);
                            setShowAutoFill(true);
                        }}
                    />
                </TabsContent>

                <TabsContent value="etc" className="space-y-6">
                    <EtcManager adminPassword={password} />
                </TabsContent>
            </Tabs >

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
        </div >
    );
}

function DatasetSelector({ rawData, adminPassword }: { rawData: any; adminPassword: string }) {
    const queryClient = useQueryClient();
    // Grade 2/3 dataset selection
    const [selectedProp, setSelectedProp] = useState<string>('');
    // Grade 1 dataset selection (separate)
    const [selectedPropGrade1, setSelectedPropGrade1] = useState<string>('');

    // Fetch current settings
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
            setSelectedProp(settingsQuery.data.comcigan_dataset_selected || '_auto_');
            setSelectedPropGrade1(settingsQuery.data.comcigan_dataset_selected_grade1 || '_auto_');
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

    const latestDatasetName = timetableProps && timetableProps.length > 0 ? timetableProps[0] : '없음';

    // Grade 2/3 dirty tracking
    const displayValue = selectedProp || '_auto_';
    const originalValue = settingsQuery.data?.comcigan_dataset_selected || '_auto_';
    const isDirty = displayValue !== originalValue;

    // Grade 1 dirty tracking
    const displayValueG1 = selectedPropGrade1 || '_auto_';
    const originalValueG1 = settingsQuery.data?.comcigan_dataset_selected_grade1 || '_auto_';
    const isDirtyG1 = displayValueG1 !== originalValueG1;

    const DatasetDropdown = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder="데이터셋 선택" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="_auto_">자동 (최신: {latestDatasetName})</SelectItem>
                <SelectItem value="MANUAL_PLAN">MANUAL_PLAN (학기별 계획 수동 입력)</SelectItem>
                {timetableProps.map(prop => (
                    <SelectItem key={prop} value={prop}>{prop}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader>
                <CardTitle>출체 데이터셋 선택</CardTitle>
                <CardDescription>
                    메인 화면의 시간표에서 출력할 원본 데이터셋을 학년별로 선택합니다.
                    &quot;자동&quot;으로 설정할 경우 가장 최신 데이터셋을 자동으로 선택합니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Grade 1 dataset */}
                <div className="space-y-2 border rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-700">1학년 데이터셋</span>
                    </div>
                    <DatasetDropdown value={displayValueG1} onChange={setSelectedPropGrade1} />
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => setSelectedPropGrade1(originalValueG1)} disabled={!isDirtyG1 || saveMutation.isPending}>
                            변경 취소
                        </Button>
                        <Button size="sm" onClick={() => saveMutation.mutate({ comcigan_dataset_selected_grade1: selectedPropGrade1 === '_auto_' ? '' : selectedPropGrade1 })} disabled={!isDirtyG1 || saveMutation.isPending}>
                            {saveMutation.isPending ? "저장 중..." : "저장"}
                        </Button>
                    </div>
                </div>

                {/* Grade 2/3 dataset */}
                <div className="space-y-2 border rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-700">2/3학년 데이터셋</span>
                        <span className="text-xs text-slate-400">(그룹 확인기, 선택과목 자동 등에 적용)</span>
                    </div>
                    <DatasetDropdown value={displayValue} onChange={setSelectedProp} />
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => setSelectedProp(originalValue)} disabled={!isDirty || saveMutation.isPending}>
                            변경 취소
                        </Button>
                        <Button size="sm" onClick={() => saveMutation.mutate({ comcigan_dataset_selected: selectedProp === '_auto_' ? '' : selectedProp })} disabled={!isDirty || saveMutation.isPending}>
                            {saveMutation.isPending ? "저장 중..." : "저장"}
                        </Button>
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}

function AutoFillAnalyzer({ data, adminPassword, onBack }: {
    data: { grade: number, fromDataset: string, toDataset: string, mappingRules: any[] },
    adminPassword: string,
    onBack: () => void
}) {
    const queryClient = useQueryClient();
    const grade = data.grade;
    const bridgeMappingRules = data.mappingRules || [];
    const targetDataset = data.toDataset;

    // Fetch current setting to determine default
    const settingsQuery = useQuery({
        queryKey: ["admin", "settings"],
        queryFn: async () => {
            const res = await fetch("/api/admin/settings", { headers: { "X-Admin-Password": adminPassword } });
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        }
    });

    const currentPlan = React.useMemo(() => {
        if (!settingsQuery.data || !settingsQuery.data.manual_semester_plan) return { grade, timetables: {}, groups: {}, subjects: [] };
        try {
            const parsed = JSON.parse(settingsQuery.data.manual_semester_plan);
            parsed.grade = grade;
            return parsed;
        } catch {
            return { grade, timetables: {}, groups: {}, subjects: [] };
        }
    }, [settingsQuery.data, grade]);

    // 1. Fetch Live Subjects from Comcigan (target dataset)
    const liveSubjectsQuery = useQuery({
        queryKey: ["admin", "comcigan-subjects", grade, targetDataset],
        queryFn: async () => {
            const res = await fetch(`/api/admin/comcigan-subjects?grade=${grade}&dataset=${targetDataset}`);
            if (!res.ok) throw new Error("Failed to fetch live subjects");
            return res.json();
        }
    });

    // 2. Algorithm to analyze manual plan and map subjects to predefined groups
    const analysis = React.useMemo(() => {
        let warnings: string[] = [];
        let infos: string[] = [];
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
            } else if (!explicitGroup && uniqueSubjsInPeriod.size > 0) {
                // -빈칸- 인 경우 일괄적으로 비-이동수업(NO_GROUP)으로 취급
                const groupName = "NO_GROUP";
                uniqueSubjsInPeriod.forEach(subj => {
                    if (!subjectToBlocks.has(subj)) subjectToBlocks.set(subj, new Set());
                    subjectToBlocks.get(subj)!.add(groupName);
                });

                if (!blockToOccurrences.has(groupName)) {
                    blockToOccurrences.set(groupName, []);
                }
                const timeStr = `${['월', '화', '수', '목', '금'][parseInt(timeKey.split('-')[0])]}${timeKey.split('-')[1]}교시`;
                if (!blockToOccurrences.get(groupName)!.includes(timeStr)) {
                    blockToOccurrences.get(groupName)!.push(timeStr);
                }
            }
        });

        // Detect conflicts (a subject assigned to multiple blocks)
        subjectToBlocks.forEach((blocks, subj) => {
            if (blocks.size > 1) {
                infos.push(`[${subj}] 과목이 여러 블록(${Array.from(blocks).join(', ')})에 배정되었습니다.`);
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

        return { blocks, manualSubjects: validManualSubjects, warnings, infos, subjectToBlocks };
    }, [currentPlan, grade]);

    const executeMutation = useMutation({
        mutationFn: async () => {
            const payloadMap = new Map<string, any>();

            for (const mSubj of analysis.manualSubjects) {
                const isExcludedManual = ["빈교실", "공강", "채플", "창체", "자습", "동아리", "점심시간", "Empty", "Free"].some(ex => mSubj.trim().includes(ex));

                let targetSubjectName = "";
                let matchedTeacher = "";

                const parts = mSubj.split(' ');
                const baseSubjectName = parts.length > 1 ? parts.slice(0, -1).join(' ') : mSubj;
                const manualTeacherName = parts.length >= 2 ? parts[parts.length - 1] : "";

                if (isExcludedManual) {
                    targetSubjectName = parts.length > 0 ? parts[0] : mSubj;
                    matchedTeacher = manualTeacherName;
                } else {
                    // Look up BRIDGE mappings instead of local 'mappings' state
                    const bridgeRule = bridgeMappingRules.find(r => r.from === baseSubjectName);
                    if (!bridgeRule || !bridgeRule.to) {
                        throw new Error(`[${mSubj}]의 기본 과목명인 [${baseSubjectName}] 과목이 BRIDGE 매핑 규칙에 지정되어 있지 않습니다.`);
                    }

                    targetSubjectName = bridgeRule.to;

                    // Live Match extraction
                    matchedTeacher = manualTeacherName;
                    if (liveSubjectsQuery.data) {
                        const liveMatches = liveSubjectsQuery.data.filter((ls: any) => ls.subject === targetSubjectName);
                        if (liveMatches.length > 0) {
                            const exactMatch = liveMatches.find((ls: any) => ls.teacher === manualTeacherName);
                            matchedTeacher = exactMatch ? exactMatch.teacher : liveMatches[0].teacher;
                        }
                    }
                }

                const subj = targetSubjectName;
                const teacher = matchedTeacher;
                const mappingKey = `${subj}-${teacher}`;
                const myBlocks = analysis.blocks.filter(b => b.subjects.has(mSubj));
                if (myBlocks.length === 0) throw new Error(`${mSubj} 과목의 블록을 찾을 수 없습니다.`);

                const isExcluded = ["빈교실", "공강", "채플", "창체", "자습", "동아리", "점심시간", "Empty", "Free"].some(ex => subj.trim().includes(ex));

                // Always use blocks, even for excluded subjects (so free periods are linked to groups)
                const allCodes = myBlocks.map(b => b.code).filter(c => c !== "NO_GROUP");
                const isNoGroup = allCodes.length === 0;

                const existingPayload = payloadMap.get(mappingKey);
                if (existingPayload) {
                    const existingCodes = existingPayload.classCode ? existingPayload.classCode.split(',') : [];
                    const mergedCodes = Array.from(new Set([...existingCodes, ...allCodes])).filter(Boolean).sort();

                    existingPayload.classCode = mergedCodes.join(',');
                    existingPayload.isMovingClass = isExcluded ? false : (existingPayload.isMovingClass || !isNoGroup);
                } else {
                    payloadMap.set(mappingKey, {
                        grade: grade,
                        subject: subj,
                        originalTeacher: teacher,
                        classCode: allCodes.sort().join(","),
                        isMovingClass: !isExcluded && !isNoGroup,
                        isCombinedClass: false,
                        dataset: targetDataset
                    });
                }
            }

            // Convert map values back to the payloads array format
            const payloads = Array.from(payloadMap.values());

            // Clear old mapping for this dataset explicitly to handle duplicate groups fresh
            await fetch(`/api/admin/electives?dataset=${targetDataset}&grade=${grade}`, {
                method: "DELETE",
                headers: { "X-Admin-Password": adminPassword }
            });

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

                {analysis.infos.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex items-start gap-3">
                        <Info className="w-5 h-5 mt-0.5 shrink-0" />
                        <div className="text-sm">
                            <p className="font-bold mb-1">참고 (정상 작동)</p>
                            <ul className="list-disc pl-4 space-y-1">
                                {analysis.infos.map((info, i) => <li key={i}>{info}</li>)}
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
                                    <li key={b.code} className="text-sm flex flex-col gap-1">
                                        <div className="flex items-center">
                                            <Badge variant="outline" className={`mr-2 ${b.code === "NO_GROUP" ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-orange-100 text-orange-800 border-orange-200'}`}>
                                                {b.code === "NO_GROUP" ? "일반 수업 (묶음X)" : `${b.code} 블록`}
                                            </Badge>
                                            <span className="text-slate-600 truncate">{Array.from(b.subjects).join(', ')}</span>
                                        </div>
                                        <div className="text-xs text-slate-400 mt-1 pl-10">
                                            {b.occurrences.join(', ')}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="border rounded-md p-4 bg-slate-50 overflow-hidden flex flex-col justify-center items-center text-center space-y-4">
                        <div className="p-3 bg-white rounded-full border shadow-sm">
                            <ArrowRight className="w-8 h-8 text-slate-400" />
                        </div>
                        <h4 className="font-bold text-lg text-slate-700">지정된 BRIDGE 매핑 사용</h4>
                        <div className="flex items-center gap-3">
                            <Badge variant="outline" className="bg-slate-100 px-3 py-1">{data.fromDataset}</Badge>
                            <ArrowRight className="w-4 h-4 text-slate-400" />
                            <Badge variant="outline" className="bg-orange-100 text-orange-800 px-3 py-1">{data.toDataset}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 max-w-[250px]">
                            우측 표 대신, <strong>{bridgeMappingRules.length}개</strong>의 BRIDGE 자동 매핑 규칙이 일괄 적용됩니다.
                        </p>
                    </div>
                </div>

                <div className="flex justify-between gap-2 pt-4 border-t border-orange-100">
                    <Button variant="outline" onClick={onBack} disabled={executeMutation.isPending}>
                        취소 (뒤로가기)
                    </Button>
                    <Button
                        className="bg-orange-600 hover:bg-orange-700"
                        disabled={analysis.warnings.some(w => w.includes("중복") || w.includes("미확인")) || liveSubjectsQuery.isLoading || executeMutation.isPending || bridgeMappingRules.length === 0}
                        onClick={() => executeMutation.mutate()}
                    >
                        {executeMutation.isPending ? "저장 중..." : "선택과목 자동 생성 / 저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function ManualTimetableCell({
    value,
    onChange,
    subjects,
    onAddSubject,
    isSafeMode,
    groupInfo
}: {
    value: string;
    onChange: (val: string) => void;
    subjects: string[];
    onAddSubject: (val: string) => void;
    isSafeMode: boolean;
    groupInfo?: string
}) {
    const [inputValue, setInputValue] = useState("");

    useEffect(() => {
        setInputValue(value || "");
    }, [value]);

    const handleCommit = () => {
        const trimmed = inputValue.trim();
        if (!trimmed) {
            onChange("");
            return;
        }

        if (isSafeMode) {
            if (subjects.includes(trimmed)) {
                onChange(trimmed);
            } else {
                setInputValue(value || "");
            }
        } else {
            if (!subjects.includes(trimmed)) {
                onAddSubject(trimmed);
            }
            onChange(trimmed);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleCommit();
            // Blurring or pressing enter acts similarly
            e.currentTarget.blur();
        }
    };

    const displayVal = value || "__EMPTY__";
    const filteredSubjects = isSafeMode && inputValue && inputValue !== value
        ? subjects.filter(s => s.toLowerCase().includes(inputValue.toLowerCase()))
        : subjects;

    return (
        <TableCell className="p-1 border-r text-center align-middle relative h-[50px]">
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

            <div className={`flex items-center w-full h-full mt-3 border rounded-sm transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 ${value ? 'bg-blue-50/30' : 'bg-transparent'}`}>
                <input
                    type="text"
                    className="flex-1 w-[40px] text-xs outline-none bg-transparent px-1 text-slate-800"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={handleCommit}
                    onKeyDown={handleKeyDown}
                    placeholder={isSafeMode ? "검색" : "입력"}
                    title={isSafeMode ? "검색어 입력" : "과목명 입력 후 Enter로 자동 등록"}
                />
                <Select
                    value={displayVal}
                    onValueChange={(val) => {
                        const newVal = val === "__EMPTY__" ? "" : val;
                        setInputValue(newVal);
                        onChange(newVal);
                    }}
                >
                    <SelectTrigger className="w-6 h-6 p-0 border-none shadow-none bg-transparent flex items-center justify-center shrink-0">
                        <span className="sr-only">선택</span>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__EMPTY__" className="text-slate-400">비어있음</SelectItem>
                        {filteredSubjects.map(subj => (
                            <SelectItem key={subj} value={subj}>
                                {subj}
                            </SelectItem>
                        ))}
                        {isSafeMode && filteredSubjects.length === 0 && (
                            <div className="text-xs text-slate-400 p-2 text-center">결과 없음</div>
                        )}
                    </SelectContent>
                </Select>
            </div>
        </TableCell>
    );
}

function ManualSemesterPlan({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [showAutoFill, setShowAutoFill] = useState(false);
    // subjects structure: { "1": ["Math"], "2": ["Sci"], "3": [] }
    const [subjects, setSubjects] = useState<Record<string, string[]>>({});
    const [newSubject, setNewSubject] = useState("");
    const [grade, setGrade] = useState("2");
    const [classNum, setClassNum] = useState("1");
    const [isSafeMode, setIsSafeMode] = useState(true);
    // Track which grades have already been auto-imported this session to avoid overwriting manual edits
    const autoImportedGrades = useRef<Set<string>>(new Set());

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
                let loadedSubjects = data.subjects || {};

                // Backwards compatibility: upgrade string[] to Record<string, string[]>
                // Only migrate to grade "2" — grade 1 and 3 start empty and must be set separately
                if (Array.isArray(loadedSubjects)) {
                    loadedSubjects = {
                        "2": [...loadedSubjects]
                    };
                }

                setSubjects(loadedSubjects);
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
        const currentSubjects = subjects[grade] || [];
        if (currentSubjects.includes(newSubject.trim())) {
            toast.error("이미 존재하는 과목입니다.");
            return;
        }
        setSubjects({ ...subjects, [grade]: [...currentSubjects, newSubject.trim()] });
        setNewSubject("");
    };

    const removeSubject = (subj: string) => {
        const currentSubjects = subjects[grade] || [];
        setSubjects({ ...subjects, [grade]: currentSubjects.filter(s => s !== subj) });
    };

    const clearSubjectsForGrade = () => {
        if (!confirm(`${grade}학년 과목 목록을 모두 삭제하시겠습니까?`)) return;
        setSubjects(prev => ({ ...prev, [grade]: [] }));
    };

    // Auto-load subjects for the selected grade when the grade has no subjects yet
    const autoImportDataset = settingsQuery.data?.comcigan_dataset_selected;
    const autoImportQuery = useQuery({
        queryKey: ["admin", "autoImportSubjects", grade, autoImportDataset],
        queryFn: async () => {
            if (!autoImportDataset || grade === "1") return [];
            const res = await fetch(`/api/admin/electives?grade=${grade}&dataset=${autoImportDataset}`, {
                headers: { "X-Admin-Password": adminPassword },
            });
            if (!res.ok) return [];
            const data = await res.json();
            // Build "과목명 교사명" entries (matching the manual plan's timetable parsing format)
            // Use a Set keyed by "subject|teacher" to deduplicate, then format as "과목 교사"
            const seen = new Set<string>();
            const entries: string[] = [];
            for (const item of data) {
                const subj = (item.subject || "").trim();
                const teacher = (item.originalTeacher || "").trim();
                if (!subj) continue;
                const key = teacher ? `${subj} ${teacher}` : subj;
                if (!seen.has(key)) {
                    seen.add(key);
                    entries.push(key);
                }
            }
            return entries;
        },
        enabled: !!autoImportDataset && grade !== "1",
        staleTime: 1000 * 60 * 5, // 5 min cache per grade
    });

    useEffect(() => {
        const fetched = autoImportQuery.data;
        // Only auto-import each grade ONCE per session.
        // Switching back to a previously-visited grade won't overwrite manual edits.
        if (fetched && fetched.length > 0 && !autoImportedGrades.current.has(grade)) {
            autoImportedGrades.current.add(grade);
            setSubjects(prev => ({ ...prev, [grade]: fetched }));
        }
    }, [autoImportQuery.data, grade]);

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
                            <SelectItem value="1">1학년</SelectItem>
                            <SelectItem value="2">2학년</SelectItem>
                            <SelectItem value="3">3학년</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Elective Group Grid — only for grade 2/3 */}
                {grade !== "1" && (
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
                )}

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
                        {(subjects[grade] || []).length > 0 && (
                            <Button
                                variant="outline"
                                onClick={clearSubjectsForGrade}
                                className="text-red-500 border-red-200 hover:bg-red-50"
                            >
                                이 학년 과목 초기화
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(!subjects[grade] || subjects[grade].length === 0) && <span className="text-gray-400 text-sm">등록된 과목이 없습니다.</span>}
                        {(subjects[grade] || []).map(subj => (
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
                    <div className="bg-blue-50/50 p-4 border-b flex flex-col md:flex-row md:items-center gap-4">
                        <div className="font-bold flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            조회 및 수정
                        </div>
                        <div className="flex-1"></div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="safe-mode" checked={isSafeMode} onCheckedChange={(val) => setIsSafeMode(!!val)} />
                            <label htmlFor="safe-mode" className="text-sm font-bold cursor-pointer transition-colors tooltip cursor-help flex items-center gap-1" title="체크 시 입력란은 검색으로만 기능하며, 체크 해제 시 새로운 과목 입력 후 Enter를 누르면 과목이 자동 추가됩니다.">
                                역등록 안전 모드
                                {isSafeMode ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <ShieldAlert className="w-4 h-4 text-orange-500" />}
                            </label>
                        </div>
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
                                                <ManualTimetableCell
                                                    key={weekday}
                                                    value={currentVal}
                                                    onChange={(val) => handleTimetableChange(weekday, period, val)}
                                                    subjects={subjects[grade] || []}
                                                    onAddSubject={(val) => {
                                                        const currentSubjects = subjects[grade] || [];
                                                        if (!currentSubjects.includes(val)) {
                                                            setSubjects(prev => ({ ...prev, [grade]: [...(prev[grade] || []), val] }));
                                                        }
                                                    }}
                                                    isSafeMode={isSafeMode}
                                                    groupInfo={groupInfo}
                                                />
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
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

    const [maintenanceActive, setMaintenanceActive] = useState(false);
    const [maintenanceDuration, setMaintenanceDuration] = useState("3"); // hours
    const [maintenanceMessage, setMaintenanceMessage] = useState("서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요.");
    const [maintenanceEndTime, setMaintenanceEndTime] = useState<string | null>(null);
    const [maintenanceStartTime, setMaintenanceStartTime] = useState<string | null>(null);

    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const getRemainingText = (targetMs: number) => {
        const diff = targetMs - now;
        if (diff <= 0) return "(종료됨)";

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        if (h > 0) return `(${h}시간 ${m}분 남음)`;
        if (m > 0) return `(${m}분 ${s}초 남음)`;
        return `(${s}초 남음)`;
    };

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
                const parsedMaint = settingsQuery.data.maintenance_mode ? JSON.parse(settingsQuery.data.maintenance_mode) : null;
                if (parsedMaint) {
                    setMaintenanceActive(!!parsedMaint.active);
                    setMaintenanceMessage(parsedMaint.message || "서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요.");
                    setMaintenanceEndTime(parsedMaint.endTime || null);
                    setMaintenanceStartTime(parsedMaint.startTime || null);
                    // Duration is visual only during active set, keep default 3
                } else {
                    setMaintenanceActive(false);
                    setMaintenanceMessage("서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요.");
                    setMaintenanceEndTime(null);
                    setMaintenanceStartTime(null);
                }
            } catch {
                setMaintenanceActive(false);
                setMaintenanceMessage("서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요.");
                setMaintenanceStartTime(null);
            }

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
            queryClient.invalidateQueries({ queryKey: ["publicSettings"] });
        },
        onError: (err) => {
            toast.error(`저장 실패: ${err.message}`);
        },
    });

    const saveMaintenanceMutation = useMutation({
        mutationFn: async (newData: any) => {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword,
                },
                body: JSON.stringify(newData),
            });
            if (!res.ok) throw new Error("Failed to save maintenance settings");
            return res.json();
        },
        onSuccess: () => {
            // Only invalidate publicSettings so we don't wipe out unsaved user inputs in other fields by triggering resetState()
            queryClient.invalidateQueries({ queryKey: ["publicSettings"] });
        },
        onError: (err) => {
            toast.error(`점검 모드 저장 실패: ${err.message}`);
        },
    });

    const handleSave = () => {
        const ips = ipWhitelist.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 0);

        saveMutation.mutate({
            restricted_grades: JSON.stringify(restrictedGrades),
            restriction_reason: restrictionReason,
            ip_whitelist: JSON.stringify(ips),
            kakao_login_restricted: String(kakaoLoginRestricted),
            maintenance_mode: JSON.stringify({
                active: maintenanceActive,
                endTime: maintenanceEndTime,
                message: maintenanceMessage,
                startTime: maintenanceStartTime
            })
        });
    };

    const handleMaintenanceSave = (overrideMaint: { active: boolean; endTime: string | null; startTime: string | null; duration?: string }) => {
        const activeState = overrideMaint.active;
        const currentStartTime = overrideMaint.startTime;
        let newEndTime = overrideMaint.endTime;
        const currentDuration = overrideMaint.duration !== undefined ? overrideMaint.duration : maintenanceDuration;

        // Calculate new end time if recalculating
        if (activeState && currentDuration !== "unlimited" && currentStartTime) {
            const hours = parseInt(currentDuration);
            const endDate = new Date(currentStartTime);
            endDate.setHours(endDate.getHours() + hours);
            newEndTime = endDate.toISOString();
        } else if (activeState && currentDuration === "unlimited") {
            newEndTime = null;
        }

        saveMaintenanceMutation.mutate({
            maintenance_mode: JSON.stringify({
                active: activeState,
                endTime: newEndTime,
                message: maintenanceMessage,
                startTime: currentStartTime
            })
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

    let savedMaintStr = "";
    const defaultMaintenanceMessage = "서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요.";
    try {
        const parsed = settingsQuery.data?.maintenance_mode ? JSON.parse(settingsQuery.data.maintenance_mode) : null;
        savedMaintStr = parsed
            ? JSON.stringify({ active: !!parsed.active, message: parsed.message || defaultMaintenanceMessage })
            : JSON.stringify({ active: false, message: defaultMaintenanceMessage });
    } catch {
        savedMaintStr = JSON.stringify({ active: false, message: defaultMaintenanceMessage });
    }

    const currentMaintStr = JSON.stringify({ active: maintenanceActive, message: maintenanceMessage });
    // We ignore duration/endTime/startTime check for dirtiness since it's dynamic
    const isMaintenanceDirty = currentMaintStr !== savedMaintStr;

    const isDirty = isGradesDirty || isReasonDirty || isKakaoRestrictedDirty || isIpsDirty || isMaintenanceDirty;

    return (
        <div className="space-y-6 flex flex-col items-center">
            {/* Maintenance Mode Card */}
            <Card className="w-full max-w-2xl border-red-200 shadow-sm">
                <CardHeader className="bg-red-50/50 rounded-t-xl pb-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-red-600 flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5" />
                                사이트 점검 모드 (Maintenance)
                            </CardTitle>
                            <CardDescription className="text-red-900/60 mt-1">
                                활성화 시 지정된 시간 동안 관리자 및 IP 화이트리스트를 제외한 모든 접속이 차단됩니다.
                            </CardDescription>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className={`text-sm font-bold ${maintenanceActive ? 'text-red-600' : 'text-slate-400'}`}>
                                {maintenanceActive ? "점검 중" : "비활성"}
                            </span>
                            <Checkbox
                                checked={maintenanceActive}
                                disabled={maintenanceActive} // Once turned on, can only be turned off by immediate disable
                                onCheckedChange={(c) => {
                                    if (c === true) {
                                        setMaintenanceActive(true);
                                        const nowStr = new Date().toISOString();
                                        setMaintenanceStartTime(nowStr);
                                        setMaintenanceEndTime(null);
                                        handleMaintenanceSave({ active: true, endTime: null, startTime: nowStr, duration: maintenanceDuration });
                                    }
                                }}
                                className="w-6 h-6 rounded-full data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 disabled:opacity-50"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold">점검 진행 시간</label>
                            <Select
                                value={maintenanceDuration}
                                onValueChange={(val) => {
                                    setMaintenanceDuration(val);
                                    if (maintenanceActive) {
                                        handleMaintenanceSave({ active: true, endTime: null, startTime: maintenanceStartTime, duration: val });
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="기간 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1시간</SelectItem>
                                    <SelectItem value="3">3시간</SelectItem>
                                    <SelectItem value="12">12시간</SelectItem>
                                    <SelectItem value="24">24시간 (1일)</SelectItem>
                                    <SelectItem value="unlimited">무제한 (수동 해제)</SelectItem>
                                </SelectContent>
                            </Select>
                            {maintenanceActive && (
                                <p className="text-xs text-red-500 font-medium h-4">
                                    {maintenanceDuration === "unlimited" ? (
                                        "수동으로 해제할 때까지 무제한 적용됩니다."
                                    ) : maintenanceStartTime && (
                                        (() => {
                                            const isSaved = maintenanceEndTime && new Date(maintenanceEndTime).getTime() === new Date(new Date(maintenanceStartTime).getTime() + parseInt(maintenanceDuration) * 3600000).getTime();
                                            const endDate = new Date(maintenanceStartTime);
                                            endDate.setHours(endDate.getHours() + parseInt(maintenanceDuration));
                                            return `종료 예정${isSaved ? '' : ' (저장 전)'}: ${endDate.toLocaleString()} ${getRemainingText(endDate.getTime())}`;
                                        })()
                                    )}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2 flex flex-col justify-end pb-[2px]">
                            {maintenanceActive && (
                                <Button
                                    variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                    onClick={() => {
                                        setMaintenanceActive(false);
                                        setMaintenanceEndTime(null);
                                        setMaintenanceStartTime(null);
                                        handleMaintenanceSave({ active: false, endTime: null, startTime: null }); // Force save "OFF" over stale state
                                    }}
                                >
                                    즉시 점검 해제
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2 mt-4">
                        <label className="text-sm font-bold">점검 안내 메시지</label>
                        <Textarea
                            value={maintenanceMessage}
                            onChange={(e) => setMaintenanceMessage(e.target.value)}
                            placeholder="점검 사유를 입력하세요 (예: DB 안정화 작업)"
                            rows={3}
                        />
                    </div>
                </CardContent>
            </Card>

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
                        <Button onClick={() => handleSave()} disabled={!isDirty || saveMutation.isPending}>
                            {saveMutation.isPending ? "저장 중..." : "설정 저장"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function AllowDownloadSettings({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();
    const [allowedGrades, setAllowedGrades] = useState<number[]>([1, 2, 3]);
    const [allowPngDownload, setAllowPngDownload] = useState(true);
    const [printSubjectFontSize, setPrintSubjectFontSize] = useState("large");

    const settingsQuery = useQuery({
        queryKey: ["admin", "settings", "allowDownload"],
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
            setAllowedGrades(
                settingsQuery.data.allow_print_by_grade
                    ? JSON.parse(settingsQuery.data.allow_print_by_grade)
                    : [1, 2, 3]
            );
            setAllowPngDownload(settingsQuery.data.allow_png_download !== 'false');
            setPrintSubjectFontSize(settingsQuery.data.print_subject_font_size || 'large');
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
            toast.success("프린트 및 내려받기 설정이 저장되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
            queryClient.invalidateQueries({ queryKey: ["publicSettings"] });
        },
        onError: (err) => {
            toast.error(`저장 실패: ${err.message}`);
        },
    });

    if (settingsQuery.isLoading) return <div className="p-4">설정을 불러오는 중...</div>;

    const savedValue = settingsQuery.data?.allow_print_by_grade
        ? JSON.parse(settingsQuery.data.allow_print_by_grade)
        : [1, 2, 3];
    const savedPngAllow = settingsQuery.data?.allow_png_download !== 'false';
    const savedFontSize = settingsQuery.data?.print_subject_font_size || 'large';
    const isDirty = (JSON.stringify(savedValue.sort()) !== JSON.stringify(allowedGrades.sort())) || (savedPngAllow !== allowPngDownload) || (savedFontSize !== printSubjectFontSize);

    const toggleGrade = (grade: number) => {
        setAllowedGrades(prev =>
            prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade]
        );
    };

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader>
                <CardTitle>프린트 및 내려받기 설정</CardTitle>
                <CardDescription>
                    일반 사용자가 메인 대시보드에서 시간표를 이미지(PNG)로 저장할 수 있도록 허용할지 여부와 인쇄 시 적용할 글꼴 크기를 설정합니다.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-3 pt-4">
                    <Label className="font-medium text-sm">전체 PNG 저장 기능 허용</Label>
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="allow-png-download"
                            checked={allowPngDownload}
                            onCheckedChange={(c) => setAllowPngDownload(!!c)}
                        />
                        <label
                            htmlFor="allow-png-download"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            시간표 내려받기 (이미지 저장) 허용
                        </label>
                    </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                    <Label className="font-medium text-sm">인쇄/저장 허용 학년</Label>
                    <p className="text-xs text-gray-500 mb-2">체크된 학년의 사용자만 메인 대시보드에서 시간표 인쇄 및 이미지(PNG) 저장 기능을 사용할 수 있습니다.</p>
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3].map((grade) => (
                            <div key={grade} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`allow-print-grade-${grade}`}
                                    checked={allowedGrades.includes(grade)}
                                    onCheckedChange={() => toggleGrade(grade)}
                                />
                                <label
                                    htmlFor={`allow-print-grade-${grade}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    {grade}학년 인쇄/저장 허용
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-100">
                    <Label className="font-medium text-sm">프린트 과목명 글자 크기</Label>
                    <Select value={printSubjectFontSize} onValueChange={setPrintSubjectFontSize}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="과목명 크기 선택" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="medium">조금 크게 (1단계 설정)</SelectItem>
                            <SelectItem value="large">매우 크게 (2단계 설정, 기본값)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="outline" onClick={resetState} disabled={!isDirty || saveMutation.isPending}>
                        변경 취소
                    </Button>
                    <Button onClick={() => saveMutation.mutate({
                        allow_print_by_grade: JSON.stringify(allowedGrades),
                        allow_png_download: allowPngDownload ? "true" : "false",
                        print_subject_font_size: printSubjectFontSize
                    })} disabled={!isDirty || saveMutation.isPending}>
                        {saveMutation.isPending ? "저장 중..." : "설정 저장"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ----------------------------------------------------------------------
// SamsungInstallSettings - Controls Samsung Internet PWA button visibility
// Located under: 기타 > 미해결 문제
// ----------------------------------------------------------------------
function SamsungInstallSettings({ adminPassword }: { adminPassword: string }) {
    const queryClient = useQueryClient();

    const { data: settingsData, isLoading } = useQuery({
        queryKey: ["admin", "samsungInstallSettings"],
        queryFn: async () => {
            const res = await fetch("/api/settings/public");
            if (!res.ok) throw new Error("설정 불러오기 실패");
            return res.json();
        }
    });

    const isSamsungButtonVisible = settingsData?.samsung_install_button_visible !== false;
    const isPwaButtonVisible = settingsData?.pwa_install_button_visible !== false;

    const saveSettingMutation = useMutation({
        mutationFn: async (payload: Record<string, string>) => {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword,
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("저장 실패");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "samsungInstallSettings"] });
            queryClient.invalidateQueries({ queryKey: ["publicSettings"] });
            toast.success("설정이 저장되었습니다.");
        },
        onError: () => {
            toast.error("설정 저장에 실패했습니다.");
        }
    });

    if (isLoading) {
        return <div className="text-gray-400 p-4">설정을 불러오는 중...</div>;
    }

    return (
        <div className="space-y-6 p-1">
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                <p className="font-semibold mb-1">⚠️ 미해결 문제: 삼성 인터넷 홈 화면 추가</p>
                <p className="text-orange-700">
                    삼성 인터넷에서 <strong>beforeinstallprompt</strong> 이벤트가 일관성 없이 발생합니다.
                    현재 <code className="bg-orange-100 px-1 rounded">display: minimal-ui + display_override</code> 방식으로
                    "Add to apps" / "Add to Home screen" 두 옵션을 제공 중입니다.
                    버튼이 작동하지 않는 경우 아래에서 버튼을 숨길 수 있습니다.
                </p>
            </div>

            {/* Global toggle - hides button for ALL browsers */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">앱 다운로드 버튼 전체 표시 (모든 브라우저)</CardTitle>
                    <CardDescription>
                        모든 브라우저에서 홈 화면 추가 / 앱 다운로드 버튼 표시 여부를 전체적으로 제어합니다.
                        OFF 시 삼성 인터넷 토글은 무의미합니다.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Switch
                            id="pwa-install-button-toggle"
                            checked={isPwaButtonVisible}
                            onCheckedChange={(checked) => saveSettingMutation.mutate({ pwa_install_button_visible: checked ? "true" : "false" })}
                            disabled={saveSettingMutation.isPending}
                        />
                        <Label htmlFor="pwa-install-button-toggle" className="cursor-pointer">
                            {isPwaButtonVisible
                                ? <span className="text-green-700 font-medium">✅ 버튼 표시 중 (전체 브라우저)</span>
                                : <span className="text-gray-500 font-medium">🔴 전체 숨김</span>
                            }
                        </Label>
                    </div>
                </CardContent>
            </Card>

            {/* Samsung-specific toggle */}
            <Card className={!isPwaButtonVisible ? "opacity-50 pointer-events-none" : ""}>
                <CardHeader>
                    <CardTitle className="text-base">삼성 인터넷 홈 화면 추가 버튼</CardTitle>
                    <CardDescription>
                        삼성 인터넷 사용자에게만 "홈 화면에 성지수행 추가" 버튼 표시 여부를 설정합니다.
                        위의 전체 토글이 OFF이면 이 설정은 무시됩니다.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Switch
                            id="samsung-install-button-toggle"
                            checked={isSamsungButtonVisible}
                            onCheckedChange={(checked) => saveSettingMutation.mutate({ samsung_install_button_visible: checked ? "true" : "false" })}
                            disabled={saveSettingMutation.isPending}
                        />
                        <Label htmlFor="samsung-install-button-toggle" className="cursor-pointer">
                            {isSamsungButtonVisible
                                ? <span className="text-green-700 font-medium">✅ 버튼 표시 중 (삼성 인터넷 사용자에게 보임)</span>
                                : <span className="text-gray-500 font-medium">🔴 버튼 숨김</span>
                            }
                        </Label>
                    </div>
                    {saveSettingMutation.isPending && <p className="text-sm text-gray-400 mt-2">저장 중...</p>}
                </CardContent>
            </Card>

            <Card className="border-dashed border-gray-300 bg-gray-50">
                <CardContent className="pt-4">
                    <p className="text-xs text-gray-500 font-semibold mb-2">📌 기술적 한계</p>
                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                        <li><code>display: standalone</code> → "Add to apps" (WebAPK, Play Protect 경고 위험)</li>
                        <li><code>display: minimal-ui</code>만 → 이벤트 발화 안 됨</li>
                        <li><code>display_override: [standalone, minimal-ui]</code> → 두 옵션 표시 (현재)</li>
                        <li>삼성 인터넷 버전/기기에 따라 결과가 다를 수 있음</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
