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
    if (!ua) return { os: "Unknown OS", browser: "Unknown Browser", raw: "Unknown" };

    const lowerUa = ua.toLowerCase();
    let os = "Unknown OS";

    // OS Matching
    if (lowerUa.includes("windows")) os = "Windows";
    else if (lowerUa.includes("mac os") || lowerUa.includes("macintosh")) os = "macOS";
    else if (lowerUa.includes("android")) os = "Android";
    else if (lowerUa.includes("iphone") || lowerUa.includes("ipad") || lowerUa.includes("ipod")) os = "iOS";
    else if (lowerUa.includes("linux")) os = "Linux";

    let browser = "Unknown Browser";

    // Browser Matching (Precise Precedence)
    if (lowerUa.includes("kakaotalk")) browser = "KakaoTalk";
    else if (lowerUa.includes("whale")) browser = "Naver Whale";
    else if (lowerUa.includes("samsungbrowser")) browser = "Samsung Browser";
    else if (lowerUa.includes("edg") || lowerUa.includes("edge")) browser = "Edge";
    else if (lowerUa.includes("opr") || lowerUa.includes("opera")) browser = "Opera";
    else if (lowerUa.includes("firefox") || lowerUa.includes("fxios")) browser = "Firefox";
    // Chrome must be checked before Safari, because Chrome includes 'Safari' in its UA string
    else if (lowerUa.includes("chrome") || lowerUa.includes("crios")) browser = "Chrome";
    else if (lowerUa.includes("safari")) browser = "Safari";
    else if (lowerUa.includes("trident") || lowerUa.includes("msie")) browser = "Internet Explorer";

    return { os, browser, raw: ua };
}

