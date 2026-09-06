import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { agent, shouldShowDownloadPage } from "@/lib/browserDetect";

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

export default function AppDownloadPage() {
  const [, setLocation] = useLocation();
  const [settings, setSettings] = useState<any>(null);
  // browserDetect 통일 기준 사용
  const browserType = agent.browserKey;

  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setSettings(s))
      .catch(() => {});
  }, []);

  // Chrome이거나 이미 설치됨 → 메인으로
  useEffect(() => {
    if (browserType === "chrome" || isDesktop) { setLocation("/"); return; }
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (isStandalone || document.cookie.includes("pwa_standalone=1")) setLocation("/");
  }, []);

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

    // Safari (iOS / macOS Safari / iOS Chrome)
    if (browserType === "safari" && settings?.safari_install_button_visible !== false) {
      return appStoreUrl ? (
        <a href={appStoreUrl} target="_blank" rel="noreferrer"
          className="w-full h-14 bg-black text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 no-underline active:opacity-80 shadow-lg">
          <AppleLogo />
          <span>App Store에서 다운로드</span>
        </a>
      ) : (
        <button onClick={() => setLocation("/ios-install-guide")}
          className="w-full h-14 bg-black text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 active:opacity-80 shadow-lg">
          <AppleLogo />
          <span>홈 화면에 추가하기</span>
        </button>
      );
    }

    // Samsung Browser
    if (browserType === "samsung" && settings?.samsung_install_button_visible !== false && playStoreUrl) {
      return (
        <a href={playStoreUrl} target="_blank" rel="noreferrer"
          className="w-full h-14 bg-[#01875f] text-white font-bold text-base rounded-2xl flex items-center justify-center gap-3 no-underline active:opacity-80 shadow-lg">
          <PlayStoreLogo />
          <span>Google Play에서 다운로드</span>
        </a>
      );
    }

    // 기타 브라우저
    if (browserType === "other" && settings?.other_install_button_visible !== false && playStoreUrl) {
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

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
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
    </div>
  );
}
