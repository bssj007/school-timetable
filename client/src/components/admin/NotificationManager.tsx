// client/src/components/admin/NotificationManager.tsx
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, CheckCircle2, AlertCircle, Trash2, Users, Smartphone, RefreshCw, Clock, Check, Sparkles, Radio, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTeacherOptions, filterTeacherOptions, TeacherOption } from "@/lib/teacherSearch";

interface NotificationManagerProps {
    adminPassword: string;
}

// 사전 정의된 알림 기술 (전달 방식)
export const DELIVERY_TYPES = [
    { 
        id: "all", 
        label: "통합 발송", 
        badgeLabel: "통합",
        sublabel: "푸시 알림 + 일반 인앱 알림 동시 전달 (전체 채널)", 
        icon: "🌐", 
        badgeClass: "bg-sky-100 text-sky-800 border-sky-200" 
    },
    { 
        id: "push", 
        label: "푸시 알림", 
        badgeLabel: "푸시",
        sublabel: "OS 시스템 알림 배너 및 Web Push 팝업 전송", 
        icon: "🚀", 
        badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200" 
    },
    { 
        id: "in_app", 
        label: "일반 알림", 
        badgeLabel: "일반(인앱)",
        sublabel: "기기 팝업 없이 종 아이콘 알림함에만 조용히 등록", 
        icon: "🔔", 
        badgeClass: "bg-slate-100 text-slate-800 border-slate-200" 
    },
    { 
        id: "app", 
        label: "앱 전용 알림", 
        badgeLabel: "앱전용",
        sublabel: "홈화면 PWA 및 모바일 앱 설치 기기 대상", 
        icon: "📱", 
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200" 
    },
];

// 사전 정의된 알림 종류
export const NOTIFICATION_TYPES = [
    { 
        id: "assessment", 
        label: "수행평가", 
        icon: "📝", 
        defaultTitle: "[수행평가] 등록 및 마감 안내", 
        defaultMessage: "새로운 수행평가가 등록되었습니다. 일정을 확인해 주세요.",
        badgeClass: "bg-blue-100 text-blue-800 border-blue-200" 
    },
    { 
        id: "notice", 
        label: "공지사항", 
        icon: "📢", 
        defaultTitle: "[공지] 주요 안내사항", 
        defaultMessage: "새로운 학교/학급 공지사항이 등록되었습니다.",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-200" 
    },
    { 
        id: "timetable", 
        label: "시간표 변경", 
        icon: "📅", 
        defaultTitle: "[시간표] 수업 시간표 변동 안내", 
        defaultMessage: "수업 시간표에 변동 사항이 있습니다. 확인해 주세요.",
        badgeClass: "bg-teal-100 text-teal-800 border-teal-200" 
    },
    { 
        id: "urgent", 
        label: "긴급공지", 
        icon: "🚨", 
        defaultTitle: "[긴급] 필독 안내사항", 
        defaultMessage: "중요한 공지사항이 있습니다. 즉시 확인해 주시기 바랍니다.",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-200" 
    },
    { 
        id: "test", 
        label: "테스트", 
        icon: "🧪", 
        defaultTitle: "[테스트] 알림 수신 확인", 
        defaultMessage: "수행평가 알림 수신 테스트 메시지입니다. 정상적으로 수신되었습니다.",
        badgeClass: "bg-purple-100 text-purple-800 border-purple-200" 
    },
];

