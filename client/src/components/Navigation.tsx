import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, Bell, X, ArrowLeft, ArrowRight, UtensilsCrossed } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import {
  getOrCreateDeviceId,
  isNotificationSupported,
  isNotificationSubscribed,
  syncNotificationStatusOnConnect,
  toggleNotificationSubscription,
  displayLocalNotification,
  isNativeApp,
  useClientNotificationState,
  getSessionNotifiedBannerIds,
  markSessionBannerNotified
} from "@/lib/notificationService";

// Helper: Download PC Desktop .url Shortcut
function downloadDesktopShortcut(title: string = "성지수행_시간표_수행평가") {
  const url = window.location.href;
  const content = `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\n`;
  const blob = new Blob([content], { type: 'application/x-msshortcut' });
  const blobUrl = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${title}.url`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

export default function Navigation() {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const { grade, classNum, studentNumber, studentName, teacherName, refreshRole, switchToRole } = useUserConfig();
  const [showBugReportDialog, setShowBugReportDialog] = useState(false);
  const [bugReportMessage, setBugReportMessage] = useState('');
  const [isBugReportSending, setIsBugReportSending] = useState(false);

  const isTeacherPage = location.startsWith("/teacher");

  const handleReturnToStudent = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    switchToRole("student");
  };

  const handleGoToTeacher = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    switchToRole("teacher");
  };

  // ── 알림 프레임워크 & 실시간 목록 ────────────────────────────────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const [isNotifSubscribed, setIsNotifSubscribed] = useState(() => isNotificationSubscribed());
  const [isTogglingNotif, setIsTogglingNotif] = useState(false);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  // 접속 시 자동 동기화
  useEffect(() => {
    syncNotificationStatusOnConnect({
      role: isTeacherPage ? 'teacher' : 'student',
      grade,
      classNum,
      studentNumber,
      studentName,
      teacherName: teacherName || undefined
    });
    setIsNotifSubscribed(isNotificationSubscribed());
  }, [isTeacherPage, grade, classNum, studentNumber, studentName, teacherName]);

  // 실시간 알림 목록 조회 (30초 주기 자동 갱신)
  const notificationsQuery = useQuery({
    queryKey: ['notifications', isTeacherPage ? 'teacher' : 'student', isTeacherPage ? (teacherName || '') : `${grade}-${classNum}-${studentNumber}-${studentName}`, deviceId],
    queryFn: async () => {
      const sp = new URLSearchParams({
        role: isTeacherPage ? 'teacher' : 'student',
        grade: String(grade || '0'),
        classNum: String(classNum || '0'),
        studentNumber: String(studentNumber || '0'),
        studentName: String(studentName || ''),
        teacherName: String(teacherName || ''),
        deviceId
      });
      const res = await fetch(`/api/notifications/list?${sp.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000
  });

  const serverNotifications = notificationsQuery.data?.notifications || [];
  const {
    items: notificationItems,
    unreadCount: unreadNotificationCount,
    markAllRead: markAllClientRead,
    markSingleRead: markSingleClientRead
  } = useClientNotificationState(serverNotifications);

  // 알림 기술(발송 방식)에 따른 신규 미읽음 알림 배너 발송 처리
  useEffect(() => {
    if (!notificationItems || notificationItems.length === 0) return;

    const notifiedBannerIds = getSessionNotifiedBannerIds();
    const unnotifiedItems = notificationItems.filter(it => !it.read && !notifiedBannerIds.has(it.id));
    if (unnotifiedItems.length === 0) return;

    // 세션 중복 방지를 위해 즉시 세션 목록에 등록
    unnotifiedItems.forEach(it => markSessionBannerNotified(it.id));

    // 다량의 알림이 있을 경우 최대 2개까지만 배너를 띄워 팝업 폭탄 방지
    const itemsToNotify = unnotifiedItems.slice(0, 2);

    itemsToNotify.forEach(it => {
      // 일반 알림(in_app)은 기기 푸시 배너를 띄우지 않고 알림함에만 조용히 보관
      if (it.deliveryType === 'in_app') {
        return;
      }

      // 앱 전용 알림(app)은 PWA 또는 앱 환경에서만 팝업 알림
      if (it.deliveryType === 'app') {
        const isApp = isNativeApp() || (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches);
        if (!isApp) return;
      }

      // 알림 ON 상태일 때 로컬 배너 발송
      if (isNotifSubscribed) {
        displayLocalNotification(it.title, it.message, it.link || "/").catch(() => {});
      }
    });
  }, [notificationItems, isNotifSubscribed]);

  // 모두 읽음 처리 (클라이언트 로컬 즉시 반영 + 서버 동기화)
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      markAllClientRead();
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, all: true })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // 단일 알림 읽음 처리 (클라이언트 로컬 즉시 반영 + 서버 동기화)
  const markSingleRead = async (notificationId: number) => {
    markSingleClientRead(notificationId);
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, notificationId })
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (_) {}
  };

  // 알림받기 토글 핸들러
  const handleToggleNotification = async (checked: boolean) => {
    setIsTogglingNotif(true);
    try {
      const result = await toggleNotificationSubscription(checked, {
        role: isTeacherPage ? 'teacher' : 'student',
        grade,
        classNum,
        studentNumber,
        studentName,
        teacherName: teacherName || undefined
      });

      if (result.success) {
        setIsNotifSubscribed(result.enabled);
        if (result.enabled) {
          toast.success(isTeacherPage ? "교사용 알림을 받도록 설정되었습니다!" : "수행 알림을 받도록 설정되었습니다!");
        } else {
          toast.info("알림 수신이 해제되었습니다.");
        }
      } else {
        setIsNotifSubscribed(false);
        if (result.reason === 'ios_safari_needs_pwa') {
          toast.info("iOS는 홈 화면에 앱을 추가(PWA)한 후 실행해야 알림을 받을 수 있습니다.", {
            duration: 5000
          });
        } else if (result.reason === 'permission_denied') {
          toast.error("브라우저 알림 권한이 차단되어 있습니다. 브라우저 주소창 설정에서 알림을 허용해 주세요.", {
            duration: 5000
          });
        } else {
          toast.error("이 브라우저 환경에서는 알림 기능을 지원하지 않습니다.");
        }
      }
    } finally {
      setIsTogglingNotif(false);
    }
  };

  useEffect(() => {
    if (!showNotifications) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showNotifications]);
  // ────────────────────────────────────────────────────────────────────

  const { data: settings } = useQuery({
    queryKey: ['publicSettings'],
    queryFn: async () => {
      const res = await fetch('/api/settings/public');
      if (!res.ok) return { kakao_login_restricted: false };
      return res.json();
    }
  });

  const isBugReportEnabled = Boolean(settings?.bug_report_enabled);

  const handleBugReportSubmit = async () => {
    if (!bugReportMessage.trim()) return;
    setIsBugReportSending(true);
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: bugReportMessage,
          grade: grade,
          classNum: classNum,
          studentNumber: studentNumber,
          studentName: studentName,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('오류신고가 접수되었습니다.');
      setBugReportMessage('');
      setShowBugReportDialog(false);
    } catch (error) {
      toast.error('오류신고 전송에 실패했습니다.');
    } finally {
      setIsBugReportSending(false);
    }
  };

  return (
    <>
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-2 sm:px-4">
          <div className="flex justify-between items-center h-16">
            {isTeacherPage ? (
              /* 교사용 페이지: 내비게이션 바 맨 왼쪽에 학생용 및 급식정보 버튼 정렬 */
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-1.5 sm:px-2.5 font-bold text-xs text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-1 rounded-lg border-none shadow-none cursor-pointer select-none"
                  onClick={handleReturnToStudent}
                >
                  <ArrowLeft className="h-3.5 w-3.5 stroke-[2.2] text-red-600 shrink-0" />
                  <span className="xs:hidden leading-none">학생용</span>
                  <span className="hidden xs:inline leading-none">학생용 페이지로 돌아가기</span>
                </Button>
                <Link href="/meal">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-1.5 sm:px-2.5 font-bold text-xs text-orange-600 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-1 rounded-lg border-none shadow-none cursor-pointer select-none"
                    title="급식 정보 보기"
                  >
                    <UtensilsCrossed className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <span className="leading-none">급식정보</span>
                    <ArrowRight className="h-3.5 w-3.5 stroke-[2.2] text-orange-500 shrink-0" />
                  </Button>
                </Link>
              </div>
            ) : (
              /* 메인(학생) 페이지: 로고 및 오른쪽에 초록색 '교사용' 버튼 표시 */
              <div className="flex items-center">
                <Link href="/" className="text-xl md:text-2xl font-bold flex items-center gap-2">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: settings?.site_title_html || (typeof window !== 'undefined' && (window as any).__INITIAL_SITE_TITLE_HTML__) || '<span class="text-blue-600">수행 일정공유</span>'
                    }}
                  />
                  <span className="hidden xs:inline text-gray-900"> 수행평가 공유 플랫폼</span>
                </Link>

                {/* 모바일용: 제목 오른쪽에 초록색 '교사용' 버튼 (제목과 적당한 간격 확보) */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="sm:hidden h-8 px-2 font-bold text-xs text-emerald-700 hover:bg-emerald-50/80 hover:text-emerald-800 flex items-center gap-1 rounded-lg border-none shadow-none cursor-pointer select-none ml-2.5"
                  onClick={handleGoToTeacher}
                >
                  <span className="leading-none">교사용</span>
                  <ArrowRight className="h-3.5 w-3.5 stroke-[2.2] text-emerald-600 shrink-0" />
                </Button>
              </div>
            )}

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* PC Only Desktop Shortcut Button */}
              <Button
                variant={isTeacherPage ? "ghost" : "outline"}
                size="sm"
                className={`hidden md:inline-flex h-9 rounded-full px-3 font-semibold text-xs ${
                  isTeacherPage
                    ? "border-none shadow-none rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 font-medium"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                }`}
                onClick={() => {
                  downloadDesktopShortcut("성지수행_시간표_수행평가");
                  toast.success("바탕화면 바로가기(.url) 파일이 다운로드되었습니다. 다운로드된 파일을 바탕화면으로 옮겨서 사용하세요.");
                }}
                title="PC 바탕화면에 바로가기 파일 다운로드"
              >
                <Download className={`h-3.5 w-3.5 mr-1.5 ${isTeacherPage ? "text-gray-500" : "text-blue-600"}`} />
                바탕화면에 바로가기 추가
              </Button>

              {/* PC 전용 희미한 칸막이 */}
              {isTeacherPage && (
                <div className="hidden sm:block h-3.5 w-[1px] bg-gray-200 mx-0.5" />
              )}

              {/* Mobile-only Bug Report Button */}
              {isBugReportEnabled && (
                <>
                  <Button
                    variant={isTeacherPage ? "ghost" : "default"}
                    size="sm"
                    className={`sm:hidden h-9 px-2.5 font-bold text-xs ${
                      isTeacherPage
                        ? "border-none shadow-none rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 font-medium"
                        : "rounded-full bg-red-500 hover:bg-red-600 text-white"
                    }`}
                    onClick={() => setShowBugReportDialog(true)}
                  >
                    <AlertTriangle className={`h-4 w-4 mr-1 ${isTeacherPage ? "text-gray-500" : ""}`} />
                    오류신고
                  </Button>

                  {/* 모바일 전용 희미한 칸막이 */}
                  {isTeacherPage && (
                    <div className="sm:hidden h-3.5 w-[1px] bg-gray-200 mx-0.5" />
                  )}
                </>
              )}

              {/* 알림 벨 버튼 — 비활성화시 짙은 회색(가독성 우수), 활성화시 노란색 */}
              <div className="relative" ref={notificationRef}>
                <Button
                  id="notification-bell-btn"
                  variant={isTeacherPage ? "ghost" : "default"}
                  size="icon"
                  className={`relative h-9 w-9 transition-all duration-200 cursor-pointer ${
                    isTeacherPage
                      ? isNotifSubscribed
                        ? "border border-yellow-300/80 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 shadow-xs"
                        : "border border-slate-300/80 rounded-lg bg-slate-200/90 hover:bg-slate-300 text-slate-700"
                      : isNotifSubscribed
                        ? "rounded-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 shadow-sm border border-yellow-300/80"
                        : "rounded-full bg-slate-200/90 hover:bg-slate-300 text-slate-700 shadow-sm border border-slate-300/80"
                  }`}
                  onClick={() => {
                    setShowNotifications(prev => !prev);
                    markAllClientRead();
                    markAllReadMutation.mutate();
                  }}
                  aria-label="알림"
                >
                  <Bell className={`h-4 w-4 ${!isNotifSubscribed ? "text-slate-700 stroke-[2.2]" : "text-gray-900 stroke-[2.2]"}`} />
                  {/* 읽지 않은 알림 뱃지 */}
                  {unreadNotificationCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[17px] h-[17px] px-[4px] text-[9px] font-bold leading-none text-white bg-red-500 rounded-full shadow-xs ring-2 ring-white"
                    >
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                </Button>

                {/* 알림 드롭다운 패널 */}
                {showNotifications && (
                  <div className="absolute right-0 top-11 z-50 w-[300px] sm:w-[320px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                    {/* 패널 헤더 */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-gray-700" />
                        <span className="font-bold text-sm text-gray-800">알림</span>
                        {unreadNotificationCount > 0 && (
                          <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                            {unreadNotificationCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {unreadNotificationCount > 0 && (
                          <button
                            className="text-[11px] text-blue-500 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                            onClick={() => {
                              markAllClientRead();
                              markAllReadMutation.mutate();
                            }}
                          >
                            모두 읽음
                          </button>
                        )}
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
                          onClick={() => setShowNotifications(false)}
                          aria-label="알림 닫기"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 수행 알림받기 토글 카드 */}
                    <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-100/80 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                          isNotifSubscribed ? "bg-amber-400 text-gray-900" : "bg-slate-200 text-slate-700"
                        }`}>
                          <Bell className={`w-4 h-4 ${!isNotifSubscribed ? "text-slate-700 stroke-[2.2]" : "text-gray-900 stroke-[2.2]"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                            수행 알림받기
                            {isNotifSubscribed && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700 font-semibold">ON</span>
                            )}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">
                            {isNotifSubscribed 
                              ? (isTeacherPage ? '교사용 공지 및 수행 수신 중' : '수행평가 및 주요 공지 수신 중')
                              : '스위치를 켜면 새 알림을 받습니다'}
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={isNotifSubscribed}
                        disabled={isTogglingNotif}
                        onCheckedChange={handleToggleNotification}
                        aria-label="수행 알림받기"
                      />
                    </div>

                    {/* 알림 목록 */}
                    <div className="max-h-[320px] sm:max-h-[380px] overflow-y-auto overscroll-contain touch-pan-y">
                      {notificationItems.length === 0 ? (
                        /* 빈 상태 */
                        <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
                          <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                            <Bell className="h-5 w-5 text-gray-300" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-gray-400">아직 알림이 없어요</p>
                            <p className="text-xs text-gray-300 mt-1">새로운 알림이 오면 여기에 표시됩니다</p>
                          </div>
                        </div>
                      ) : (
                        /* 알림 아이템 목록 */
                        <div className="divide-y divide-gray-50">
                          {notificationItems.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => markSingleRead(notif.id)}
                              className={`flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors ${
                                !notif.read ? 'bg-blue-50/50' : ''
                              }`}
                            >
                              <div
                                className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                                  !notif.read ? 'bg-blue-500' : 'bg-gray-200'
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                  {notif.category === 'test' ? (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 font-semibold">테스트</span>
                                  ) : notif.category === 'notice' ? (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold">공지</span>
                                  ) : notif.category === 'timetable' ? (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 font-semibold">시간표</span>
                                  ) : notif.category === 'urgent' ? (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-semibold">긴급</span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-semibold">수행</span>
                                  )}
                                  {notif.deliveryType === 'push' && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium">푸시</span>
                                  )}
                                  {notif.deliveryType === 'app' && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">앱전용</span>
                                  )}
                                  <p className="text-xs font-bold text-gray-800 truncate">{notif.title}</p>
                                </div>
                                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1 font-medium">
                                  {notif.createdAt ? new Date(notif.createdAt.replace(' ', 'T') + (notif.createdAt.endsWith('Z') ? '' : 'Z')).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 패널 푸터 */}
                    <div className="border-t border-gray-100 px-4 py-2 bg-gray-50/60">
                      <p className="text-[11px] text-center text-gray-400">🔔 수행평가 알림 및 공지사항 수신함</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bug Report Dialog */}
      <Dialog open={showBugReportDialog} onOpenChange={setShowBugReportDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>오류신고</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">
              발견한 오류나 문제점을 설명해 주세요.
            </p>
            <Textarea
              placeholder="예) 시간표에서 3교시 과목명이 잘못 표시됩니다."
              value={bugReportMessage}
              onChange={(e) => setBugReportMessage(e.target.value)}
              rows={4}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBugReportDialog(false)}>
                취소
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={handleBugReportSubmit}
                disabled={isBugReportSending || !bugReportMessage.trim()}
              >
                {isBugReportSending ? '전송 중...' : '신고 전송'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
