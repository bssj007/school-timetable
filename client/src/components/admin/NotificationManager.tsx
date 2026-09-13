// client/src/components/admin/NotificationManager.tsx
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, CheckCircle2, AlertCircle, Trash2, User, Users, Smartphone, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

interface NotificationManagerProps {
    adminPassword: string;
}

export function NotificationManager({ adminPassword }: NotificationManagerProps) {
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState<"send" | "history">("send");

    // Target state
    const [targetType, setTargetType] = useState<"student" | "teacher" | "all">("student");
    const [selectedSubscriberId, setSelectedSubscriberId] = useState<number | null>(null);
    const [targetGrade, setTargetGrade] = useState<string>("");
    const [targetClass, setTargetClass] = useState<string>("");
    const [targetStudentNumber, setTargetStudentNumber] = useState<string>("");
    const [targetStudentName, setTargetStudentName] = useState<string>("");
    const [targetTeacherName, setTargetTeacherName] = useState<string>("");

    // Message state
    const [title, setTitle] = useState("[테스트] 수행평가 알림");
    const [message, setMessage] = useState("수행평가 알림 수신 테스트 메시지입니다. 정상적으로 수신되었습니다.");
    const [category, setCategory] = useState<"assessment" | "notice" | "test">("assessment");
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

    // 3. Send test notification mutation
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

    const students = subscribersQuery.data?.students || [];
    const teachers = subscribersQuery.data?.teachers || [];
    const totalActiveCount = subscribersQuery.data?.totalCount ?? 0;

    // Quick select helper
    const handleSelectStudent = (s: any) => {
        setSelectedSubscriberId(s.id);
        setTargetType("student");
        setTargetGrade(s.grade ? String(s.grade) : "");
        setTargetClass(s.classNum ? String(s.classNum) : "");
        setTargetStudentNumber(s.studentNumber ? String(s.studentNumber) : "");
        setTargetStudentName(s.studentName || "");
        setTargetTeacherName("");
    };

    const handleSelectTeacher = (t: any) => {
        setSelectedSubscriberId(t.id);
        setTargetType("teacher");
        setTargetTeacherName(t.teacherName || "");
        setTargetGrade("");
        setTargetClass("");
        setTargetStudentNumber("");
        setTargetStudentName("");
    };

    return (
        <div className="flex flex-col h-full gap-4 overflow-y-auto pr-1">
            {/* 상단 헤더 및 통계 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2 text-amber-700">
                        <Bell className="w-5 h-5 text-amber-600" />
                        알림 관리 &amp; 테스트 발송
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        종 모양 아이콘에서 <strong>수행 알림받기를 켠 사용자</strong>에게 테스트 알림을 발송합니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant={activeTab === "send" ? "default" : "outline"}
                        className={activeTab === "send" ? "bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold text-xs" : "text-xs"}
                        onClick={() => setActiveTab("send")}
                    >
                        <Send className="w-3.5 h-3.5 mr-1" />
                        알림 발송
                    </Button>
                    <Button
                        size="sm"
                        variant={activeTab === "history" ? "default" : "outline"}
                        className={activeTab === "history" ? "bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold text-xs" : "text-xs"}
                        onClick={() => setActiveTab("history")}
                    >
                        <Clock className="w-3.5 h-3.5 mr-1" />
                        발송 내역 ({historyQuery.data?.notifications?.length ?? 0})
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            subscribersQuery.refetch();
                            historyQuery.refetch();
                        }}
                        className="h-8 w-8 p-0"
                        title="새로고침"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${subscribersQuery.isFetching ? "animate-spin text-amber-600" : "text-gray-400"}`} />
                    </Button>
                </div>
            </div>

            {/* 활성 구독자 수 현황 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold text-amber-800">알림 ON 전체 인원</p>
                        <p className="text-xl font-extrabold text-amber-900 mt-0.5">{totalActiveCount}명</p>
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

            {/* TAB 1: 알림 발송 폼 & 활성 인원 목록 */}
            {activeTab === "send" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* 좌측: 활성화된 인원만 뜨는 타깃 선택 목록 */}
                    <div className="lg:col-span-5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-amber-600" />
                                알림 켠 대상 목록 ({totalActiveCount}명)
                            </span>
                            <span className="text-[11px] text-gray-400">클릭 시 타깃 자동 선택</span>
                        </div>

                        {totalActiveCount === 0 ? (
                            <div className="p-6 rounded-xl border border-dashed border-amber-200 bg-amber-50/30 text-center flex flex-col items-center gap-2">
                                <AlertCircle className="w-8 h-8 text-amber-500" />
                                <p className="text-xs font-bold text-gray-700">현재 알림을 켠 사용자가 없습니다.</p>
                                <p className="text-[11px] text-gray-400 max-w-xs leading-relaxed">
                                    메인 페이지 또는 교사용 페이지 상단 종 모양을 클릭해 <strong>'수행 알림받기'</strong>를 켜면 이 목록에 실시간 등록됩니다.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                                {/* 학생 목록 섹션 */}
                                {students.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold text-blue-700 mb-1.5 flex items-center gap-1">
                                            👨‍🎓 학생 ({students.length}명)
                                        </p>
                                        <div className="space-y-1.5">
                                            {students.map((s: any) => {
                                                const isSelected = selectedSubscriberId === s.id;
                                                const studentIdStr = s.grade && s.classNum ? `${s.grade}학년 ${s.classNum}반 ${s.studentNumber ? `${s.studentNumber}번` : ''}` : '학번 미지정';
                                                return (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => handleSelectStudent(s)}
                                                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                                                            isSelected 
                                                                ? 'border-amber-400 bg-amber-50/80 shadow-xs' 
                                                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-gray-900">
                                                                    {s.studentName || '이름 없음'}
                                                                </span>
                                                                <Badge variant="outline" className="text-[10px] font-mono px-1 py-0 bg-blue-50 text-blue-700 border-blue-200">
                                                                    {studentIdStr}
                                                                </Badge>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                                                                <span className="uppercase">{s.platform || 'web'}</span>
                                                                <span>·</span>
                                                                <span>{s.updatedAt ? new Date(s.updatedAt.replace(' ', 'T') + (s.updatedAt.endsWith('Z') ? '' : 'Z')).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 ml-2" />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 선생님 목록 섹션 */}
                                {teachers.length > 0 && (
                                    <div className="pt-2">
                                        <p className="text-[11px] font-bold text-emerald-700 mb-1.5 flex items-center gap-1">
                                            👩‍🏫 선생님 ({teachers.length}명)
                                        </p>
                                        <div className="space-y-1.5">
                                            {teachers.map((t: any) => {
                                                const isSelected = selectedSubscriberId === t.id;
                                                return (
                                                    <div
                                                        key={t.id}
                                                        onClick={() => handleSelectTeacher(t)}
                                                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                                                            isSelected 
                                                                ? 'border-amber-400 bg-amber-50/80 shadow-xs' 
                                                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-gray-900">
                                                                    {t.teacherName || '선생님'}
                                                                </span>
                                                                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                    교사용
                                                                </Badge>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                                                                <span className="uppercase">{t.platform || 'web'}</span>
                                                                <span>·</span>
                                                                <span>{t.updatedAt ? new Date(t.updatedAt.replace(' ', 'T') + (t.updatedAt.endsWith('Z') ? '' : 'Z')).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 ml-2" />
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

                    {/* 우측: 알림 내용 입력 및 발송기 */}
                    <div className="lg:col-span-7 flex flex-col gap-4">
                        <Card className="border shadow-xs">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Send className="w-4 h-4 text-amber-600" />
                                    테스트 알림 작성 및 발송
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    발송할 대상 정보와 알림 제목/내용을 입력하세요.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-xs">
                                {/* 타깃 유형 라디오 버튼 */}
                                <div className="space-y-1.5">
                                    <label className="font-semibold text-gray-700">발송 대상 구분</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetType("student");
                                                setSelectedSubscriberId(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                                                targetType === "student" ? "bg-blue-500 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            }`}
                                        >
                                            학생 타깃
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetType("teacher");
                                                setSelectedSubscriberId(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                                                targetType === "teacher" ? "bg-emerald-500 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                            }`}
                                        >
                                            선생님 타깃
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetType("all");
                                                setSelectedSubscriberId(null);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                                                targetType === "all" ? "bg-purple-500 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                                                    onChange={(e) => setTargetGrade(e.target.value)}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-gray-500 mb-0.5 block">반 (0=전체)</label>
                                                <Input
                                                    type="number"
                                                    placeholder="예: 3"
                                                    value={targetClass}
                                                    onChange={(e) => setTargetClass(e.target.value)}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-gray-500 mb-0.5 block">번호 (선택)</label>
                                                <Input
                                                    type="number"
                                                    placeholder="예: 15"
                                                    value={targetStudentNumber}
                                                    onChange={(e) => setTargetStudentNumber(e.target.value)}
                                                    className="h-8 text-xs bg-white"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-500 mb-0.5 block">학생 이름 (선택, 예: 홍길동)</label>
                                            <Input
                                                placeholder="학생 이름 입력"
                                                value={targetStudentName}
                                                onChange={(e) => setTargetStudentName(e.target.value)}
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
                                                onChange={(e) => setTargetTeacherName(e.target.value)}
                                                className="h-8 text-xs bg-white"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 제목 & 카테고리 */}
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                    <div className="sm:col-span-3">
                                        <label className="font-semibold text-gray-700 mb-1 block">알림 제목</label>
                                        <Input
                                            placeholder="알림 제목을 입력하세요"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="font-semibold text-gray-700 mb-1 block">구분</label>
                                        <select
                                            value={category}
                                            onChange={(e: any) => setCategory(e.target.value)}
                                            className="w-full h-9 px-2 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        >
                                            <option value="assessment">수행평가</option>
                                            <option value="notice">공지사항</option>
                                            <option value="test">테스트</option>
                                        </select>
                                    </div>
                                </div>

                                {/* 내용 */}
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

                                {/* 발송 버튼 */}
                                <Button
                                    className="w-full h-10 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-gray-900 font-bold text-xs shadow-sm cursor-pointer"
                                    onClick={() => sendMutation.mutate()}
                                    disabled={sendMutation.isPending || !title.trim() || !message.trim()}
                                >
                                    <Send className="w-3.5 h-3.5 mr-1.5" />
                                    {sendMutation.isPending ? "알림 발송 중..." : "테스트 알림 발송하기"}
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

                                    return (
                                        <div key={n.id} className="p-4 flex items-start justify-between gap-4 hover:bg-gray-50/70 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-800 border-amber-200">
                                                        {n.category === 'test' ? '테스트' : n.category === 'notice' ? '공지' : '수행평가'}
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
