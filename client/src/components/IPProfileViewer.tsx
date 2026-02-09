import { useState, useEffect } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Ban, User, Clock, FileText, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { IPProfile } from "../types";

interface IPProfileViewerProps {
    initialData: IPProfile | null;
    isOpen: boolean;
    onClose: () => void;
    adminPassword: string;
}

function parseUserAgent(ua: string) {
    let os = "Unknown OS";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    let browser = "Unknown Browser";
    if (ua.includes("Edg")) browser = "Edge";
    else if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Firefox")) browser = "Firefox";

    return { os, browser, raw: ua };
}

export default function IPProfileViewer({ initialData, isOpen, onClose, adminPassword }: IPProfileViewerProps) {
    const [data, setData] = useState<IPProfile | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setData(initialData);
            if (!initialData.detailsLoaded) {
                fetchFullProfile(initialData.ip);
            }
        }
    }, [isOpen, initialData]);

    const fetchFullProfile = async (ip: string) => {
        setIsLoadingDetails(true);
        try {
            const res = await fetch(`/api/admin/ip_profile?ip=${ip}`, {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("Failed to load profile");
            const json = await res.json();
            setData(json);
        } catch (error) {
            toast.error("상세 정보를 불러오는데 실패했습니다.");
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const handleBlockToggle = async () => {
        if (!data) return;

        const isBlocking = !data.isBlocked;
        const confirmMsg = isBlocking
            ? `${data.ip}를 차단하시겠습니까?`
            : `${data.ip} 차단을 해제하시겠습니까?`;

        if (!confirm(confirmMsg)) return;

        try {
            if (isBlocking) {
                const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Admin-Password": adminPassword,
                    },
                    body: JSON.stringify({ identifier: data.ip, type: "IP", reason: "Profile View Block" }),
                });
                if (!res.ok) throw new Error("Action failed");
            } else {
                if (!data.blockId) {
                    alert("차단 정보를 찾을 수 없어 해제할 수 없습니다.");
                    return;
                }
                const res = await fetch("/api/admin/users", {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Admin-Password": adminPassword,
                    },
                    body: JSON.stringify({ id: data.blockId }),
                });
                if (!res.ok) throw new Error("Action failed");
            }

            toast.success("처리되었습니다.");
            fetchFullProfile(data.ip);
        } catch (e) {
            toast.error("오류가 발생했습니다.");
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <DialogTitle className="text-2xl font-mono">{data?.ip || initialData?.ip || "Loading..."}</DialogTitle>
                        {data?.isBlocked && <Badge variant="destructive">차단됨</Badge>}
                    </div>
                    <DialogDescription>IP 활동 프로필</DialogDescription>
                </DialogHeader>

                {data ? (
                    <div className="flex-1 overflow-hidden flex flex-col gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-blue-50 p-4 rounded-lg flex flex-col gap-1 border border-blue-100">
                                <span className="text-xs text-blue-600 font-bold flex items-center gap-1"><FileText className="w-3 h-3" /> 수정 기여</span>
                                <span className="text-2xl font-bold">{data.modificationCount}회</span>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg flex flex-col gap-1 border border-green-200">
                                <span className="text-xs text-green-600 font-bold flex items-center gap-1"><User className="w-3 h-3" /> 학년 / 반</span>
                                <span className="text-2xl font-bold">
                                    {data.grade && data.classNum ? `${data.grade}학년 ${data.classNum}반` : <span className="text-gray-400 text-lg">-</span>}
                                </span>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg flex flex-col gap-1 border border-gray-200">
                                <span className="text-xs text-gray-500 font-bold flex items-center gap-1"><Clock className="w-3 h-3" /> 마지막 접속</span>
                                <span className="text-sm font-mono">{data.lastAccess ? new Date(data.lastAccess).toLocaleString() : '-'}</span>
                            </div>
                            <div className="bg-yellow-50 p-4 rounded-lg flex flex-col gap-1 border border-yellow-100 md:col-span-3">
                                <span className="text-xs text-yellow-700 font-bold flex items-center gap-1"><User className="w-3 h-3" /> 카카오 계정</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {data.kakaoAccounts?.length > 0 ? data.kakaoAccounts.map((k: { kakaoId: string; kakaoNickname: string }, i: number) => (
                                        <Badge key={i} variant="secondary" className="text-xs">{k.kakaoNickname}</Badge>
                                    )) : <span className="text-xs text-gray-400">-</span>}
                                </div>
                            </div>
                        </div>

                        <Tabs defaultValue="assessments" className="flex-1 flex flex-col min-h-0">
                            <TabsList>
                                <TabsTrigger value="assessments">수행평가 ({data.assessments?.length || 0})</TabsTrigger>
                                <TabsTrigger value="logs">로그 ({data.logs?.length || 0})</TabsTrigger>
                                <TabsTrigger value="devices">접속 환경</TabsTrigger>
                            </TabsList>
                            <TabsContent value="assessments" className="flex-1 min-h-0 border rounded mt-2">
                                <ScrollArea className="h-[300px] p-4">
                                    {data.detailsLoaded ? (
                                        data.assessments?.length > 0 ? (
                                            data.assessments.map((a: any, i: number) => (
                                                <div key={i} className="mb-2 pb-2 border-b last:border-0">
                                                    <div className="font-bold text-sm">[{a.grade}-{a.classNum}] {a.subject}</div>
                                                    <div className="text-xs text-gray-600">{a.title}</div>
                                                    <div className="text-[10px] text-gray-400">{new Date(a.createdAt).toLocaleString()}</div>
                                                </div>
                                            ))
                                        ) : <div className="text-center text-gray-400 py-8">기여 내역 없음</div>
                                    ) : <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>}
                                </ScrollArea>
                            </TabsContent>
                            <TabsContent value="logs" className="flex-1 min-h-0 border rounded mt-2">
                                <ScrollArea className="h-[300px] p-4">
                                    {data.detailsLoaded ? (
                                        data.logs?.length > 0 ? (
                                            data.logs.map((l: any, i: number) => (
                                                <div key={i} className="flex justify-between text-xs py-1 border-b">
                                                    <div className="flex gap-2"><Badge variant="outline" className="h-5">{l.method}</Badge> <span className="truncate max-w-[200px]">{l.endpoint}</span></div>
                                                    <span className="text-gray-400">{new Date(l.accessedAt).toLocaleTimeString()}</span>
                                                </div>
                                            ))
                                        ) : <div className="text-center text-gray-400 py-8">로그 없음</div>
                                    ) : <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>}
                                </ScrollArea>
                            </TabsContent>
                            <TabsContent value="devices" className="flex-1 min-h-0 border rounded mt-2">
                                <ScrollArea className="h-[300px] p-4">
                                    {data.detailsLoaded ? (
                                        data.recentUserAgents?.length > 0 ? (
                                            <div className="flex flex-col gap-2">
                                                {data.recentUserAgents.map((ua: string, i: number) => {
                                                    const { os, browser, raw } = parseUserAgent(ua);
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded border">
                                                            {os.includes("Window") || os.includes("Mac") || os.includes("Linux") ?
                                                                <Monitor className="text-gray-500 w-5 h-5" /> :
                                                                <Smartphone className="text-gray-500 w-5 h-5" />
                                                            }
                                                            <div className="flex-1 overflow-hidden">
                                                                <div className="font-bold text-sm">{os} / {browser}</div>
                                                                <div className="text-[10px] text-gray-400 truncate" title={raw}>{raw}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : <div className="text-center text-gray-400 py-8">기록된 환경 정보 없음</div>
                                    ) : <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>}
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" /></div>}

                <DialogFooter className="mt-4">
                    {data && (
                        <Button
                            variant={data.isBlocked ? "outline" : "destructive"}
                            onClick={handleBlockToggle}
                            disabled={isLoadingDetails && !data.detailsLoaded}
                        >
                            <Ban className="h-4 w-4 mr-2" />
                            {data.isBlocked ? "차단 해제" : "이 IP 차단하기"}
                        </Button>
                    )}
                    <Button variant="secondary" onClick={onClose}>닫기</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
