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
import { parseAppTypeFromUserAgent } from "@/lib/browserDetect";

interface IPProfileViewerProps {
    initialData: IPProfile | null;
    isOpen: boolean;
    onClose: () => void;
    adminPassword: string;
}

// ── 접속환경 표시용 헬퍼 ────────────────────────────────────────────────────
const BROWSER_LABEL: Record<string, string> = {
    chrome: 'Chrome', safari: 'Safari', samsung: '삼성 인터넷',
    firefox: 'Firefox', other: '그외 브라우저',
};
const DEVICE_LABEL: Record<string, string> = {
    mobile: '스마트폰', tablet: '태블릿', desktop: '데스크톱',
};
const OS_LABEL: Record<string, string> = {
    ios: 'iOS', android: 'Android', windows: 'Windows',
    macos: 'macOS', linux: 'Linux',
};

function envIcon(deviceType: string | null) {
    if (deviceType === 'mobile' || deviceType === 'tablet') return <Smartphone className="text-gray-500 w-5 h-5 shrink-0" />;
    return <Monitor className="text-gray-500 w-5 h-5 shrink-0" />;
}

// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS" (space separator, no 'Z').
// Browsers (especially Safari) require ISO 8601 with 'T' separator.
// Convert before constructing Date to ensure cross-browser compatibility.
function toUtcDate(at: string | null): Date | null {
    if (!at) return null;
    try {
        // Replace space with 'T', add 'Z' if no timezone info
        const iso = at.replace(' ', 'T') + (at.includes('+') || at.endsWith('Z') ? '' : 'Z');
        const d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
}

function fmtAccess(at: string | null) {
    if (!at) return null;
    try { return toUtcDate(at)?.toLocaleString('ko-KR') ?? at; } catch { return at; }
}


export default function IPProfileViewer({ initialData, isOpen, onClose, adminPassword }: IPProfileViewerProps) {
    const [data, setData] = useState<IPProfile | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [selectedLogDate, setSelectedLogDate] = useState<string>('all');
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setData(initialData);
            setSelectedLogDate('all'); // Default: show all logs (date filter starts open)
            setIsLogModalOpen(false); // Close log modal on re-open
            if (!initialData.detailsLoaded) {
                fetchFullProfile(initialData.ip);
            }
        }
    }, [isOpen, initialData]);

    const fetchFullProfile = async (ip: string) => {
        setIsLoadingDetails(true);
        try {
            const res = await fetch(`/api/admin/ip_profile?ip=${encodeURIComponent(ip)}`, {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("Failed to load profile");
            const json = await res.json();
            // 진단 출력: 로그가 0건인 경우 IP 불일치 여부 확인
            if (json._debug) {
                console.warn('[IPProfileViewer] 로그 0건 진단:', json._debug);
            }
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

    // 1. Extract Unique Dates for the Filter Dropdown (newest first)
    const uniqueLogDates: string[] = data?.logs
        ? Array.from(new Set(
            data.logs
                .map(l => toUtcDate(l.accessedAt))
                .filter((d): d is Date => d !== null)
                .map(d => d.toLocaleDateString('ko-KR'))
        ))
        : [];

    // 2. Filter Logs by Date
    const filteredLogs = data?.logs ? data.logs.filter(l => {
        if (selectedLogDate === 'all') return true;
        const d = toUtcDate(l.accessedAt);
        if (!d) return false;
        return d.toLocaleDateString('ko-KR') === selectedLogDate;
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
            const logTime = toUtcDate(log.accessedAt)?.getTime() ?? 0;
            const groupStartTime = toUtcDate(currentGroup.timeStart)?.getTime() ?? 0;

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
                                <span className="text-xs text-green-600 font-bold flex items-center gap-1"><User className="w-3 h-3" /> 프로필 (이름 + 학번)</span>
                                <span className="text-2xl font-bold">
                                    {data.teacherName ? (
                                        <span className="flex items-center gap-2">
                                            <span className="text-amber-700 text-base font-semibold px-2 py-0.5 bg-amber-50 border border-amber-200 rounded">선생님</span>
                                            <span className="text-slate-900">{data.teacherName}</span>
                                        </span>
                                    ) : data.studentName ? (
                                        <span className="text-slate-900">{data.studentName}</span>
                                    ) : (
                                        <span className="text-gray-400 text-lg">이름 없음</span>
                                    )}
                                </span>
                                <span className="text-sm text-green-700 font-mono">
                                    {data.grade && data.classNum
                                        ? `${data.grade}학년 ${data.classNum}반 ${data.studentNumber ? data.studentNumber + '번' : ''}`
                                        : data.teacherName
                                            ? <span className="text-amber-600">교직원 계정</span>
                                            : <span className="text-gray-400">학번 미등록</span>
                                    }
                                </span>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg flex flex-col gap-1 border border-gray-200">
                                <span className="text-xs text-gray-500 font-bold flex items-center gap-1"><Clock className="w-3 h-3" /> 마지막 접속</span>
                                <span className="text-sm font-mono">{data.lastAccess ? new Date(data.lastAccess + 'Z').toLocaleString() : '-'}</span>
                            </div>
                            {(() => {
                                const latestUa = data.recentUserAgents?.[0] || (data as any).userAgent;
                                const uaAppType = parseAppTypeFromUserAgent(latestUa);
                                // UA가 정식 앱(WebView)이면 webview
                                let resolvedAppType = uaAppType;
                                if (!resolvedAppType) {
                                    // UA에 앱 토큰이 없는데 data.isStandalone이 있으면 PWA
                                    if (data.isStandalone) {
                                        resolvedAppType = 'pwa';
                                    } else if (data.appType === 'pwa') {
                                        resolvedAppType = 'pwa';
                                    } else if (data.appType === 'webview' && !/SamsungBrowser|Chrome|Safari/i.test(latestUa || '')) {
                                        // 일반 브라우저가 아닐 때만 webview 허용
                                        resolvedAppType = 'webview';
                                    }
                                }

                                if (resolvedAppType === 'webview') {
                                    return (
                                        <div className="bg-emerald-50 p-4 rounded-lg flex flex-col gap-1 border border-emerald-200">
                                            <span className="text-xs text-emerald-700 font-bold flex items-center gap-1"><Smartphone className="w-3 h-3" /> 앱 설치 상태</span>
                                            <span className="text-xl font-bold text-emerald-700">
                                                정식 앱 <span className="text-xs font-normal text-emerald-600">(WebView)</span>
                                            </span>
                                        </div>
                                    );
                                }
                                if (resolvedAppType === 'pwa') {
                                    return (
                                        <div className="bg-purple-50 p-4 rounded-lg flex flex-col gap-1 border border-purple-200">
                                            <span className="text-xs text-purple-600 font-bold flex items-center gap-1"><Smartphone className="w-3 h-3" /> 앱 설치 상태</span>
                                            <span className="text-xl font-bold text-purple-600">
                                                PWA <span className="text-xs font-normal text-purple-500">(홈화면 추가)</span>
                                            </span>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="bg-gray-50 p-4 rounded-lg flex flex-col gap-1 border border-gray-200">
                                        <span className="text-xs text-gray-500 font-bold flex items-center gap-1"><Smartphone className="w-3 h-3" /> 앱 설치 상태</span>
                                        <span className="text-xl font-bold text-gray-400">미사용</span>
                                    </div>
                                );
                            })()}
                            <div className="bg-yellow-50 p-4 rounded-lg flex flex-col gap-1 border border-yellow-100 md:col-span-4">
                                <span className="text-xs text-yellow-700 font-bold flex items-center gap-1"><User className="w-3 h-3" /> 카카오 계정</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {data.kakaoAccounts?.length > 0 ? data.kakaoAccounts.map((k: { kakaoId: string; kakaoNickname: string }, i: number) => (
                                        <Badge key={i} variant="secondary" className="text-xs">{k.kakaoNickname}</Badge>
                                    )) : <span className="text-xs text-gray-400">-</span>}
                                </div>
                            </div>
                            <div className="col-span-1 md:col-span-4 flex justify-end items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsLogModalOpen(true)}
                                    className="bg-white border-blue-200 hover:bg-blue-50/50"
                                >
                                    접속 로그 열람 ({data.totalLogCount ?? data.logs?.length ?? 0}건)
                                    {((data.totalLogCount ?? data.logs?.length ?? 0) === 0 && (data.relatedStudentLogsCount || 0) > 0) && (
                                        <Badge variant="secondary" className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 font-normal">
                                            동일 사용자 전체 {data.relatedStudentLogsCount}건
                                        </Badge>
                                    )}
                                </Button>
                            </div>
                        </div>

                        <Tabs defaultValue="assessments" className="flex-1 flex flex-col min-h-0">
                            <TabsList>
                                <TabsTrigger value="assessments">
                                    {data.teacherName ? '등록 내역' : '수행평가'} ({data.assessments?.length || 0})
                                </TabsTrigger>
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
                                        {data.detailsLoaded ? (() => {
                                            const envs: any[] = (data as any).recentEnvironments;
                                            // recentEnvironments 있으면 사용, 없으면 recentUserAgents fallback
                                            if (envs && envs.length > 0) {
                                                return (
                                                    <div className="flex flex-col gap-2">
                                                        {envs.map((env: any, i: number) => (
                                                            <div key={i} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded border">
                                                                {envIcon(env.deviceType)}
                                                                <div className="flex-1 overflow-hidden min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                                        {env.deviceType && (
                                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-slate-50 text-slate-600">
                                                                                {DEVICE_LABEL[env.deviceType] ?? env.deviceType}
                                                                            </Badge>
                                                                        )}
                                                                        {env.os && (
                                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">
                                                                                {OS_LABEL[env.os] ?? env.os}
                                                                            </Badge>
                                                                        )}
                                                                        {env.browserKey && (
                                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                                {BROWSER_LABEL[env.browserKey] ?? env.browserKey}
                                                                            </Badge>
                                                                        )}
                                                                        {env.isInApp && (
                                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-50 text-yellow-700 border-yellow-200">
                                                                                인앱
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    {env.accessedAt && (
                                                                        <div className="text-[10px] text-gray-400 mb-0.5">{fmtAccess(env.accessedAt)}</div>
                                                                    )}
                                                                    {env.userAgent && (
                                                                        <div className="text-[10px] text-gray-400 break-all leading-relaxed" title={env.userAgent}>
                                                                            {env.userAgent}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            // fallback: recentUserAgents (구버전 데이터)
                                            if (data.recentUserAgents?.length > 0) {
                                                return (
                                                    <div className="flex flex-col gap-2">
                                                        {data.recentUserAgents.map((ua: string, i: number) => (
                                                            <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded border">
                                                                {/windows|mac|linux/i.test(ua) ? <Monitor className="text-gray-500 w-5 h-5" /> : <Smartphone className="text-gray-500 w-5 h-5" />}
                                                                <div className="flex-1 overflow-hidden">
                                                                    <div className="text-[11px] text-gray-500 break-all leading-relaxed" title={ua}>{ua}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            }
                                            return <div className="text-center text-gray-400 py-8">기록된 환경 정보 없음</div>;
                                        })() : <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-300" /></div>}
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
                                <DialogDescription>
                                    {data?.teacherName ? `👨‍🏫 ${data.teacherName} 선생님` : data?.ip} - 총 {data?.logs?.length || 0}건의 기록
                                    {(data?.logs?.length || 0) >= 500 && <span className="ml-2 text-xs text-orange-500">(최근 500건)</span>}
                                </DialogDescription>
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
                                                                    <>{toUtcDate(group.timeStart)?.toLocaleTimeString('ko-KR')} ~ <span className="text-gray-500">{toUtcDate(group.timeEnd)?.toLocaleTimeString('ko-KR')}</span></>
                                                                ) : (
                                                                    toUtcDate(group.timeEnd)?.toLocaleTimeString('ko-KR')
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
                                                                <span className="text-gray-400 font-mono text-[11px] shrink-0">{toUtcDate(l.accessedAt)?.toLocaleTimeString('ko-KR')}</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 px-4 max-w-xl mx-auto flex flex-col items-center text-center">
                                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <h4 className="text-base font-bold text-slate-800 mb-1">
                                            {selectedLogDate === 'all' ? '이 IP의 접속 로그가 없습니다' : `${selectedLogDate} 날짜의 로깅 데이터가 없습니다`}
                                        </h4>
                                        <p className="text-xs text-slate-500 mb-6 font-mono">
                                            조회 대상 IP: {data?.ip}
                                        </p>

                                        {/* 진단 카드 */}
                                        {data?._debug && (
                                            <div className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left shadow-sm mb-4 space-y-3">
                                                <div className="flex items-center justify-between border-b pb-2">
                                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                        🔍 DB 로그 진단 상태
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] font-mono">
                                                        DB 전체 로그: {data._debug.totalAccessLogsInDb}건
                                                    </Badge>
                                                </div>

                                                {data._debug.totalAccessLogsInDb === 0 ? (
                                                    <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                                                        ⚠️ 현재 데이터베이스의 <span className="font-mono font-bold">access_logs</span> 테이블이 비어 있습니다.
                                                        <br />
                                                        일반 사용자(또는 새 창에서 메인 페이지) 접속 시 로그가 자동 누적됩니다.
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2 text-xs text-slate-600">
                                                        <p>
                                                            DB에 총 <span className="font-bold text-blue-600 font-mono">{data._debug.totalAccessLogsInDb}건</span>의 로그가 있으나, 현재 IP(<span className="font-mono font-bold text-slate-800">{data.ip}</span>)의 기록은 없습니다.
                                                        </p>
                                                        <p className="text-[11px] text-slate-500">
                                                            💡 <strong>이유:</strong> 접속 로그 테이블이 최근 생성/초기화된 이후 해당 IP로 아직 페이지에 재접속하지 않았거나, 사용자가 모바일/Wi-Fi 등 다른 네트워크 IP로 접속했을 수 있습니다.
                                                        </p>

                                                        {data._debug.sampleIpsInAccessLogs && data._debug.sampleIpsInAccessLogs.length > 0 && (
                                                            <div className="pt-2 border-t">
                                                                <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                                                                    최근 DB에 기록된 접속 IP 목록:
                                                                </span>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {data._debug.sampleIpsInAccessLogs.map((sampleIp, sIdx) => (
                                                                        <Button
                                                                            key={sIdx}
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-6 px-2 text-[11px] font-mono bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border-slate-200"
                                                                            onClick={() => fetchFullProfile(sampleIp)}
                                                                            title={`${sampleIp} 프로필 및 로그로 전환`}
                                                                        >
                                                                            {sampleIp} →
                                                                        </Button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 동일 사용자 다른 IP 바로가기 */}
                                        {data?.relatedOtherIps && data.relatedOtherIps.length > 0 && (
                                            <div className="w-full bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-left text-xs">
                                                <span className="font-bold text-indigo-900 block mb-1">
                                                    💡 동일 사용자({data.teacherName ? `${data.teacherName} 선생님` : `${data.grade}-${data.classNum}-${data.studentNumber}`})의 다른 접속 IP ({data.relatedStudentLogsCount}건)
                                                </span>
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {data.relatedOtherIps.map((otherIp, oIdx) => (
                                                        <Button
                                                            key={oIdx}
                                                            variant="secondary"
                                                            size="sm"
                                                            className="h-6 px-2.5 text-[11px] font-mono bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                                                            onClick={() => fetchFullProfile(otherIp)}
                                                        >
                                                            {otherIp} 로그 확인 →
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            ) : <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300 w-10 h-10" /></div>}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