export default function IPProfileViewer({ initialData, isOpen, onClose, adminPassword }: IPProfileViewerProps) {
    const [data, setData] = useState<IPProfile | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [selectedLogDate, setSelectedLogDate] = useState<string>(new Date().toLocaleDateString('ko-KR'));
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setData(initialData);
            setSelectedLogDate(new Date().toLocaleDateString('ko-KR')); // Default to today
            setIsLogModalOpen(false); // Close log modal on re-open
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

    // 1. Extract Unique Dates for the Filter Dropdown
    const availableDates = useState<string[]>([]);
    const uniqueLogDates = data?.logs ? Array.from(new Set(data.logs.map(l => new Date(l.accessedAt + 'Z').toLocaleDateString('ko-KR')))) : [];

    // Ensure today's date exists in the dropdown options
    const todayString = new Date().toLocaleDateString('ko-KR');
    if (uniqueLogDates.length > 0 && !uniqueLogDates.includes(todayString)) {
        uniqueLogDates.unshift(todayString);
    }

    // 2. Filter Logs by Date
    const filteredLogs = data?.logs ? data.logs.filter(l => {
        if (selectedLogDate === "all") return true;
        return new Date(l.accessedAt + 'Z').toLocaleDateString('ko-KR') === selectedLogDate;
    }) : [];

    // 3. Group Concurrent Access Logs (Bursts within 5 seconds)
    const groupedLogs = [];
    if (filteredLogs.length > 0) {
        // Logs are currently chronologically descending (newest first)
        let currentGroup = {
            timeEnd: filteredLogs[0].accessedAt,
            timeStart: filteredLogs[0].accessedAt,
            logs: [filteredLogs[0]]
        };

        for (let i = 1; i < filteredLogs.length; i++) {
            const log = filteredLogs[i];
            const logTime = new Date(log.accessedAt + 'Z').getTime();
            const groupStartTime = new Date(currentGroup.timeStart + 'Z').getTime();

            // If the log is within 5 seconds of the start of the current burst (remembering it's descending)
            // Note: logTime will be earlier (smaller) than groupStartTime
            if (groupStartTime - logTime <= 5000) {
                currentGroup.logs.push(log);
                currentGroup.timeStart = log.accessedAt; // Push start time further back
            } else {
                groupedLogs.push(currentGroup);
                currentGroup = { timeEnd: log.accessedAt, timeStart: log.accessedAt, logs: [log] };
            }
        }
        groupedLogs.push(currentGroup);
    }

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
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-blue-50 p-4 rounded-lg flex flex-col gap-1 border border-blue-100 relative">
                                <span className="text-xs text-blue-600 font-bold flex items-center gap-1"><FileText className="w-3 h-3" /> 수정 기여</span>
                                <span className="text-2xl font-bold">{data.modificationCount}회</span>
                                <div className="flex gap-2 mt-1 -mb-1">
                                    {data.addCount !== undefined && <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] px-1 py-0 h-4">추가 {data.addCount}회</Badge>}
                                    {data.deleteCount !== undefined && <Badge variant="secondary" className="bg-red-100 text-red-800 text-[10px] px-1 py-0 h-4">삭제 {data.deleteCount}회</Badge>}
                                </div>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg flex flex-col gap-1 border border-green-200">
                                <span className="text-xs text-green-600 font-bold flex items-center gap-1"><User className="w-3 h-3" /> 학년/반/번호</span>
                                <span className="text-2xl font-bold">
                                    {data.grade && data.classNum ? `${data.grade}학년 ${data.classNum}반 ${data.studentNumber ? data.studentNumber + '번' : ''}` : <span className="text-gray-400 text-lg">-</span>}
                                </span>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg flex flex-col gap-1 border border-gray-200">
                                <span className="text-xs text-gray-500 font-bold flex items-center gap-1"><Clock className="w-3 h-3" /> 마지막 접속</span>
                                <span className="text-sm font-mono">{data.lastAccess ? new Date(data.lastAccess + 'Z').toLocaleString() : '-'}</span>
                            </div>
                            <div className="bg-purple-50 p-4 rounded-lg flex flex-col gap-1 border border-purple-200">
                                <span className="text-xs text-purple-600 font-bold flex items-center gap-1"><Smartphone className="w-3 h-3" /> PWA 앱 설치</span>
                                <span className="text-2xl font-bold">
                                    {data.isStandalone ? <span className="text-purple-600">설치됨</span> : <span className="text-gray-400 text-lg">미사용</span>}
                                </span>
                            </div>
                            <div className="bg-yellow-50 p-4 rounded-lg flex flex-col gap-1 border border-yellow-100 md:col-span-4">
                                <span className="text-xs text-yellow-700 font-bold flex items-center gap-1"><User className="w-3 h-3" /> 카카오 계정</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {data.kakaoAccounts?.length > 0 ? data.kakaoAccounts.map((k: { kakaoId: string; kakaoNickname: string }, i: number) => (
                                        <Badge key={i} variant="secondary" className="text-xs">{k.kakaoNickname}</Badge>
                                    )) : <span className="text-xs text-gray-400">-</span>}
                                </div>
                            </div>
                            <div className="col-span-1 md:col-span-4 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsLogModalOpen(true)}
                                    className="bg-white"
                                >
                                    접속 로그 열람 ({data.logs?.length || 0})
                                </Button>
                            </div>
                        </div>

                        <Tabs defaultValue="assessments" className="flex-1 flex flex-col min-h-0">
                            <TabsList>
                                <TabsTrigger value="assessments">수행평가 ({data.assessments?.length || 0})</TabsTrigger>
                                <TabsTrigger value="electives">선택과목 현황</TabsTrigger>
                                <TabsTrigger value="devices">접속 환경</TabsTrigger>
                            </TabsList>
                            <TabsContent value="assessments" className="flex-1 min-h-0 border rounded mt-2 bg-white">
                                <ScrollArea className="h-[300px] w-full">
                                    <div className="p-4">
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
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                            <TabsContent value="electives" className="flex-1 min-h-0 border rounded mt-2 bg-purple-50">
                                <ScrollArea className="h-[300px] w-full">
                                    <div className="p-4">
                                        {(data.grade === "2" || data.grade === "3" || data.electives) ? (
                                            <div className="flex flex-wrap gap-2">
                                                {data.electives && Object.keys(data.electives).length > 0 ? (
                                                    Object.entries(data.electives).map(([group, subData]: [string, any], i) => {
                                                        const subjectName = typeof subData === 'object' && subData !== null ? (subData.fullSubjectName || subData.subject) : subData;
                                                        return (
                                                            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-purple-200 shadow-sm hover:border-purple-300 transition-colors">
                                                                <span className="text-xs font-bold text-purple-600">{group}</span>
                                                                <span className="text-sm border-l border-purple-100 pl-1.5">{subjectName}</span>
                                                            </div>
                                                        );
                                                    })
                                                ) : <div className="text-center w-full text-gray-400 py-8">선택과목 데이터가 등록되지 않았습니다.</div>}
                                            </div>
                                        ) : <div className="text-center w-full text-gray-400 py-8">선택과목 적용 학년이 아닙니다.</div>}
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                            <TabsContent value="devices" className="flex-1 min-h-0 border rounded mt-2 bg-white">
                                <ScrollArea className="h-[300px] w-full">
                                    <div className="p-4">
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
                                                                    <div className="text-[11px] text-gray-500 break-all leading-relaxed mt-1" title={raw}>{raw}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : <div className="text-center text-gray-400 py-8">기록된 환경 정보 없음</div>
                                        ) : <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>}
                                    </div>
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

            {/* Sub-modal: Expanded Logs Viewer */}
            <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
                <DialogContent className="max-w-7xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 shrink-0 border-b">
                        <div className="flex justify-between items-start">
                            <div>
                                <DialogTitle className="text-xl">접속 로그 상세 열람</DialogTitle>
                                <DialogDescription>{data?.ip} - 총 {data?.logs?.length || 0}건의 기록</DialogDescription>
                            </div>
                            <select
                                className="text-sm border rounded p-1.5 px-3 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm"
                                value={selectedLogDate}
                                onChange={(e) => setSelectedLogDate(e.target.value)}
                            >
                                <option value="all">모든 날짜 보기 ({data?.logs?.length || 0})</option>
                                {uniqueLogDates.map(date => (
                                    <option key={date} value={date}>{date}</option>
                                ))}
                            </select>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto bg-gray-50/50 relative">
                        <div className="p-6 max-w-5xl mx-auto">
                            {data?.detailsLoaded ? (
                                groupedLogs.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {groupedLogs.map((group: any, i: number) => (
                                            <details key={i} className="group bg-white border rounded-xl shadow-sm overflow-hidden" open={group.logs.length === 1}>
                                                <summary className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors select-none list-none marker:hidden">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-gray-400 group-open:rotate-90 transition-transform">
                                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-mono font-bold text-gray-800">
                                                                {group.logs.length > 1 ? (
                                                                    <>{new Date(group.timeStart + 'Z').toLocaleTimeString('ko-KR')} ~ <span className="text-gray-500">{new Date(group.timeEnd + 'Z').toLocaleTimeString('ko-KR')}</span></>
                                                                ) : (
                                                                    new Date(group.timeEnd + 'Z').toLocaleTimeString('ko-KR')
                                                                )}
                                                            </span>
                                                            {group.logs.length > 1 && <span className="text-xs text-gray-500 mt-0.5">순간 접속 병합됨</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant={group.logs.length > 1 ? "secondary" : "outline"} className={group.logs.length > 1 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : ""}>
                                                            총 {group.logs.length}건
                                                        </Badge>
                                                    </div>
                                                </summary>
                                                <div className="border-t bg-gray-50/50 p-2 break-all divide-y">
                                                    {group.logs.map((l: any, idx: number) => (
                                                        <div key={idx} className="flex gap-4 items-center p-2 text-sm hover:bg-white transition-colors rounded">
                                                            <Badge variant="outline" className={`h-6 shrink-0 w-16 justify-center ${l.method === 'GET' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                l.method === 'POST' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                    l.method === 'PATCH' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                        l.method === 'DELETE' ? 'bg-red-50 text-red-700 border-red-200' : ''
                                                                }`}>{l.method}</Badge>
                                                            <div className="flex-1 font-mono text-[13px] text-gray-700 min-w-0 pr-4">{l.endpoint}</div>
                                                            {group.logs.length > 1 && (
                                                                <span className="text-gray-400 font-mono text-[11px] shrink-0">{new Date(l.accessedAt + 'Z').toLocaleTimeString('ko-KR')}</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                ) : <div className="text-center text-gray-500 py-16">해당 날짜의 로깅 데이터가 존재하지 않습니다.</div>
                            ) : <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300 w-10 h-10" /></div>}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