export function NotificationManager({ adminPassword }: NotificationManagerProps) {
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState<"send" | "history">("send");

    // Target state
    const [targetType, setTargetType] = useState<"student" | "teacher" | "all">("student");
    const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
    const [targetGrade, setTargetGrade] = useState<string>("");
    const [targetClass, setTargetClass] = useState<string>("");
    const [targetStudentNumber, setTargetStudentNumber] = useState<string>("");
    const [targetStudentName, setTargetStudentName] = useState<string>("");
    const [targetTeacherName, setTargetTeacherName] = useState<string>("");

    // Delivery technology state ('all' | 'push' | 'in_app' | 'app')
    const [deliveryType, setDeliveryType] = useState<string>("all");

    // Teacher search with unified algorithm
    const { teacherOptions, isLoading: isTeacherListLoading } = useTeacherOptions();
    const [showTeacherSelectModal, setShowTeacherSelectModal] = useState(false);
    const [teacherModalSearchQuery, setTeacherModalSearchQuery] = useState("");

    const filteredTeacherOptions = useMemo(() => {
        return filterTeacherOptions(teacherOptions, teacherModalSearchQuery, false);
    }, [teacherOptions, teacherModalSearchQuery]);

    const selectedTeacherObj = useMemo(() => {
        if (!targetTeacherName) return null;
        return teacherOptions.find(o => o.rawName === targetTeacherName || o.displayName === targetTeacherName) || null;
    }, [teacherOptions, targetTeacherName]);

    // Message state
    const [category, setCategory] = useState<string>("assessment");
    const [title, setTitle] = useState(NOTIFICATION_TYPES[0].defaultTitle);
    const [message, setMessage] = useState(NOTIFICATION_TYPES[0].defaultMessage);
    const [link, setLink] = useState("/");

    // 1. Fetch only users who enabled notifications (is_active = 1)
    const subscribersQuery = useQuery({
        queryKey: ["admin", "notification-subscribers"],
        queryFn: async () => {
            const res = await fetch("/api/admin/notifications/subscribers", {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("구독자 목록 조회 실패");
            return res.json();
        },
        refetchInterval: 5000
    });

    // 2. Fetch sent notification history
    const historyQuery = useQuery({
        queryKey: ["admin", "notification-history"],
        queryFn: async () => {
            const res = await fetch("/api/admin/notifications", {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("발송 내역 조회 실패");
            return res.json();
        },
        refetchInterval: 5000
    });

    // 3. Send notification mutation
    const sendMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/admin/notifications/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": adminPassword
                },
                body: JSON.stringify({
                    targetType,
                    targetGrade: Number(targetGrade) || 0,
                    targetClass: Number(targetClass) || 0,
                    targetStudentNumber: Number(targetStudentNumber) || 0,
                    targetStudentName: targetStudentName.trim(),
                    targetTeacherName: targetTeacherName.trim(),
                    title: title.trim(),
                    message: message.trim(),
                    category,
                    deliveryType,
                    link: link.trim() || "/"
                })
            });

            if (!res.ok) {
                let errorMsg = `발송 실패 (상태코드: ${res.status})`;
                try {
                    const err = await res.json();
                    if (err.error) errorMsg = err.error;
                } catch (_) {
                    const txt = await res.text().catch(() => "");
                    if (txt) errorMsg += `: ${txt.slice(0, 100)}`;
                }
                throw new Error(errorMsg);
            }
            return res.json();
        },
        onSuccess: (data) => {
            const deliveryObj = DELIVERY_TYPES.find(d => d.id === (data.deliveryType || deliveryType)) || DELIVERY_TYPES[0];
            toast.success(`[${deliveryObj.label}] 알림이 성공적으로 등록되었습니다! (매칭 기기: ${data.matchedCount}대)`);
            queryClient.invalidateQueries({ queryKey: ["admin", "notification-history"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "notification-subscribers"] });
        },
        onError: (err: any) => {
            toast.error(err.message || "알림 발송 중 오류가 발생했습니다.");
        }
    });

    // 4. Delete notification mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/admin/notifications?id=${id}`, {
                method: "DELETE",
                headers: { "X-Admin-Password": adminPassword }
            });
            if (!res.ok) throw new Error("삭제 실패");
            return res.json();
        },
        onSuccess: () => {
            toast.success("발송 내역이 삭제되었습니다.");
            queryClient.invalidateQueries({ queryKey: ["admin", "notification-history"] });
        }
    });

    // 중복 제거된 고유 사용자 목록 (사용자 관리 탭 기준)
    const rawSubscribers = subscribersQuery.data?.subscribers || [];
    const students: any[] = subscribersQuery.data?.students || [];
    const teachers: any[] = subscribersQuery.data?.teachers || [];
    const totalActiveUsers = subscribersQuery.data?.totalUserCount ?? (students.length + teachers.length);
    const totalDevices = subscribersQuery.data?.totalDeviceCount ?? rawSubscribers.length;

    // 알림 종류 변경 핸들러 (제목/내용 템플릿 스마트 동기화)
    const handleSelectCategory = (typeId: string) => {
        setCategory(typeId);
        const matched = NOTIFICATION_TYPES.find(t => t.id === typeId);
        if (matched) {
            const isDefaultTitle = NOTIFICATION_TYPES.some(t => t.defaultTitle === title) || !title.trim();
            if (isDefaultTitle) {
                setTitle(matched.defaultTitle);
            }
            const isDefaultMessage = NOTIFICATION_TYPES.some(t => t.defaultMessage === message) || !message.trim();
            if (isDefaultMessage) {
                setMessage(matched.defaultMessage);
            }
        }
    };

    // 타깃 학생 단일 선택 (토글 지원)
    const handleToggleStudent = (s: any) => {
        const sKey = `${s.studentName || ''}|${s.grade}-${s.classNum}-${s.studentNumber || 0}`;
        if (selectedTargetKey === sKey) {
            setSelectedTargetKey(null);
            setTargetGrade("");
            setTargetClass("");
            setTargetStudentNumber("");
            setTargetStudentName("");
        } else {
            setSelectedTargetKey(sKey);
            setTargetType("student");
            setTargetGrade(s.grade ? String(s.grade) : "");
            setTargetClass(s.classNum ? String(s.classNum) : "");
            setTargetStudentNumber(s.studentNumber ? String(s.studentNumber) : "");
            setTargetStudentName(s.studentName || "");
            setTargetTeacherName("");
        }
    };

    // 타깃 교사 단일 선택 (토글 지원)
    const handleToggleTeacher = (t: any) => {
        const tKey = `teacher|${t.teacherName || ''}`;
        if (selectedTargetKey === tKey) {
            setSelectedTargetKey(null);
            setTargetTeacherName("");
        } else {
            setSelectedTargetKey(tKey);
            setTargetType("teacher");
            setTargetTeacherName(t.teacherName || "");
            setTargetGrade("");
            setTargetClass("");
            setTargetStudentNumber("");
            setTargetStudentName("");
        }
    };

    // 내부 스크롤 영역에서 끝(상단/하단)에 도달했을 때 상위 컨테이너로 휠 스크롤 부드럽게 전달 (스크롤 갇힘 방지)
    const handleInnerWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const isAtTop = el.scrollTop <= 0;
        const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

        if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
            let parent = el.parentElement;
            while (parent && parent !== document.body) {
                const style = window.getComputedStyle(parent);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
                    parent.scrollTop += e.deltaY;
                    break;
                }
                parent = parent.parentElement;
            }
        }
    };

    return (
        <div className="flex flex-col h-full gap-4 overflow-y-auto pr-1 overscroll-contain">
            {/* 상단 헤더: 중복되는 '알림 발송' 버튼을 완전히 제거하고 발송내역 토글과 새로고침만 배치 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2 text-amber-700">
                        <Bell className="w-5 h-5 text-amber-600" />
                        알림 관리 &amp; 발송
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        종 모양 아이콘에서 <strong>수행 알림받기를 켠 활성 사용자</strong>에게 알림을 발송합니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {activeTab === "send" ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-xs hover:bg-amber-50 hover:text-amber-900 border-amber-200 cursor-pointer"
                            onClick={() => setActiveTab("history")}
                        >
                            <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                            발송 내역 ({historyQuery.data?.notifications?.length ?? 0})
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="default"
                            className="bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold text-xs cursor-pointer"
                            onClick={() => setActiveTab("send")}
                        >
                            <Send className="w-3.5 h-3.5 mr-1" />
                            새 알림 작성으로
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            subscribersQuery.refetch();
                            historyQuery.refetch();
                        }}
                        className="h-8 w-8 p-0 cursor-pointer"
                        title="새로고침"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${subscribersQuery.isFetching ? "animate-spin text-amber-600" : "text-gray-400"}`} />
                    </Button>
                </div>
            </div>

            {/* 활성 구독자 수 현황 카드: 기기 대수가 아닌 사용자 관리 탭 기준 고유 활성 사용자 수 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-amber-800">알림 ON 전체 사용자</p>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                            <p className="text-xl font-extrabold text-amber-900">{totalActiveUsers}명</p>
                            {totalDevices > totalActiveUsers && (
                                <span className="text-[10px] text-amber-700 font-medium">({totalDevices}대 기기)</span>
                            )}
                        </div>
                    </div>
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                        실시간 활성
                    </Badge>
                </div>
                <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-blue-800">알림 ON 학생</p>
                        <p className="text-xl font-extrabold text-blue-900 mt-0.5">{students.length}명</p>
                    </div>
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                        학생 대상
                    </Badge>
                </div>
                <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/40 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-emerald-800">알림 ON 선생님</p>
                        <p className="text-xl font-extrabold text-emerald-900 mt-0.5">{teachers.length}명</p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                        교사 대상
                    </Badge>
                </div>
            </div>

            {/* TAB 1: 알림 발송 폼 & 사용자 관리 기준 중복 없는 대상 목록 */}
            {activeTab === "send" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* 좌측: 사용자 관리 기준 중복 제거된 활성 대상 목록 */}
                    <div className="lg:col-span-5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-amber-600" />
                                알림 켠 사용자 목록 ({totalActiveUsers}명)
                            </span>
                            <span className="text-[11px] text-gray-400">클릭 시 자동 선택 / 해제</span>
                        </div>

                        {totalActiveUsers === 0 ? (
                            <div className="p-6 rounded-xl border border-dashed border-amber-200 bg-amber-50/30 text-center flex flex-col items-center gap-2">
                                <AlertCircle className="w-8 h-8 text-amber-500" />
                                <p className="text-xs font-bold text-gray-700">현재 알림을 켠 사용자가 없습니다.</p>
                                <p className="text-[11px] text-gray-400 max-w-xs leading-relaxed">
                                    메인 페이지 또는 교사용 페이지 상단 종 모양을 클릭해 <strong>'수행 알림받기'</strong>를 켜면 이 목록에 실시간 등록됩니다.
                                </p>
                            </div>
                        ) : (
                            <div 
                                className="space-y-3 max-h-[520px] overflow-y-auto pr-1 overscroll-contain touch-pan-y"
                                onWheel={handleInnerWheel}
                            >
                                {/* 학생 목록 섹션 (중복 없음) */}
                                {students.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold text-blue-700 mb-1.5 flex items-center gap-1">
                                            👨‍🎓 학생 ({students.length}명)
                                        </p>
                                        <div className="space-y-1.5">
                                            {students.map((s: any) => {
                                                const sKey = `${s.studentName || ''}|${s.grade}-${s.classNum}-${s.studentNumber || 0}`;
                                                const isSelected = selectedTargetKey === sKey;
                                                const studentIdStr = s.grade && s.classNum ? `${s.grade}학년 ${s.classNum}반${s.studentNumber ? ` ${s.studentNumber}번` : ''}` : '학번 미지정';
                                                const platforms = (s.platforms || ['web']).map((p: string) => p.toUpperCase()).join(', ');

                                                return (
                                                    <div
                                                        key={sKey}
                                                        onClick={() => handleToggleStudent(s)}
                                                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between select-none ${
                                                            isSelected 
                                                                ? 'border-amber-400 bg-amber-50/90 shadow-sm ring-1 ring-amber-300' 
                                                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-gray-900">
                                                                    {s.studentName || '이름 없음'}
                                                                </span>
                                                                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                                                                    {studentIdStr}
                                                                </Badge>
                                                                {s.deviceCount > 1 && (
                                                                    <span className="text-[10px] font-semibold text-amber-600">
                                                                        기기 {s.deviceCount}대
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                                                                <span className="font-medium text-slate-500">{platforms}</span>
                                                                <span>·</span>
                                                                <span>{s.updatedAt ? new Date(s.updatedAt.replace(' ', 'T') + (s.updatedAt.endsWith('Z') ? '' : 'Z')).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white shrink-0 ml-2 shadow-xs">
                                                                <Check className="w-3 h-3 stroke-[3]" />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 선생님 목록 섹션 (중복 없음) */}
                                {teachers.length > 0 && (
                                    <div className="pt-2">
                                        <p className="text-[11px] font-bold text-emerald-700 mb-1.5 flex items-center gap-1">
                                            👩‍🏫 선생님 ({teachers.length}명)
                                        </p>
                                        <div className="space-y-1.5">
                                            {teachers.map((t: any) => {
                                                const tKey = `teacher|${t.teacherName || ''}`;
                                                const isSelected = selectedTargetKey === tKey;
                                                const platforms = (t.platforms || ['web']).map((p: string) => p.toUpperCase()).join(', ');
                                                const matchedOpt = teacherOptions.find(o => o.rawName === t.teacherName || o.displayName === t.teacherName);
                                                const teacherTitle = matchedOpt ? `${matchedOpt.label} 선생님` : `${t.teacherName || '선생님'}`;

                                                return (
                                                    <div
                                                        key={tKey}
                                                        onClick={() => handleToggleTeacher(t)}
                                                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between select-none ${
                                                            isSelected 
                                                                ? 'border-amber-400 bg-amber-50/90 shadow-sm ring-1 ring-amber-300' 
                                                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-bold text-gray-900">
                                                                    {teacherTitle}
                                                                </span>
                                                                {matchedOpt?.rawName && matchedOpt.rawName !== matchedOpt.displayName && (
                                                                    <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 text-slate-500 border-slate-200">
                                                                        고유: {matchedOpt.rawName}
                                                                    </Badge>
                                                                )}
                                                                {t.deviceCount > 1 && (
                                                                    <span className="text-[10px] font-semibold text-emerald-600">
                                                                        기기 {t.deviceCount}대
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {matchedOpt?.subjects && matchedOpt.subjects.length > 0 && (
                                                                <p className="text-[10px] text-emerald-700/80 font-medium truncate mt-0.5">
                                                                    담당: {matchedOpt.subjects.join(', ')}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                                                                <span className="font-medium text-slate-500">{platforms}</span>
                                                                <span>·</span>
                                                                <span>{t.updatedAt ? new Date(t.updatedAt.replace(' ', 'T') + (t.updatedAt.endsWith('Z') ? '' : 'Z')).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white shrink-0 ml-2 shadow-xs">
                                                                <Check className="w-3 h-3 stroke-[3]" />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 우측: 알림 내용 입력 및 단일 발송기 */}
                    <div className="lg:col-span-7 flex flex-col gap-4">
                        <Card className="border shadow-xs">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Send className="w-4 h-4 text-amber-600" />
                                    알림 작성 및 발송
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    발송할 대상 정보와 알림 종류/제목/내용을 입력하세요.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-xs">
                                {/* 타깃 유형 선택 버튼 */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="font-semibold text-gray-700">발송 대상 구분</label>
                                        {selectedTargetKey && (
                                            <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-amber-600" />
                                                선택된 특정 사용자 타깃 중
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetType("student");
                                                setSelectedTargetKey(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                                                targetType === "student" ? "bg-blue-600 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            }`}
                                        >
                                            학생 타깃
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetType("teacher");
                                                setSelectedTargetKey(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                                                targetType === "teacher" ? "bg-emerald-600 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            }`}
                                        >
                                            선생님 타깃
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetType("all");
                                                setSelectedTargetKey(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                                                targetType === "all" ? "bg-purple-600 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            }`}
                                        >
                                            전체 사용자 (전교생/교사)
                                        </button>
                                    </div>
                                </div>

                                {/* 학생 세부 타깃 입력 */}
                                {targetType === "student" && (
                                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2.5">
                                        <p className="text-[11px] font-bold text-blue-900">학생 타깃 상세 (학번 또는 이름)</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="text-[10px] text-gray-500 mb-0.5 block">학년 (0=전체)</label>
                                                <Input
                                                    type="number"
                                                    placeholder="예: 1"
                                                    value={targetGrade}
                                                    onChange={(e) => { setTargetGrade(e.target.value); setSelectedTargetKey(null); }}
                                                    onWheel={(e) => (e.target as HTMLElement).blur()}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-gray-500 mb-0.5 block">반 (0=전체)</label>
                                                <Input
                                                    type="number"
                                                    placeholder="예: 3"
                                                    value={targetClass}
                                                    onChange={(e) => { setTargetClass(e.target.value); setSelectedTargetKey(null); }}
                                                    onWheel={(e) => (e.target as HTMLElement).blur()}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-gray-500 mb-0.5 block">번호 (선택)</label>
                                                <Input
                                                    type="number"
                                                    placeholder="예: 15"
                                                    value={targetStudentNumber}
                                                    onChange={(e) => { setTargetStudentNumber(e.target.value); setSelectedTargetKey(null); }}
                                                    onWheel={(e) => (e.target as HTMLElement).blur()}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-500 mb-0.5 block">학생 이름 (선택, 예: 홍길동)</label>
                                            <Input
                                                placeholder="학생 이름 입력"
                                                value={targetStudentName}
                                                onChange={(e) => { setTargetStudentName(e.target.value); setSelectedTargetKey(null); }}
                                                className="h-8 text-xs bg-white"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 선생님 세부 타깃 입력 (동명이인 과목 구분 및 실시간 검색) */}
                                {targetType === "teacher" && (
                                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                                                <span>👩‍🏫</span> 선생님 타깃 상세 (동명이인 과목 구분)
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTeacherModalSearchQuery("");
                                                    setShowTeacherSelectModal(true);
                                                }}
                                                className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100/80 hover:bg-emerald-200 transition-colors cursor-pointer"
                                            >
                                                <Search className="w-3 h-3" />
                                                선생님 검색하기
                                            </button>
                                        </div>

                                        {targetTeacherName ? (
                                            <div className="p-2.5 bg-white rounded-lg border border-emerald-200 flex items-start justify-between gap-2 shadow-2xs">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-gray-900 text-xs">
                                                            {selectedTeacherObj ? `${selectedTeacherObj.label} 선생님` : `${targetTeacherName} 선생님`}
                                                        </span>
                                                        {selectedTeacherObj?.rawName && selectedTeacherObj.rawName !== selectedTeacherObj.displayName && (
                                                            <Badge variant="secondary" className="text-[9px] font-mono px-1 py-0 bg-slate-100 text-slate-600">
                                                                고유: {selectedTeacherObj.rawName}
                                                            </Badge>
                                                        )}
                                                        {teachers.some(t => t.teacherName === targetTeacherName || (selectedTeacherObj && (t.teacherName === selectedTeacherObj.rawName || t.teacherName === selectedTeacherObj.displayName))) ? (
                                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                                                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                                🔔 알림 ON (수신 활성)
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                                                ⚠️ 현재 알림 미설정(OFF)
                                                            </span>
                                                        )}
                                                    </div>
                                                    {selectedTeacherObj?.subjects && selectedTeacherObj.subjects.length > 0 && (
                                                        <p className="text-[10px] text-slate-500 mt-1">
                                                            담당 과목: {selectedTeacherObj.subjects.join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-[10px] px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50 cursor-pointer"
                                                        onClick={() => {
                                                            setTeacherModalSearchQuery("");
                                                            setShowTeacherSelectModal(true);
                                                        }}
                                                    >
                                                        변경
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-[10px] px-2 text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                                        onClick={() => {
                                                            setTargetTeacherName("");
                                                            setSelectedTargetKey(null);
                                                        }}
                                                        title="선택 해제 (전체 선생님 발송)"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-white rounded-lg border border-dashed border-emerald-200 flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-800">
                                                        전체 선생님 대상 발송
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                                        수행 알림받기를 켠 모든 선생님(총 {teachers.length}명)에게 알림이 전달됩니다.
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs"
                                                    onClick={() => {
                                                        setTeacherModalSearchQuery("");
                                                        setShowTeacherSelectModal(true);
                                                    }}
                                                >
                                                    <Search className="w-3.5 h-3.5 mr-1" />
                                                    선생님 지정
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 알림 기술 (발송 방식: 푸시 알림, 일반알림, 앱전용 등) 선택 UI */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="font-semibold text-gray-700 flex items-center gap-1.5">
                                            <Radio className="w-3.5 h-3.5 text-indigo-600" />
                                            알림 기술 선택 (발송 방식)
                                        </label>
                                        <span className="text-[11px] text-gray-500 font-medium">
                                            {DELIVERY_TYPES.find(d => d.id === deliveryType)?.sublabel}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {DELIVERY_TYPES.map((d) => {
                                            const isSelected = deliveryType === d.id;
                                            return (
                                                <button
                                                    key={d.id}
                                                    type="button"
                                                    onClick={() => setDeliveryType(d.id)}
                                                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                                                        isSelected
                                                            ? `${d.badgeClass} ring-2 ring-indigo-400 font-bold shadow-xs scale-[1.01]`
                                                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between w-full mb-1">
                                                        <span className="text-base">{d.icon}</span>
                                                        {isSelected && (
                                                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white shadow-xs">
                                                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold leading-tight">{d.label}</p>
                                                        <p className={`text-[10px] line-clamp-1 mt-0.5 ${isSelected ? 'text-indigo-900/80 font-medium' : 'text-gray-400'}`}>
                                                            {d.badgeLabel}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 알림 종류 지정 UI (칩 선택기) */}
                                <div className="space-y-1.5">
                                    <label className="font-semibold text-gray-700 flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        알림 종류 지정
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {NOTIFICATION_TYPES.map((t) => {
                                            const isSelected = category === t.id;
                                            return (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => handleSelectCategory(t.id)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                                                        isSelected
                                                            ? `${t.badgeClass} ring-2 ring-amber-400 font-bold shadow-xs scale-[1.02]`
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                                    }`}
                                                >
                                                    <span>{t.icon}</span>
                                                    <span>{t.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 알림 제목 */}
                                <div>
                                    <label className="font-semibold text-gray-700 mb-1 block">알림 제목</label>
                                    <Input
                                        placeholder="알림 제목을 입력하세요"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="h-9 text-xs"
                                    />
                                </div>

                                {/* 알림 내용 */}
                                <div>
                                    <label className="font-semibold text-gray-700 mb-1 block">알림 상세 내용</label>
                                    <Textarea
                                        rows={3}
                                        placeholder="알림 메시지를 입력하세요"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        className="text-xs resize-none"
                                    />
                                </div>

                                {/* 이동 링크 (선택) */}
                                <div>
                                    <label className="font-semibold text-gray-700 mb-1 block">터치 시 이동 링크 (기본: /)</label>
                                    <Input
                                        placeholder="/"
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>

                                {/* 발송 대상 요약 안내 */}
                                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]">
                                    <span className="text-gray-500 font-medium">최종 발송 대상:</span>
                                    <span className="font-bold text-gray-900">
                                        {targetType === "all" ? (
                                            "🌐 전체 사용자 (전교생 + 전체 교사)"
                                        ) : targetType === "teacher" ? (
                                            targetTeacherName ? `👩‍🏫 ${selectedTeacherObj ? selectedTeacherObj.label : targetTeacherName} 선생님` : "👩‍🏫 전체 선생님"
                                        ) : (
                                            `👨‍🎓 학생 [${targetGrade ? `${targetGrade}학년 ` : '전체학년 '}${targetClass ? `${targetClass}반 ` : '전체반 '}${targetStudentNumber ? `${targetStudentNumber}번 ` : ''}${targetStudentName ? targetStudentName : ''}]`
                                        )}
                                    </span>
                                </div>

                                {/* 유일한 알림 발송 버튼 */}
                                <Button
                                    className="w-full h-10 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-gray-900 font-bold text-xs shadow-sm cursor-pointer"
                                    onClick={() => sendMutation.mutate()}
                                    disabled={sendMutation.isPending || !title.trim() || !message.trim()}
                                >
                                    <Send className="w-3.5 h-3.5 mr-1.5" />
                                    {sendMutation.isPending ? "알림 발송 중..." : "알림 발송하기"}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* TAB 2: 발송 내역 관리 */}
            {activeTab === "history" && (
                <Card className="border shadow-xs">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600" />
                            최근 발송된 알림 내역
                        </CardTitle>
                        <CardDescription className="text-xs">
                            발송된 알림 기록을 확인하고 필요 없는 알림은 삭제할 수 있습니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        {(!historyQuery.data?.notifications || historyQuery.data.notifications.length === 0) ? (
                            <div className="py-12 text-center text-gray-400 text-xs">
                                발송된 알림 내역이 없습니다.
                            </div>
                        ) : (
                            <div 
                                className="divide-y divide-gray-100 max-h-[550px] overflow-y-auto overscroll-contain touch-pan-y"
                                onWheel={handleInnerWheel}
                            >
                                {historyQuery.data.notifications.map((n: any) => {
                                    let targetText = "전체 사용자";
                                    if (n.target_type === "student") {
                                        targetText = `학생 (${n.target_grade ? `${n.target_grade}학년 ` : ''}${n.target_class ? `${n.target_class}반 ` : ''}${n.target_student_name ? `${n.target_student_name}` : ''})`;
                                    } else if (n.target_type === "teacher") {
                                        const matchedOpt = teacherOptions.find(o => o.rawName === n.target_teacher_name || o.displayName === n.target_teacher_name);
                                        const tLabel = matchedOpt ? matchedOpt.label : n.target_teacher_name;
                                        targetText = `선생님 (${tLabel || '전체'})`;
                                    }

                                    const typeInfo = NOTIFICATION_TYPES.find(t => t.id === n.category) || {
                                        label: n.category === 'notice' ? '공지사항' : n.category === 'test' ? '테스트' : n.category === 'timetable' ? '시간표' : n.category === 'urgent' ? '긴급공지' : '수행평가',
                                        badgeClass: n.category === 'notice' ? 'bg-amber-100 text-amber-800 border-amber-200' : n.category === 'test' ? 'bg-purple-100 text-purple-800 border-purple-200' : n.category === 'timetable' ? 'bg-teal-100 text-teal-800 border-teal-200' : n.category === 'urgent' ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-blue-100 text-blue-800 border-blue-200'
                                    };

                                    const deliveryInfo = DELIVERY_TYPES.find(d => d.id === n.delivery_type) || DELIVERY_TYPES[0];

                                    return (
                                        <div key={n.id} className="p-4 flex items-start justify-between gap-4 hover:bg-gray-50/70 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${deliveryInfo.badgeClass}`}>
                                                        {deliveryInfo.icon} {deliveryInfo.badgeLabel}
                                                    </Badge>
                                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${typeInfo.badgeClass}`}>
                                                        {typeInfo.label}
                                                    </Badge>
                                                    <span className="text-xs font-bold text-gray-900">{n.title}</span>
                                                    <Badge variant="secondary" className="text-[10px] font-mono px-1 py-0 text-gray-600">
                                                        타깃: {targetText}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{n.message}</p>
                                                <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-2">
                                                    <span>발송: {n.created_at ? new Date(n.created_at.replace(' ', 'T') + (n.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString('ko-KR') : '-'}</span>
                                                    <span>·</span>
                                                    <span>읽음 확인: {n.read_count ?? 0}회</span>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 text-xs shrink-0 cursor-pointer"
                                                onClick={() => {
                                                    if (confirm(`알림 "${n.title}"을(를) 삭제하시겠습니까?`)) {
                                                        deleteMutation.mutate(n.id);
                                                    }
                                                }}
                                                disabled={deleteMutation.isPending}
                                            >
                                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                                삭제
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* 선생님 검색 및 선택 모달 Dialog (선생님 페이지와 100% 동일한 알고리즘 및 UI) */}
            <Dialog open={showTeacherSelectModal} onOpenChange={setShowTeacherSelectModal}>
                <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 sm:px-5 sm:py-4 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                                <span>👩‍🏫</span> 선생님 선택 (동명이인 과목 구분)
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-emerald-100 text-[11px] sm:text-xs mt-0.5 font-medium">
                            시간표 및 담당 과목과 연동되어 동명이인 선생님을 정확히 구분하여 알림을 발송합니다.
                        </p>
                    </div>

                    {/* Search Input */}
                    <div className="p-2.5 sm:p-3 bg-slate-50 border-b border-slate-100">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <Input
                                type="text"
                                placeholder="선생님 이름 또는 과목 검색 (예: 김영희, 국어, 수학)..."
                                value={teacherModalSearchQuery}
                                onChange={(e) => setTeacherModalSearchQuery(e.target.value)}
                                className="pl-9 pr-8 bg-white border-slate-200 text-sm h-9 sm:h-10 rounded-xl focus-visible:ring-emerald-500"
                                autoFocus
                            />
                            {teacherModalSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setTeacherModalSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Action: 전체 선생님에게 발송 바로가기 */}
                    <div className="px-3 pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                setTargetType("teacher");
                                setTargetTeacherName("");
                                setSelectedTargetKey(null);
                                setShowTeacherSelectModal(false);
                                toast.info("발송 대상이 '전체 선생님'으로 설정되었습니다.");
                            }}
                            className="w-full py-2 px-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-800 font-bold text-xs flex items-center justify-between transition-colors cursor-pointer"
                        >
                            <span className="flex items-center gap-1.5">
                                <span>🌐</span> 전체 선생님에게 발송 (특정 대상 지정 해제)
                            </span>
                            <span className="text-[10px] text-emerald-600 font-normal">
                                전체 {teachers.length}명 수신
                            </span>
                        </button>
                    </div>

                    {/* Teacher List */}
                    <div className="max-h-[300px] sm:max-h-[380px] overflow-y-auto p-2.5 space-y-1">
                        {filteredTeacherOptions.length === 0 ? (
                            <div className="py-12 text-center text-slate-400">
                                <p className="text-sm font-medium">검색 결과가 없습니다.</p>
                                <p className="text-xs text-slate-400 mt-1">다른 이름이나 과목명을 입력해 보세요.</p>
                            </div>
                        ) : (
                            filteredTeacherOptions.map((opt) => {
                                const isSelected = targetTeacherName === opt.rawName;
                                const isSubscribed = teachers.some(t => t.teacherName === opt.rawName || t.teacherName === opt.displayName);

                                return (
                                    <button
                                        key={opt.idx}
                                        type="button"
                                        onClick={() => {
                                            setTargetType("teacher");
                                            setTargetTeacherName(opt.rawName);
                                            setSelectedTargetKey(null);
                                            setShowTeacherSelectModal(false);
                                            toast.success(`"${opt.label} 선생님"이 알림 대상으로 지정되었습니다.`);
                                        }}
                                        className={cn(
                                            "w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between transition-all duration-150 gap-2 border cursor-pointer",
                                            isSelected
                                                ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-300"
                                                : "bg-white border-gray-100 hover:border-gray-200 hover:bg-slate-50 text-slate-800 font-medium active:bg-slate-100"
                                        )}
                                    >
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold truncate">
                                                    {opt.label} 선생님
                                                </span>
                                                {opt.rawName !== opt.displayName && (
                                                    <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 text-slate-500 border-slate-200">
                                                        고유: {opt.rawName}
                                                    </Badge>
                                                )}
                                                {isSubscribed ? (
                                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                                                        🔔 알림 ON
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-400 font-medium">
                                                        미설정
                                                    </span>
                                                )}
                                            </div>
                                            {opt.subjects && opt.subjects.length > 0 && (
                                                <span className="text-[10px] text-slate-400 font-normal truncate mt-0.5">
                                                    {opt.subjects.join(", ")}
                                                </span>
                                            )}
                                        </div>

                                        {isSelected ? (
                                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                                <Check className="w-3 h-3 stroke-[3]" />
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400 font-semibold px-2 py-0.5 rounded-md bg-slate-100 shrink-0">
                                                선택
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
