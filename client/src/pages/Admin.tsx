import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, Settings, TriangleAlert, BookOpen, ChevronRight, ChevronDown, CheckSquare, Calendar, ShieldCheck, Ban, Search, Trash2 } from "lucide-react";
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




function ElectiveManager({ password }: { password: string }) {
    const [selectedGrade, setSelectedGrade] = useState<number>(2);
    const [subjects, setSubjects] = useState<any[]>([]);
    const [originalSubjects, setOriginalSubjects] = useState<any[]>([]); // To track changes
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);


    useEffect(() => {
        fetchData();
    }, [selectedGrade]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            console.log("Fetching data for grade", selectedGrade);

            // 1. Fetch Comcigan Subjects
            let comciganData = [];
            try {
                const comciganRes = await fetch(`/api/admin/comcigan-subjects?grade=${selectedGrade}`);
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
                const configRes = await fetch(`/api/admin/electives?grade=${selectedGrade}`, {
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
            const merged = comciganData.map((item: any) => {
                const saved = configData.find((c: any) => c.subject === item.subject && c.originalTeacher === item.teacher);
                return {
                    ...item,
                    classCode: saved?.classCode || "",
                    fullTeacherName: saved?.fullTeacherName || "",
                    className: saved?.className || "",
                    isMovingClass: saved?.isMovingClass !== 0, // Default to true
                    isCombinedClass: saved?.isCombinedClass === 1 // Default to false
                };
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
                            isMovingClass: item.isMovingClass,
                            isCombinedClass: item.isCombinedClass
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

        return subjectMatch || teacherMatch || fullTeacherMatch || classCodeMatch || classNameMatch || moveMatch || combinedMatch;
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
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex justify-between items-center gap-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 shrink-0">
                        <BookOpen className="w-5 h-5" />
                        {selectedGrade}학년 선택과목 목록
                    </h3>

                    {/* Search Bar */}
                    <div className="flex-1 max-w-sm">
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
                                    <TableCell colSpan={7} className="text-center h-24">
                                        로딩 중...
                                    </TableCell>
                                </TableRow>
                            ) : filteredSubjects.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24">
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

                                    return (
                                        <TableRow
                                            key={`${item.subject}-${item.teacher}`}
                                            className={isDisabled ? "opacity-50 bg-gray-50 cursor-not-allowed" : ""}
                                            onClick={() => {
                                                if (isDisabled) {
                                                    toast.error(`${matchedKeyword}은(는) 선택할 수 없습니다.`);
                                                }
                                            }}
                                        >
                                            <TableCell className="font-medium">
                                                {item.subject}
                                            </TableCell>
                                            <TableCell className="text-gray-500">{item.teacher}</TableCell>
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
                                                        disabled={isDisabled}
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
                                                        disabled={isDisabled}
                                                    >
                                                        통반 X
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )
                            }
                        </TableBody >
                    </Table >
                </div >
            </div >
        </div >
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
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-8 h-auto">
                    <TabsTrigger value="assessments">등록된 수행평가</TabsTrigger>
                    <TabsTrigger value="users">사용자 관리</TabsTrigger>
                    <TabsTrigger value="electives">선택과목</TabsTrigger>
                    <TabsTrigger
                        value="database"
                        className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800"
                    >
                        DB 관리
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
