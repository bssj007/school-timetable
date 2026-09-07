/**
 * uaDetect.ts — 서버 전용 UA 파싱 모듈
 * ─────────────────────────────────────────────────────────────────────────────
 * 클라이언트 browserDetect.ts 의 Layer 2 (UA 문자열 파싱) 로직을 Node.js 환경에서
 * 동일하게 재현한다. window / navigator 가 없는 서버 환경에서 동작하도록 설계됨.
 *
 * 반환 타입 UAProfile 은 access_logs / ip_profiles 테이블에 직접 저장된다.
 */

export type ServerBrowserKey = "samsung" | "safari" | "chrome" | "firefox" | "other";
export type ServerDeviceType = "mobile" | "tablet" | "desktop";
export type ServerOS = "ios" | "android" | "windows" | "macos" | "linux" | null;

export interface UAProfile {
  /** 디바이스 종류: mobile / tablet / desktop */
  deviceType: ServerDeviceType;
  /** 브라우저 분류 */
  browserKey: ServerBrowserKey;
  /** 모바일 여부 */
  isMobile: boolean;
  /** OS */
  os: ServerOS;
  /** 인앱브라우저 여부 */
  isInApp: boolean;
}

/**
 * parseUA(userAgent) — UA 문자열에서 기기/브라우저/OS 정보를 추출한다.
 * 빈 문자열이나 null 이 들어오면 unknown 값을 반환한다.
 */
export function parseUA(ua: string | null | undefined): UAProfile {
  const str = (ua || "").trim();

  if (!str) {
    return {
      deviceType: "desktop",
      browserKey: "other",
      isMobile: false,
      os: null,
      isInApp: false,
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

  // 모바일 = 폰 / 태블릿 = iPad 또는 Android 태블릿
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

  // ── 브라우저 판별 (클라이언트 browserDetect.ts Layer 2 와 동일한 우선순위) ──
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
  } else if (/CriOS|GSA\//i.test(str)) {
    // iOS Chrome / Google 앱
    browserKey = "chrome";
  } else if (isIOS) {
    if (/Safari/i.test(str) && !/Chrome/i.test(str)) {
      browserKey = "safari";
    } else {
      browserKey = "other";
    }
  } else if (/Chrome/i.test(str) || /GSA\//i.test(str)) {
    browserKey = "chrome";
  } else if (/Safari/i.test(str) && !/Chrome/i.test(str)) {
    browserKey = "safari";
  }

  return { deviceType, browserKey, isMobile, os, isInApp };
}
