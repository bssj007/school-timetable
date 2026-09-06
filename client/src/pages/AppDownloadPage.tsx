import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { agent, shouldShowDownloadPage } from "@/lib/browserDetect";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserConfig } from "@/contexts/UserConfigContext";

// ── detect() 결과 직접 참조 ──────────────────────────────────────────────────
const isInAppBrowser  = agent.isInAppBrowser;
const isKakaoTalk      = agent.isKakaoTalk;
const isSamsungBrowser = agent.browserKey === "samsung";
const isIOSSafari     = agent.browserKey === "safari";
const isOtherBrowser  = agent.browserKey === "other";
const isDesktop       = agent.isDesktop;
const { iosVersion, isIOS26Plus, isIOS15Plus } = agent;

// URL 보정 (프로토콜 없는 경우 https:// 자동 추가)
function normalizeUrl(url: string): string {
  if (url && !/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

// 다운로드 유도 페이지 표시 여부 — browserDetect로 통일
export { shouldShowDownloadPage };

function PlayStoreLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <path d="M3.18 23.76c.33.18.7.2 1.04.08L14.76 12 4.22.16A1.25 1.25 0 0 0 3.18.4C2.6.74 2.25 1.35 2.25 2v20c0 .65.35 1.26.93 1.76Z" fill="#EA4335"/>
      <path d="M21.25 10.3 17.98 8.5l-3.69 3.5 3.69 3.5 3.27-1.8c.93-.51.93-1.89 0-2.4Z" fill="#FBBC04"/>
      <path d="m14.76 12-10.54 11.6c.17.06.35.1.54.1.21 0 .43-.06.62-.18l11.6-6.52L14.76 12Z" fill="#34A853"/>
      <path d="M4.22.16 14.76 12l2.42-2.58L5.58.34C5.39.22 5.18.16 4.96.16c-.2 0-.4.04-.57.1l-.17-.1Z" fill="#4285F4"/>
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.77M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
    </svg>
  );
}

function AndroidLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0004.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.4158.4158 0 0 0-.1516-.5668.4144.4144 0 0 0-.5665.1517L17.11 8.9959a11.9701 11.9701 0 0 0-5.1102-1.1448c-1.8028 0-3.5134.4074-5.1106 1.1448L4.8385 5.4471A.4147.4147 0 0 0 4.272 5.2954a.4159.4159 0 0 0-.1516.5668l1.9972 3.4594C2.6224 11.2335.3418 14.8872.036 19.112h23.928c-.3058-4.2248-2.5864-7.8785-6.0825-9.7906" />
    </svg>
  );
}

