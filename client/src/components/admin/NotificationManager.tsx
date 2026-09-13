// client/src/components/admin/NotificationManager.tsx
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, CheckCircle2, AlertCircle, Trash2, Users, Smartphone, RefreshCw, Clock, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

interface NotificationManagerProps {
    adminPassword: string;
}

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
        refetchInterval: 10000
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
        refetchInterval: 15000
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
                    link: link.trim() || "/"
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "발송 실패");
            }
            return res.json();
        },
        onSuccess: (data) => {
            toast.success(`알림이 성공적으로 등록되었습니다! (매칭 기기: ${data.matchedCount}대)`);
            queryClient.invalidateQueries({ queryKey: ["admin", "notification-history"] });
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

    return (
        <div className="flex flex-col h-full gap-4 overflow-y-auto pr-1">
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
                            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
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
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-gray-900">
                                                                    {t.teacherName || '선생님'}
                                                                </span>
                                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                    선생님
                                                                </Badge>
                                                                {t.deviceCount > 1 && (
                                                                    <span className="text-[10px] font-semibold text-emerald-600">
                                                                        기기 {t.deviceCount}대
                                                                    </span>
                                                                )}
                                                            </div>
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

                                {/* 선생님 세부 타깃 입력 */}
                                {targetType === "teacher" && (
                                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2.5">
                                        <p className="text-[11px] font-bold text-emerald-900">선생님 타깃 상세</p>
                                        <div>
                                            <label className="text-[10px] text-gray-500 mb-0.5 block">선생님 이름 (비워둘 시 전체 선생님)</label>
                                            <Input
                                                placeholder="예: 김선생"
                                                value={targetTeacherName}
                                                onChange={(e) => { setTargetTeacherName(e.target.value); setSelectedTargetKey(null); }}
                                                className="h-8 text-xs bg-white"
                                            />
                                        </div>
                                    </div>
                                )}

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
                            <div className="divide-y divide-gray-100 max-h-[550px] overflow-y-auto">
                                {historyQuery.data.notifications.map((n: any) => {
                                    let targetText = "전체 사용자";
                                    if (n.target_type === "student") {
                                        targetText = `학생 (${n.target_grade ? `${n.target_grade}학년 ` : ''}${n.target_class ? `${n.target_class}반 ` : ''}${n.target_student_name ? `${n.target_student_name}` : ''})`;
                                    } else if (n.target_type === "teacher") {
                                        targetText = `선생님 (${n.target_teacher_name || '전체'})`;
                                    }

                                    const typeInfo = NOTIFICATION_TYPES.find(t => t.id === n.category) || {
                                        label: n.category === 'notice' ? '공지사항' : n.category === 'test' ? '테스트' : n.category === 'timetable' ? '시간표' : n.category === 'urgent' ? '긴급공지' : '수행평가',
                                        badgeClass: n.category === 'notice' ? 'bg-amber-100 text-amber-800 border-amber-200' : n.category === 'test' ? 'bg-purple-100 text-purple-800 border-purple-200' : n.category === 'timetable' ? 'bg-teal-100 text-teal-800 border-teal-200' : n.category === 'urgent' ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-blue-100 text-blue-800 border-blue-200'
                                    };

                                    return (
                                        <div key={n.id} className="p-4 flex items-start justify-between gap-4 hover:bg-gray-50/70 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
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
        </div>
    );
}
