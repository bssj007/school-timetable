/**
 * browserDetect.ts
 * ── 브라우저 감지 단일 진실원천 ──────────────────────────────────────────────
 * 기준: 관리페이지 > 기타 > 미해결 문제 > InstallButtonSettings
 *
 * 우선순위:
 *   1. SamsungBrowser UA → "samsung"
 *   2. Safari UA (Chrome 아님) → "safari"   (iOS Safari, macOS Safari, iOS Chrome=CriOS 포함)
 *   3. Chrome UA → "chrome"
 *   4. 나머지 → "other"
 */

export type BrowserKey = "samsung" | "safari" | "chrome" | "other";

/** 브라우저 종류 감지 */
export function detectBrowser(): BrowserKey {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "safari";
  if (/Chrome/i.test(ua)) return "chrome";
  return "other";
}

/** 인앱브라우저 여부 (카카오톡, 네이버앱, 인스타그램 등) */
export function isInAppBrowserUA(): boolean {
  if (typeof window === "undefined") return false;
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent);
}

/**
 * iOS / Safari 버전 감지
 * iOS 26+부터 Apple이 UA의 OS 버전을 동결(freeze) → "CPU iPhone OS 18_x" 처럼 표시
 * 대신 "Version/26.x" 헤더는 실제 버전 → 두 값 중 큰 것을 사용
 */
export function detectIOSVersion(): number {
  if (typeof window === "undefined") return 0;
  const ua = navigator.userAgent;
  const osVer = parseInt(/os (\d+)/i.exec(ua.toLowerCase())?.[1] ?? "0", 10);
  const safVer = parseInt(/version\/(\d+)/i.exec(ua)?.[1] ?? "0", 10);
  return Math.max(osVer, safVer);
}

/** PWA 설치 완료 여부 (standalone 모드 또는 쿠키) */
export function isPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    document.cookie.includes("pwa_standalone=1")
  );
}

/**
 * 다운로드 유도 페이지(/download) 표시 여부
 * Samsung / Safari / Other 브라우저 + 미설치 + 미dismiss인 경우 true
 */
export function shouldShowDownloadPage(): boolean {
  if (typeof window === "undefined") return false;
  const b = detectBrowser();
  const isDismissed =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("download_page_dismissed") === "1";
  return (
    !isInAppBrowserUA() &&
    !isPwaInstalled() &&
    !isDismissed &&
    (b === "samsung" || b === "safari" || b === "other")
  );
}

// ── 모듈 레벨 편의 상수 (한 번만 계산) ────────────────────────────────────────
export const browserKey: BrowserKey =
  typeof window !== "undefined" ? detectBrowser() : "other";

export const isSamsungBrowser = browserKey === "samsung";
/** iOS Safari / macOS Safari / iOS Chrome(CriOS) */
export const isIOSSafari      = browserKey === "safari";
export const isChromeBrowser  = browserKey === "chrome";
export const isOtherBrowser   = browserKey === "other";
export const isInAppBrowser   = isInAppBrowserUA();

// ── 기기 종류 감지 ────────────────────────────────────────────────────────────
// iPad: 현대 iPad는 UA에 Macintosh가 표시되므로 maxTouchPoints로 구분
// 참고: navigator.platform은 deprecated; maxTouchPoints가 표준 방법
export function detectIsIPad(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  // 구형 iPad: UA에 "iPad" 포함
  if (/iPad/i.test(ua)) return true;
  // 신형 iPad (iPadOS 13+): UA가 Macintosh로 표시되지만 터치포인트 > 1
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function detectIsIPhone(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPod/.test(navigator.userAgent) && !detectIsIPad();
}

export const isIPad   = detectIsIPad();
export const isIPhone = detectIsIPhone();