export default function AppDownloadPage() {
  const [, setLocation] = useLocation();
  const [settings, setSettings] = useState<any>(null);
  // browserDetect 통일 기준 사용
  const browserType = agent.browserKey;

  const { grade, classNum, studentNumber, studentName, publicSettings } = useUserConfig();
  const [showBugReportDialog, setShowBugReportDialog] = useState(false);
  const [bugReportMessage, setBugReportMessage] = useState("");
  const [isBugReportSending, setIsBugReportSending] = useState(false);

  const activeSettings = settings || publicSettings;
  const isBugReportEnabled =
    activeSettings?.bug_report_enabled !== false &&
    activeSettings?.bug_report_enabled !== "false";

  const handleBugReportSubmit = async () => {
    if (!bugReportMessage.trim()) return;
    setIsBugReportSending(true);
    try {
      const deviceTag = `[다운로드 페이지 | ${browserType.toUpperCase()} | ${agent.isIOS ? 'iOS' : agent.isAndroid ? 'Android' : '기타'}]`;
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${deviceTag} ${bugReportMessage.trim()}`,
          grade: grade ? parseInt(grade) : null,
          classNum: classNum ? parseInt(classNum) : null,
          studentNumber: studentNumber ? parseInt(studentNumber) : null,
          studentName: studentName || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("오류신고가 접수되었습니다.");
      setBugReportMessage("");
      setShowBugReportDialog(false);
    } catch {
      toast.error("오류신고 전송에 실패했습니다.");
    } finally {
      setIsBugReportSending(false);
    }
  };

  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setSettings(s))
      .catch(() => {});
  }, []);

  const handlePwaInstall = async () => {
    const promptEvent = (window as any).__deferredPwaPrompt;
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") {
          (window as any).__deferredPwaPrompt = null;
        }
      } catch { }
    }
    localStorage.setItem("download_page_dismissed", "1");
    setLocation("/");
  };

  // Desktop 또는 이미 설치됨, 또는 다운로드 액션 미지원/비활성화 시 → 메인으로 직행
  useEffect(() => {
    if (isDesktop || agent.isInstalledApp) { setLocation("/"); return; }
    if (!settings) return;
    // 카카오톡 브라우저별 유효성 검사
    if (agent.isKakaoTalk) {
      if (agent.isAndroid) {
        if (!settings.play_store_url || settings.other_install_button_visible === false) {
          setLocation("/");
          return;
        }
      } else if (agent.isIOS) {
        if (!settings.app_store_url || settings.other_install_button_visible === false) {
          setLocation("/");
          return;
        }
      } else {
        setLocation("/");
        return;
      }
      return;
    }

    // 그 외 일반 인앱 브라우저는 메인으로 직행
    if (agent.isInAppBrowser) {
      setLocation("/");
      return;
    }

    // Android 브라우저별 유효성 검사
    if (agent.isAndroid) {
      if (browserType === "chrome") {
        if (settings.chrome_install_button_visible === false) {
          setLocation("/");
          return;
        }
      } else {
        const isSamsung = browserType === "samsung";
        const isHidden = isSamsung ? settings.samsung_install_button_visible === false : settings.other_install_button_visible === false;
        if (!settings.play_store_url || isHidden) {
          setLocation("/");
          return;
        }
      }
    }

    // iOS 브라우저별 유효성 검사
    if (agent.isIOS) {
      if (settings.app_store_url) {
        const isHidden = agent.isIOSSafari
          ? settings.safari_install_button_visible === false
          : browserType === "chrome"
            ? settings.chrome_install_button_visible === false
            : settings.other_install_button_visible === false;
        if (isHidden) {
          setLocation("/");
          return;
        }
      } else {
        if (agent.isIOSSafari) {
          if (settings.safari_install_button_visible === false) {
            setLocation("/");
            return;
          }
        } else if (browserType === "chrome") {
          if (settings.chrome_install_button_visible === false) {
            setLocation("/");
            return;
          }
        } else {
          // iOS 기타 브라우저(Firefox, Edge, Opera, Whale 등)는 앱스토어 링크 미등록 시 사이트로 직행
          setLocation("/");
          return;
        }
      }
    }
  }, [settings]);

  function handleContinue() {
    localStorage.setItem("download_page_dismissed", "1");
    setLocation("/");
  }

  const appTitle    = settings?.pwa_app_title || "앱";
  const appIconUrl  = settings?.pwa_app_icon_url || settings?.site_favicon_url || "/icon.svg";
  const playStoreUrl = normalizeUrl(settings?.play_store_url || "");
  const appStoreUrl  = normalizeUrl(settings?.app_store_url  || "");
  const pwaBtnVisible = settings?.pwa_install_button_visible !== false;

  function DownloadButton() {
    if (!settings || !pwaBtnVisible) return null;

    // 1. iOS 환경
    if (agent.isIOS) {
      // 1-1. 앱스토어 링크가 등록되어 있으면 iOS의 모든 브라우저에서 App Store 다운로드 버튼 표시
      if (appStoreUrl && settings?.app_store_url) {
        return (
          <a href={appStoreUrl} target="_blank" rel="noreferrer"
            className="w-full h-14 bg-black text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 no-underline active:opacity-80 shadow-lg">
            <AppleLogo />
            <span>App Store에서 다운로드</span>
          </a>
        );
      }
      // 카카오톡 iOS는 앱스토어 링크 미등록 시 버튼 미표시
      if (agent.isKakaoTalk) return null;

      // 1-2. Safari인 경우 Safari 전용 PWA 가이드 버튼 표시
      if (agent.isIOSSafari && settings?.safari_install_button_visible !== false) {
        return (
          <button onClick={() => setLocation("/ios-install-guide")}
            className="w-full h-14 bg-black text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 active:opacity-80 shadow-lg">
            <AppleLogo />
            <span>홈 화면에 추가하기</span>
          </button>
        );
      }
      // 1-3. iOS Chrome인 경우 Chrome 전용 PWA 가이드 버튼 표시
      if (browserType === "chrome" && settings?.chrome_install_button_visible !== false) {
        return (
          <button onClick={() => setLocation("/ios-chrome-install-guide")}
            className="w-full h-14 bg-black text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 active:opacity-80 shadow-lg transition-transform active:scale-95">
            <AppleLogo />
            <span>홈 화면에 추가하기</span>
          </button>
        );
      }
      return null;
    }

    // 2. Android 환경
    if (agent.isAndroid) {
      // 2-1. 카카오톡 Android: Play Store 링크가 등록되어 있을 때만 버튼 표시
      if (agent.isKakaoTalk) {
        if (playStoreUrl && settings?.play_store_url && settings?.other_install_button_visible !== false) {
          return (
            <a href={playStoreUrl} target="_blank" rel="noreferrer"
              className="w-full h-14 bg-[#01875f] text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 no-underline active:opacity-80 shadow-lg">
              <PlayStoreLogo />
              <span>Google Play에서 다운로드</span>
            </a>
          );
        }
        return null;
      }

      // 2-2. Chrome / Google 브라우저인 경우: 항상 PWA 설치 버튼 표시
      if (browserType === "chrome") {
        if (settings?.chrome_install_button_visible === false) return null;
        return (
          <button onClick={handlePwaInstall}
            className="w-full h-14 bg-[#3DDC84] text-black font-bold text-base rounded-2xl flex items-center justify-center gap-3 active:opacity-80 shadow-lg transition-transform active:scale-95">
            <AndroidLogo />
            <span>{appTitle} 앱 다운로드</span>
          </button>
        );
      }

      // 2-2. 그 외 모든 Android 브라우저: Play Store 링크가 등록되어 있을 때만 버튼 표시
      if (playStoreUrl && settings?.play_store_url) {
        const isSamsung = browserType === "samsung";
        const isHidden = isSamsung ? settings?.samsung_install_button_visible === false : settings?.other_install_button_visible === false;
        if (isHidden) return null;

        return (
          <a href={playStoreUrl} target="_blank" rel="noreferrer"
            className="w-full h-14 bg-[#01875f] text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 no-underline active:opacity-80 shadow-lg">
            <PlayStoreLogo />
            <span>Google Play에서 다운로드</span>
          </a>
        );
      }

      return null;
    }

    return null;
  }

  return (
    <div className="fixed inset-0 z-10 bg-white flex flex-col justify-between"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* 상단 유틸리티 바: 우측 오류신고 버튼 */}
      <div className="relative z-20 flex-shrink-0 flex items-center justify-between px-6 pt-4 min-h-[44px]">
        <div />
        {isBugReportEnabled && (
          <button
            type="button"
            onClick={() => setShowBugReportDialog(true)}
            style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 rounded-full transition-all active:scale-95 shadow-sm cursor-pointer select-none"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-white shrink-0" />
            <span>오류신고</span>
          </button>
        )}
      </div>

      {/* 로고 + 앱 이름 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
        <img src={appIconUrl} alt={appTitle}
          className="w-24 h-24 rounded-3xl shadow-xl object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = "/icon.svg"; }} />
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-tight">{appTitle}</h1>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">
            앱을 설치하면 더 빠르고 편리하게<br />이용할 수 있어요
          </p>
        </div>
      </div>

      {/* 다운로드 버튼 + 사이트로 계속 */}
      <div className="flex-shrink-0 px-6 pb-6 space-y-2">
        {!settings
          ? <div className="w-full h-14 bg-gray-100 rounded-2xl animate-pulse" />
          : <DownloadButton />
        }
        <button onClick={handleContinue}
          className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          사이트로 계속
        </button>
      </div>

      {/* 오류신고 다이얼로그 */}
      <Dialog open={showBugReportDialog} onOpenChange={setShowBugReportDialog}>
        <DialogContent className="sm:max-w-[425px] w-[90vw] rounded-2xl p-6 z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <span>오류신고</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-gray-500 leading-relaxed">
              앱 설치 또는 페이지 이용 중 발견하신 오류나 불편사항을 알려주시면 신속히 반영하겠습니다.
            </p>
            <Textarea
              placeholder="예) 앱 다운로드 버튼이 작동하지 않거나 화면이 올바르게 표시되지 않습니다."
              value={bugReportMessage}
              onChange={(e) => setBugReportMessage(e.target.value)}
              rows={4}
              className="resize-none text-sm rounded-xl focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowBugReportDialog(false)}
                className="rounded-xl text-sm"
              >
                취소
              </Button>
              <Button
                type="button"
                className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl text-sm font-bold shadow-sm"
                onClick={handleBugReportSubmit}
                disabled={isBugReportSending || !bugReportMessage.trim()}
              >
                {isBugReportSending ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>전송 중...</span>
                  </div>
                ) : (
                  '신고 전송'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
