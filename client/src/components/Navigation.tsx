import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, Bell, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
  const { grade, classNum, studentNumber } = useUserConfig();
  const [showBugReportDialog, setShowBugReportDialog] = useState(false);
  const [bugReportMessage, setBugReportMessage] = useState('');
  const [isBugReportSending, setIsBugReportSending] = useState(false);

  // ── 알림 프레임워크 ──────────────────────────────────────────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // TODO: 실제 알림 API 연동 시 이 배열을 서버 데이터로 교체
  const notificationItems: Array<{
    id: number;
    title: string;
    message: string;
    time: string;
    read: boolean;
    type: 'info' | 'assessment' | 'system';
  }> = [];
  const unreadNotificationCount = notificationItems.filter(n => !n.read).length;

  useEffect(() => {
    if (!showNotifications) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <span
                dangerouslySetInnerHTML={{
                  __html: settings?.site_title_html || (typeof window !== 'undefined' && (window as any).__INITIAL_SITE_TITLE_HTML__) || '<span class="text-blue-600">수행 일정공유</span>'
                }}
              />
              <span className="hidden xs:inline text-gray-900"> 수행평가 공유 플랫폼</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* PC Only Desktop Shortcut Button */}
              <Button
                variant="outline"
                size="sm"
                className="hidden md:inline-flex h-9 rounded-full px-3 font-semibold text-xs border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                onClick={() => {
                  downloadDesktopShortcut("성지수행_시간표_수행평가");
                  toast.success("바탕화면 바로가기(.url) 파일이 다운로드되었습니다. 다운로드된 파일을 바탕화면으로 옮겨서 사용하세요.");
                }}
                title="PC 바탕화면에 바로가기 파일 다운로드"
              >
                <Download className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                바탕화면에 바로가기 추가
              </Button>

              {/* Mobile-only Bug Report Button */}
              {isBugReportEnabled && (
                <Button
                  variant="default"
                  size="sm"
                  className="md:hidden h-9 rounded-full px-3 font-bold text-xs bg-red-500 hover:bg-red-600 text-white"
                  onClick={() => setShowBugReportDialog(true)}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  오류신고
                </Button>
              )}

              {/* 알림 벨 버튼 — 카카오톡 버튼과 동일한 yellow 색상 */}
              <div className="relative" ref={notificationRef}>
                <Button
                  id="notification-bell-btn"
                  variant="default"
                  size="icon"
                  className="relative h-9 w-9 rounded-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 shadow-sm transition-all duration-200"
                  onClick={() => setShowNotifications(prev => !prev)}
                  aria-label="알림"
                >
                  <Bell className="h-4 w-4" />
                  {/* 읽지 않은 알림 뱃지 */}
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-[5px] text-[10px] font-bold leading-none text-white bg-red-500 rounded-full shadow ring-2 ring-white">
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
                            className="text-[11px] text-blue-500 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                            onClick={() => { /* TODO: 모두 읽음 API */ }}
                          >
                            모두 읽음
                          </button>
                        )}
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                          onClick={() => setShowNotifications(false)}
                          aria-label="알림 닫기"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 알림 목록 */}
                    <div className="max-h-[340px] overflow-y-auto">
                      {notificationItems.length === 0 ? (
                        /* 빈 상태 */
                        <div className="flex flex-col items-center justify-center py-12 px-4 gap-3">
                          <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                            <Bell className="h-6 w-6 text-gray-300" />
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
                                <p className="text-sm font-semibold text-gray-800">{notif.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                <p className="text-[11px] text-gray-400 mt-1.5 font-medium">{notif.time}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 패널 푸터 */}
                    <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/60">
                      <p className="text-[11px] text-center text-gray-400">알림 기능은 준비 중입니다</p>
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
