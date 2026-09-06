/**
 * browserDetect.ts
 * ── 브라우저/기기 감지 단일 진실원천 ─────────────────────────────────────────
 * 기준: 관리페이지 > 기타 > 미해결 문제 > InstallButtonSettings
 *
 * 브라우저 우선순위:
 *   1. SamsungBrowser UA → "samsung"
 *   2. Safari UA (Chrome 아님) → "safari"  (iOS/iPadOS/macOS Safari, iOS CriOS 포함)
 *   3. Chrome UA → "chrome"
 *   4. 나머지 → "other"
 *
 * 플랫폼 매트릭스 (모바일 전용 다운로드 버튼 기준):
 *   iOS Safari         → safari  + isMobileDevice → ✅ 다운로드 버튼 표시
 *   iPadOS Safari      → safari  + isMobileDevice → ✅ 다운로드 버튼 표시
 *   macOS Safari       → safari  + isDesktop      → ❌ 다운로드 버튼 숨김
 *   Android Chrome     → chrome                   → ✅ PWA 버튼 표시 (Chrome 전용)
 *   Windows Chrome     → chrome                   → ✅ PWA 버튼 표시 (Chrome 전용)
 *   ChromeOS Chrome    → chrome                   → ✅ PWA 버튼 표시 (Chrome 전용)
 *   Android Samsung    → samsung + isMobileDevice → ✅ Play Store 버튼
 *   Android Firefox    → other   + isMobileDevice → ✅ Play Store 버튼
 *   Windows Firefox    → other   + isDesktop      → ❌ 다운로드 버튼 숨김
 *   Linux Firefox      → other   + isDesktop      → ❌ 다운로드 버튼 숨김
 *   Windows Edge       → chrome  (Chromium)       → ✅ PWA 버튼 표시
 */

export type BrowserKey = "samsung" | "safari" | "chrome" | "other";

// ── 브라우저 종류 ──────────────────────────────────────────────────────────────

/** 브라우저 종류 감지 */
export function detectBrowser(): BrowserKey {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "safari";
  if (/Chrome/i.test(ua)) return "chrome";
  return "other";
}

// ── 플랫폼 / 기기 종류 ────────────────────────────────────────────────────────

/**
 * 데스크톱 OS 여부
 * - macOS: Macintosh + maxTouchPoints === 0  (iPad는 > 1 이므로 자동 제외)
 * - Windows: Windows NT + Mobile 키워드 없음
 * - Linux: Linux + Android/Mobile 없음  (ChromeOS는 Chrome 분류이므로 별도 처리 불필요)
 */
export function detectIsDesktop(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints === 0) return true;
  if (/Windows NT/i.test(ua) && !/Mobile/i.test(ua)) return true;
  if (/Linux/i.test(ua) && !/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
  return false;
}

/**
 * iPad 여부
 * - 구형 iPad: UA에 "iPad" 포함
 * - 신형 iPad (iPadOS 13+): Macintosh UA + maxTouchPoints > 1
 */
export function detectIsIPad(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function detectIsIPhone(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPod/.test(navigator.userAgent) && !detectIsIPad();
}

// ── 인앱브라우저 ──────────────────────────────────────────────────────────────

/** 인앱브라우저 여부 (카카오톡, 네이버앱, 인스타그램 등) */
export function isInAppBrowserUA(): boolean {
  if (typeof window === "undefined") return false;
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent);
}

// ── iOS/Safari 버전 ───────────────────────────────────────────────────────────

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

// ── PWA 설치 상태 ─────────────────────────────────────────────────────────────

/** PWA 설치 완료 여부 (standalone 모드 또는 쿠키) */
export function isPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    document.cookie.includes("pwa_standalone=1")
  );
}

// ── 다운로드 유도 페이지 ──────────────────────────────────────────────────────

/**
 * 다운로드 유도 페이지(/download) 표시 여부
 * 조건: 모바일 기기 + (Samsung|Safari|Other 브라우저) + 미설치 + 미dismiss
 * 데스크톱(macOS Safari, Windows Firefox 등)은 제외
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
    !detectIsDesktop() &&          // ← 데스크톱 전면 제외
    (b === "samsung" || b === "safari" || b === "other")
  );
}

// ── 모듈 레벨 편의 상수 (한 번만 계산) ────────────────────────────────────────
export const browserKey: BrowserKey =
  typeof window !== "undefined" ? detectBrowser() : "other";

export const isSamsungBrowser = browserKey === "samsung";
/** Safari UA — iOS/iPadOS/macOS Safari 및 iOS Chrome(CriOS) 포함 */
export const isIOSSafari      = browserKey === "safari";
export const isChromeBrowser  = browserKey === "chrome";
export const isOtherBrowser   = browserKey === "other";
export const isInAppBrowser   = isInAppBrowserUA();

export const isIPad         = detectIsIPad();
export const isIPhone       = detectIsIPhone();
export const isDesktop      = detectIsDesktop();
export const isMobileDevice = !isDesktop;   // isIPad, isIPhone 모두 포함

// ── 데스크톱 OS 종류 ──────────────────────────────────────────────────────────

export type DesktopOS = "windows" | "macos" | "linux" | null;

/**
 * 데스크톱 OS 종류 감지
 * - null 이면 모바일/태블릿
 * - 판별 로직은 detectIsDesktop()과 동일 기준
 */
export function detectDesktopOS(): DesktopOS {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints === 0) return "macos";
  if (/Windows NT/i.test(ua) && !/Mobile/i.test(ua)) return "windows";
  if (/Linux/i.test(ua) && !/Android/i.test(ua) && !/Mobile/i.test(ua)) return "linux";
  return null;
}

/** 현재 데스크톱 OS ("windows" | "macos" | "linux" | null) */
export const desktopOS: DesktopOS = detectDesktopOS();