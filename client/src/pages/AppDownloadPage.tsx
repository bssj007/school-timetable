import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { agent, shouldShowDownloadPage, checkIsInstalledApp } from "@/lib/browserDetect";
import { AlertTriangle, Loader2, Download, Check } from "lucide-react";
import { useIsPwaInstalled, openPwaApp } from "@/lib/pwaDetect";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { SafariLogo } from "@/components/SafariLogo";

// ── detect() 결과 직접 참조 ──────────────────────────────────────────────────
const isInAppBrowser  = agent.isInAppBrowser;
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
    <svg viewBox="0 0 28.99 31.99" className="w-6 h-6 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.54 15.28.12 29.34a3.66 3.66 0 0 0 5.33 2.16l15.1-8.6Z" fill="#EA4335" />
      <path d="m27.11 12.89-6.53-3.74-7.35 6.45 7.38 7.28 6.48-3.7a3.54 3.54 0 0 0 1.5-4.79 3.62 3.62 0 0 0-1.5-1.5z" fill="#FBBC04" />
      <path d="M.12 2.66a3.57 3.57 0 0 0-.12.92v24.84a3.57 3.57 0 0 0 .12.92L14 15.64Z" fill="#4285F4" />
      <path d="m13.64 16 6.94-6.85L5.5.51A3.73 3.73 0 0 0 3.63 0 3.64 3.64 0 0 0 .12 2.65Z" fill="#34A853" />
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
  const isIOSChrome = agent.isIOS && (agent.isIOSChrome || browserType === "chrome");
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    const urlToCopy = "성지수행.com";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = urlToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("사이트 주소(성지수행.com)가 복사되었습니다! Safari 주소창에 붙여넣어 주세요.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("주소 복사에 실패했습니다. 브라우저 주소창의 URL을 직접 복사해 주세요.");
    }
  };

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

  const [deferredPrompt, setDeferredPrompt] = useState<any>(() =>
    typeof window !== "undefined" ? (window as any).__deferredPwaPrompt : null
  );
  const [isPrompting, setIsPrompting] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).__deferredPwaPrompt) {
      setDeferredPrompt((window as any).__deferredPwaPrompt);
    }

    const handlePrompt = (e: any) => {
      e.preventDefault();
      (window as any).__deferredPwaPrompt = e;
      setDeferredPrompt(e);
    };

    const handleCustomPrompt = (e: CustomEvent) => {
      const evt = e.detail || (window as any).__deferredPwaPrompt;
      if (evt) setDeferredPrompt(evt);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("pwa-prompt-ready", handleCustomPrompt as EventListener);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("pwa-prompt-ready", handleCustomPrompt as EventListener);
    };
  }, []);

  const handlePwaInstall = async () => {
    if (isPrompting) return;
    setIsPrompting(true);

    let promptEvent = (window as any).__deferredPwaPrompt || deferredPrompt;

    // 만약 beforeinstallprompt 이벤트가 아직 수신되지 않은 경우, 최대 1.8초간 대기
    // (페이지 최초 진입 시 브라우저가 manifest/sw를 백그라운드 검증하는 데 수백ms~1초 소요됨)
    if (!promptEvent && typeof window !== "undefined") {
      promptEvent = await new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("pwa-prompt-ready", customHandler as EventListener);
            resolve(null);
          }
        }, 1800);

        const handler = (e: any) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            e.preventDefault();
            (window as any).__deferredPwaPrompt = e;
            setDeferredPrompt(e);
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("pwa-prompt-ready", customHandler as EventListener);
            resolve(e);
          }
        };

        const customHandler = (e: CustomEvent) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            const evt = e.detail || (window as any).__deferredPwaPrompt;
            if (evt) setDeferredPrompt(evt);
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("pwa-prompt-ready", customHandler as EventListener);
            resolve(evt);
          }
        };

        window.addEventListener("beforeinstallprompt", handler);
        window.addEventListener("pwa-prompt-ready", customHandler as EventListener);
      });
    }

    setIsPrompting(false);

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") {
          (window as any).__deferredPwaPrompt = null;
          setDeferredPrompt(null);
          localStorage.setItem("download_page_dismissed", "1");
          toast.success("앱 설치가 진행 중입니다. 홈 화면에서 앱을 확인해 주세요!");
          setTimeout(() => {
            setLocation("/");
          }, 1200);
          return;
        } else {
          toast.info("앱 설치가 취소되었습니다.");
          return;
        }
      } catch (err) {
        console.warn("PWA prompt error:", err);
      }
    }

    // 브라우저에서 beforeinstallprompt API를 지원하지 않거나(삼성/웨일 등), 이미 팝업이 닫힌 경우:
    // 절대로 사이트로 즉시 건너뛰지 않고 수동 설치 안내 팝업을 표시!
    setShowManualGuide(true);
  };

  // Desktop 또는 이미 설치된 앱(PWA/WebView)으로 접속한 경우에만 메인으로 즉시 직행 (무한 핑퐁 루프 방지)
  useEffect(() => {
    if (isDesktop || agent.isInstalledApp || checkIsInstalledApp()) {
      setLocation("/");
    }
  }, [isDesktop]);

  function handleContinue() {
    localStorage.setItem("download_page_dismissed", "1");
    setLocation("/");
  }

  const appTitle    = settings?.pwa_app_title || "앱";
  const appIconUrl  = settings?.pwa_app_icon_url || settings?.site_favicon_url || "/icon.svg";
  const playStoreUrl = normalizeUrl(settings?.play_store_url || "");
  const appStoreUrl  = normalizeUrl(settings?.app_store_url  || "");
  const pwaBtnVisible = settings?.pwa_install_button_visible !== false;
  const isPwaInstalled = useIsPwaInstalled();

  function DownloadButton() {
    if (!settings || !pwaBtnVisible) return null;

    // 1. iOS 환경
    if (agent.isIOS) {
      // 1-1. 앱스토어 링크가 등록되어 있으면 iOS의 모든 브라우저에서 App Store 다운로드 버튼 표시
      if (appStoreUrl && settings?.app_store_url) {
        const isHidden = agent.isIOSSafari
          ? settings?.safari_install_button_visible === false
          : browserType === "chrome"
            ? settings?.chrome_install_button_visible === false
            : settings?.other_install_button_visible === false;
        if (isHidden) return null;

        return (
          <a href={appStoreUrl} target="_blank" rel="noreferrer"
            className="w-full h-14 bg-black text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 no-underline active:opacity-80 shadow-lg">
            <AppleLogo />
            <span>App Store에서 다운로드</span>
          </a>
        );
      }

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
      // 2-1. Chrome / Google 브라우저인 경우: 항상 PWA 설치 버튼 표시
      if (browserType === "chrome") {
        if (settings?.chrome_install_button_visible === false) return null;
        return (
          <button
            onClick={isPwaInstalled ? () => openPwaApp("/?mode=pwa") : handlePwaInstall}
            disabled={isPrompting && !isPwaInstalled}
            className={`w-full h-14 ${isPwaInstalled ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-[#3DDC84] hover:bg-[#35c073] text-black'} font-bold text-base rounded-2xl flex items-center justify-center gap-3 active:opacity-80 shadow-lg transition-transform active:scale-95 disabled:opacity-80`}
          >
            {isPwaInstalled ? (
              <>
                <Check className="w-6 h-6 stroke-[3]" />
                <span>설치완료</span>
              </>
            ) : isPrompting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>앱 다운로드 준비 중...</span>
              </>
            ) : (
              <>
                <AndroidLogo />
                <span>{appTitle} 앱 다운로드</span>
              </>
            )}
          </button>
        );
      }

      // 2-2. 그 외 모든 Android 브라우저 (Samsung, 카카오 포함 기타 브라우저): Play Store 링크가 등록되어 있을 때만 버튼 표시
      if (playStoreUrl && settings?.play_store_url) {
        const isSamsung = browserType === "samsung";
        const isHidden = isSamsung ? settings?.samsung_install_button_visible === false : settings?.other_install_button_visible === false;
        if (isHidden) return null;

        return (
          <a href={playStoreUrl} target="_blank" rel="noreferrer"
            className="w-full h-14 bg-[#3DDC84] hover:bg-[#35c073] text-black font-bold text-base rounded-2xl flex items-center justify-center gap-3 no-underline active:opacity-80 shadow-lg transition-transform active:scale-95">
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

      {/* 로고 + 앱 이름 또는 iOS 크롬 무조건 Safari 안내 */}
      {isIOSChrome ? (
        /* iOS Chrome: Safari로 다시 열기 안내 (간소화) */
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center my-auto max-w-sm mx-auto w-full">
          {/* Safari 로고 (배지 제거) */}
          <div className="mb-6">
            <SafariLogo className="w-24 h-24 drop-shadow-xl transition-transform hover:scale-105 active:scale-95 duration-200" />
          </div>

          <h1 className="text-2xl font-black text-gray-900 leading-tight mb-2 tracking-tight">
            Safari로 다시 열어주세요
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed max-w-xs mx-auto mb-6 break-keep">
            기본 브라우저인 <strong className="text-blue-600 font-bold">Safari</strong>에서 열어주시면 바로 홈 화면에 앱을 추가하실 수 있습니다.
          </p>

          {/* 원클릭 주소 복사 버튼 */}
          <button
            type="button"
            onClick={handleCopyUrl}
            className="w-full max-w-xs h-14 bg-[#0071E3] hover:bg-[#0077ED] active:bg-[#005BB5] text-white font-bold text-base rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5 text-emerald-300 stroke-[2.5]" />
                <span>주소가 복사되었습니다!</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>사이트 주소 복사하기</span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* 기존 로고 + 앱 이름 */
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
      )}

      {/* 다운로드 버튼 + 사이트로 계속 */}
      <div className="flex-shrink-0 px-6 pb-6 space-y-2">
        {!isIOSChrome && (
          !settings
            ? <div className="w-full h-14 bg-gray-100 rounded-2xl animate-pulse" />
            : <DownloadButton />
        )}
        <button onClick={handleContinue}
          className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {isIOSChrome ? "Chrome에서 사이트로 계속 이용하기 →" : "사이트로 계속"}
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

      {/* PWA 수동 설치 / 홈 화면 추가 안내 다이얼로그 (beforeinstallprompt 미지원 또는 지연 시) */}
      <Dialog open={showManualGuide} onOpenChange={setShowManualGuide}>
        <DialogContent className="sm:max-w-[420px] w-[92vw] rounded-2xl p-6 z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Download className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{appTitle} 앱 설치 안내</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <p className="text-xs text-gray-600 leading-relaxed">
              현재 브라우저에서는 자동 설치 팝업이 바로 실행되지 않을 수 있습니다.<br />
              아래 순서대로 진행하시면 <strong>홈 화면에 앱으로 추가</strong>하여 편리하게 이용하실 수 있습니다.
            </p>

            <div className="space-y-2.5 text-xs text-gray-700">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                  1
                </span>
                <div>
                  <strong className="text-gray-900 font-semibold">브라우저 메뉴 열기</strong>
                  <p className="text-gray-500 mt-0.5">
                    화면 상단 또는 하단의 <strong>더보기 메뉴 (⋮ 또는 ≡)</strong>를 눌러주세요.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                  2
                </span>
                <div>
                  <strong className="text-gray-900 font-semibold">[앱 설치] 또는 [홈 화면에 추가] 터치</strong>
                  <p className="text-gray-500 mt-0.5">
                    메뉴 목록에서 <strong>'앱 설치'</strong> 또는 <strong>'홈 화면에 추가'</strong>를 누르시면 설치가 완료됩니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                className="w-full bg-[#3DDC84] hover:bg-[#35c073] text-black font-bold rounded-xl text-sm h-12 shadow-sm"
                onClick={() => {
                  setShowManualGuide(false);
                  toast.success("설치 후 홈 화면에서 앱 아이콘을 터치해 접속해주세요!");
                }}
              >
                확인했습니다
              </Button>
              <Button
                variant="ghost"
                type="button"
                className="w-full text-gray-400 hover:text-gray-600 text-xs py-2"
                onClick={() => {
                  setShowManualGuide(false);
                  localStorage.setItem("download_page_dismissed", "1");
                  setLocation("/");
                }}
              >
                설치하지 않고 사이트로 바로가기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
