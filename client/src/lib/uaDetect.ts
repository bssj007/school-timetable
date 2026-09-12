/**
 * client/src/lib/uaDetect.ts — 클라이언트 UA 파싱 유틸리티
 * ─────────────────────────────────────────────────────────────────────────────
 * User-Agent 문자열로부터 기기, 브라우저, OS, 인앱, WebView 여부를 판별합니다.
 * Admin 페이지 및 프로필 뷰어에서 서버 데이터의 누락 시 즉시 폴백으로 활용됩니다.
 */

export type ServerBrowserKey = "samsung" | "safari" | "chrome" | "firefox" | "other";
export type ServerDeviceType = "mobile" | "tablet" | "desktop";
export type ServerOS = "ios" | "android" | "windows" | "macos" | "linux" | null;

export interface UAProfile {
  deviceType: ServerDeviceType;
  browserKey: ServerBrowserKey;
  isMobile: boolean;
  os: ServerOS;
  isInApp: boolean;
  isApp: boolean;
}

export function parseUA(ua: string | null | undefined): UAProfile {
  const str = (ua || "").trim();

  if (!str) {
    return {
      deviceType: "desktop",
      browserKey: "other",
      isMobile: false,
      os: null,
      isInApp: false,
      isApp: false,
    };
  }

  // ── 인앱 브라우저 감지 ──────────────────────────────────────────────────────
  const isKakao = /KAKAOTALK/i.test(str);
  const isInApp = isKakao || /NAVER|Instagram|FBAN|FBAV|LINE/i.test(str);

  // ── 기기 판별 ───────────────────────────────────────────────────────────────
  const isIPad   = /iPad/i.test(str) || (/Macintosh/i.test(str) && /Mobile/i.test(str));
  const isIPhone = /iPhone|iPod/i.test(str) && !isIPad;
  const isIOS    = isIPad || isIPhone;
  const isAndroid = !isIOS && /Android/i.test(str);

  let deviceType: ServerDeviceType = "desktop";
  if (isIPhone || (isAndroid && /Mobile/i.test(str))) {
    deviceType = "mobile";
  } else if (isIPad || (isAndroid && !/Mobile/i.test(str))) {
    deviceType = "tablet";
  }
  const isMobile = deviceType !== "desktop";

  // ── OS 판별 ─────────────────────────────────────────────────────────────────
  let os: ServerOS = null;
  if (isIOS) {
    os = "ios";
  } else if (isAndroid) {
    os = "android";
  } else if (/Windows NT/i.test(str) && !/Mobile/i.test(str)) {
    os = "windows";
  } else if (/Macintosh/i.test(str) && !/Mobile/i.test(str)) {
    os = "macos";
  } else if (/Linux/i.test(str) && !/Android|Mobile/i.test(str)) {
    os = "linux";
  }

  // ── 정식 WebView 앱 판별 ────────────────────────────────────────────────────
  const isSeongjisuhaengApp = /SeongjisuhaengApp/i.test(str);
  const hasAndroidWvToken = !/GSA\//i.test(str) && (/;\s*wv[;)]/i.test(str) || /\bwv\b/i.test(str));
  // SamsungBrowser도 Version/xx Chrome/xx Mobile Safari/xx 패턴을 포함하므로 반드시 제외
  const isAndroidWebViewUA = !/GSA\//i.test(str) && !/SamsungBrowser/i.test(str) && /Version\/[0-9.]+/i.test(str) && /Chrome\/[0-9.]+/i.test(str) && /Mobile Safari\/[0-9.]+/i.test(str);
  const isIOSApp = isIOS && !/CriOS/i.test(str) && !/FxiOS/i.test(str) && !/Safari\//i.test(str);
  const isApp = !isInApp && (isSeongjisuhaengApp || hasAndroidWvToken || isAndroidWebViewUA || isIOSApp);

  // ── 브라우저 판별 ───────────────────────────────────────────────────────────
  let browserKey: ServerBrowserKey = "other";

  if (isKakao) {
    browserKey = "other";
  } else if (/SamsungBrowser/i.test(str)) {
    browserKey = "samsung";
  } else if (/OPR\/|Opera|OPT\//i.test(str)) {
    browserKey = "other";
  } else if (/EdgA?\/|EdgiOS|Edge\//i.test(str)) {
    browserKey = "other";
  } else if (/Whale\//i.test(str)) {
    browserKey = "other";
  } else if (/Firefox|FxiOS/i.test(str)) {
    browserKey = "firefox";
  } else if (/DuckDuckGo\//i.test(str)) {
    browserKey = "other";
  } else if (/Brave\//i.test(str)) {
    browserKey = "other";
  } else if (/CriOS/i.test(str)) {
    browserKey = "chrome";
  } else if (isIOS) {
    if (/Safari/i.test(str) && !/Chrome/i.test(str)) {
      browserKey = "safari";
    } else {
      browserKey = "other";
    }
  } else if (/Chrome/i.test(str)) {
    browserKey = "chrome";
  } else if (/Safari/i.test(str)) {
    browserKey = "safari";
  }

  return { deviceType, browserKey, isMobile, os, isInApp, isApp };
}
