import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock, Settings, Eye, EyeOff, Trash2, Ban, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function Admin() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const queryClient = useQueryClient();

    // --- Authentication ---
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
        },
        onError: (error) => {
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
        queryKey: ["admin", "users"],
        queryFn: async () => {
            const res = await fetch("/api/admin/users", {
                headers: { "X-Admin-Password": password },
            });
            if (!res.ok) throw new Error("Failed to fetch users");
            return res.json() as Promise<{ activeUsers: any[], blockedUsers: any[] }>;
        },
        enabled: isAuthenticated,
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
            <div className="container max-w-md mx-auto px-4 py-20">
                <Card>
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
            <div className="flex items-center gap-3 mb-8">
                <Settings className="h-8 w-8 text-gray-700" />
                <h1 className="text-3xl font-bold">관리사무소</h1>
            </div>

            <Tabs defaultValue="assessments" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8">
                    <TabsTrigger value="assessments">수행평가 데이터 일괄관리</TabsTrigger>
                    <TabsTrigger value="users">인파 관리 (차단)</TabsTrigger>
                </TabsList>

                <TabsContent value="assessments">
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
                        <Card>
                            <CardHeader>
                                <CardTitle>활성 사용자 (최근 24시간)</CardTitle>
                                <CardDescription>
                                    최근 접속한 IP 및 카카오 계정 목록입니다.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>IP 주소</TableHead>
                                                <TableHead>카카오 계정</TableHead>
                                                <TableHead>수정 횟수</TableHead>
                                                <TableHead>마지막 접속</TableHead>
                                                <TableHead className="w-[100px]">관리</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {userData?.activeUsers?.map((user: any, idx: number) => {
                                                const isBlocked = userData.blockedUsers?.some((b: any) => b.identifier === user.ip || (user.kakaoId && b.identifier === user.kakaoId));
                                                return (
                                                    <TableRow key={idx}>
                                                        <TableCell className="font-mono">{user.ip}</TableCell>
                                                        <TableCell>
                                                            {user.kakaoNickname ? (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold">{user.kakaoNickname}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
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
                                                        <TableCell>{new Date(user.lastAccess).toLocaleString()}</TableCell>
                                                        <TableCell>
                                                            {isBlocked ? (
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
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
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
            </Tabs>
        </div>
    );
}
