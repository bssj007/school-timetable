import { useState } from "react";
import { Link } from "wouter";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function Navigation() {
  const { kakaoUser, refreshKakaoUser, grade, classNum, studentNumber } = useUserConfig();
  const [showBugReportDialog, setShowBugReportDialog] = useState(false);
  const [bugReportMessage, setBugReportMessage] = useState('');
  const [isBugReportSending, setIsBugReportSending] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/kakao/logout');
      await refreshKakaoUser();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const { data: settings } = useQuery({
    queryKey: ['publicSettings'],
    queryFn: async () => {
      const res = await fetch('/api/settings/public');
      if (!res.ok) return { kakao_login_restricted: false };
      return res.json();
    }
  });

  const isKakaoRestricted = Boolean(settings?.kakao_login_restricted && !settings?.is_whitelisted);
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
              {(settings?.site_title_html || (typeof window !== 'undefined' && (window as any).__INITIAL_SITE_TITLE_HTML__)) ? (
                <span dangerouslySetInnerHTML={{ __html: settings?.site_title_html || (window as any).__INITIAL_SITE_TITLE_HTML__ }} />
              ) : (
                <span className="text-blue-600">수행 일정공유</span>
              )}
              <span className="hidden xs:inline text-gray-900"> 수행평가 공유 플랫폼</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
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

              {kakaoUser ? (
                <div className="flex items-center gap-2 sm:gap-3 bg-gray-50 pr-1 pl-3 py-1 rounded-full border border-gray-100">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-[10px] text-gray-400 font-medium leading-none mb-1">카카오 연동됨</span>
                    <span className="text-sm font-bold text-gray-800 leading-none">{kakaoUser.nickname}</span>
                  </div>
                  <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                    <AvatarImage src={kakaoUser.thumbnailImage} alt={kakaoUser.nickname} />
                    <AvatarFallback className="bg-blue-100 text-blue-600 text-xs font-bold">
                      {kakaoUser.nickname ? kakaoUser.nickname.substring(0, 1) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                    onClick={handleLogout}
                    title="로그아웃"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={isKakaoRestricted}
                  className={`h-9 rounded-full px-4 font-bold text-xs ${isKakaoRestricted ? 'bg-gray-200 text-gray-500 opacity-70 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'}`}
                  onClick={() => {
                    if (!isKakaoRestricted) {
                      window.location.href = '/api/kakao/login';
                    }
                  }}
                >
                  {isKakaoRestricted ? (
                    "개발 중"
                  ) : (
                    <>
                      <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.369 5.961-.202.942-.731 3.421-.806 3.755-.005.022.022.043.041.031.144-.085 3.395-2.227 4.708-3.132.551.047 1.114.072 1.688.072 4.97 0 9-3.185 9-7.115S16.97 3 12 3z" />
                      </svg>
                      카카오 연동
                    </>
                  )}
                </Button>
              )}

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
