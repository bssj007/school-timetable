/**
 * browserDetect.ts — 3-Layer 통합 브라우저/기기/버전 감지 시스템
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 감지 우선순위:
 *   Layer 1 — navigator.userAgentData (Client Hints, Chromium 계열만 지원)
 *   Layer 2 — navigator.userAgent 문자열 파싱 (Safari·Firefox 포함 전 브라우저)
 *   Layer 3 — CSS/JS 기능 감지 (최후 fallback)
 *
 * 지원 범위:
 *   Layer 1 지원: Chrome, Edge, Samsung Internet, Opera (+ Chromium 계열)
 *   Layer 1 미지원: Safari ❌, Firefox ❌, iOS Chrome (CriOS) ❌
 *
 * 단일 진실원천:
 *   detect() → AgentInfo  (모듈 로드 시 1회만 실행, 이후 상수로 제공)
 *   iOS/Safari 버전도 AgentInfo.iosVersion 에 통합 — 별도 함수 불필요
 */

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

export type BrowserKey = "samsung" | "safari" | "chrome" | "other";
export type DesktopOS   = "windows" | "macos" | "linux" | null;

export interface AgentInfo {
  /** 모바일/태블릿 여부 */
  isMobile: boolean;
  /** 데스크톱/노트북 여부 */
  isDesktop: boolean;
  /** 데스크톱 OS ("windows" | "macos" | "linux" | null=모바일) */
  desktopOS: DesktopOS;
  /** Apple iPad (구형 + iPadOS 13+ 신형) */
  isIPad: boolean;
  /** Apple iPhone / iPod Touch */
  isIPhone: boolean;
  /** Apple iOS / iPadOS 기기 여부 */
  isIOS: boolean;
  /** Android 모바일/태블릿 기기 여부 */
  isAndroid: boolean;
  /** iOS Mobile Safari 여부 (Chrome/Firefox 등 iOS 기타 브라우저 제외) */
  isIOSSafari: boolean;
  /** iOS Chrome 여부 (CriOS) */
  isIOSChrome: boolean;
  /** iOS 기타 브라우저 여부 (Firefox, Edge, Opera, Whale 등 Safari/Chrome 제외 브라우저) */
  isIOSOther: boolean;
  /** 브라우저 카테고리 */
  browserKey: BrowserKey;
  /** 인앱브라우저 (카카오톡·네이버·인스타그램 등) */
  isInAppBrowser: boolean;
  /**
   * iOS / iPadOS / Safari 메이저 버전
   * - iOS 26+부터 Apple이 UA OS 버전을 동결(freeze) → "CPU iPhone OS 18_x" 처럼 표시됨
   * - Safari의 "Version/26.x" 헤더는 실제 버전을 노출 → 두 값 중 큰 것 사용
   * - iOS/iPadOS 기기가 아니면 0
   */
  iosVersion: number;
  /** iOS 26+ (iPhone 17+ / iOS 26) — 공유 버튼이 ··· 메뉴 안에 숨겨짐 */
  isIOS26Plus: boolean;
  /** iOS 15~25 — 공유 버튼이 하단 중앙 툴바 */
  isIOS15Plus: boolean;
  /** iOS 13~14 — 상단 주소창 + 하단 툴바 가운데 공유 버튼 */
  isIOS13Plus: boolean;
  /**
   * PWA standalone 모드 또는 네이티브 앱 래퍼(TWA/WebView)에서 실행 중
   * - display-mode: standalone  → PWA 설치 후 앱으로 실행
   * - navigator.standalone      → iOS Safari PWA
   * - Android TWA / WebView     → UA 에 "; wv)" 포함
   * ※ 브라우저로 재접속하면 false (쿠키·설치 여부와 무관)
   * → 이 경우 다운로드 버튼 미표시, 별도 카테고리로 처리
   */
  isInstalledApp: boolean;
  /** 실제 사용된 감지 계층 (디버그용: 1=ClientHints, 2=UA, 3=Feature) */
  detectionLayer: 1 | 2 | 3;
}

// ── 기본값 (SSR / window 없음) ────────────────────────────────────────────────

function defaultAgent(): AgentInfo {
  return {
    isMobile: false, isDesktop: true, desktopOS: null,
    isIPad: false, isIPhone: false,
    isIOS: false, isAndroid: false, isIOSSafari: false,
    isIOSChrome: false, isIOSOther: false,
    browserKey: "other", isInAppBrowser: false,
    iosVersion: 0, isIOS26Plus: false, isIOS15Plus: false, isIOS13Plus: false,
    isInstalledApp: false,
    detectionLayer: 3,
  };
}

// ── iOS/Safari 버전 계산 (내부 헬퍼) ─────────────────────────────────────────
//
// iOS 26+부터 Apple이 UA의 OS 버전을 동결(freeze) → "CPU iPhone OS 18_x" 처럼 구버전 표시
// 대신 Safari의 "Version/26.x" 헤더는 실제 메이저 버전을 노출 → 두 값 중 큰 것 사용

function calcIOSVersion(ua: string): number {
  const osVer  = parseInt(/os (\d+)/i.exec(ua.toLowerCase())?.[1] ?? "0", 10);
  const safVer = parseInt(/version\/(\d+)/i.exec(ua)?.[1]          ?? "0", 10);
  return Math.max(osVer, safVer);
}

// ── Layer 1: UA Client Hints ──────────────────────────────────────────────────
//
// navigator.userAgentData 는 Chromium 계열 브라우저에서만 사용 가능.
// Safari / Firefox / iOS Chrome(CriOS) 는 지원하지 않으므로 null 반환 시 Layer 2로 넘어감.
//
// 제공 정보(동기):
//   .mobile   → boolean (폰/태블릿 = true, 데스크톱 = false)
//   .platform → "Windows" | "macOS" | "Linux" | "Android" | "iOS" | "Chrome OS" | ""
//   .brands   → [{brand, version}, ...]  Samsung Internet | Google Chrome | Chromium 등
//
// 주의: iPad Chrome (CriOS) 는 iOS WebKit 엔진을 사용하므로 userAgentData 없음
//       → isIPad 는 Layer 2 (maxTouchPoints) 에서만 정확하게 감지됨
//
// iOS 버전: Chromium 환경에서는 iOS 기기가 존재하지 않으므로 iosVersion = 0

function detectLayer1(): Partial<AgentInfo> | null {
  if (typeof window === "undefined") return null;
  const uaData = (navigator as any).userAgentData;
  if (!uaData || typeof uaData.mobile === "undefined") return null;

  const mobile: boolean     = uaData.mobile;
  const platform: string    = (uaData.platform ?? "").toLowerCase();
  const brands: { brand: string; version: string }[] = uaData.brands ?? [];
  const brandStr = brands.map((b) => b.brand.toLowerCase()).join(" ");
  const rawUA = typeof navigator !== "undefined" ? navigator.userAgent : "";

  // 브라우저 판별: Client Hints + UA 교차 검증
  // Samsung Internet, Opera, Edge, Whale 등을 정확하게 구분
  const isOpera = /opera|opr|opt/i.test(brandStr) || /OPR\/|Opera|OPT\//i.test(rawUA);
  const isSamsung = /samsung internet|samsungbrowser/i.test(brandStr) || /SamsungBrowser/i.test(rawUA);
  const isEdge = /microsoft edge|edg/i.test(brandStr) || /EdgA?\/|Edge\//i.test(rawUA);
  const isWhale = /whale/i.test(brandStr) || /Whale\//i.test(rawUA);

  let browserKey: BrowserKey = "chrome";
  if (isSamsung) {
    browserKey = "samsung";
  } else if (isOpera || isEdge || isWhale) {
    browserKey = "other";
  } else if (/google chrome/i.test(brandStr) || (/chromium/i.test(brandStr) && !isOpera && !isEdge && !isWhale)) {
    browserKey = "chrome";
  }

  // 데스크톱 OS 판별
  let desktopOS: DesktopOS = null;
  if (!mobile) {
    if (platform === "windows")                               desktopOS = "windows";
    else if (platform === "macos")                            desktopOS = "macos";
    else if (platform === "linux" || platform === "chrome os") desktopOS = "linux";
  }

  const isAndroid = mobile && (platform === "android" || /Android/i.test(rawUA));

  return {
    isMobile: mobile, isDesktop: !mobile, desktopOS,
    isIPad: false,   // Chromium 환경에서 Apple iPad 는 존재하지 않음
    isIPhone: false,
    isIOS: false,
    isAndroid,
    isIOSSafari: false,
    isIOSChrome: false,
    isIOSOther: false,
    browserKey,
    // iOS 버전: Chromium 환경이므로 항상 0
    iosVersion: 0, isIOS26Plus: false, isIOS15Plus: false, isIOS13Plus: false,
    detectionLayer: 1,
  };
}

// ── Layer 2: UA 문자열 파싱 ───────────────────────────────────────────────────
//
// Safari / Firefox 를 포함한 모든 브라우저에서 동작.
// iPad 신형(iPadOS 13+) 감지를 위해 maxTouchPoints 를 보조로 사용.
//
// 브라우저 감지 우선순위:
//   1. SamsungBrowser (UA)
//   2. Safari (UA) && !Chrome → iOS/iPadOS/macOS Safari, iOS CriOS 포함
//   3. Chrome (UA)
//   4. 기타
//
// iOS 버전: Safari/iOS 기기에서만 계산, 그 외 0

function detectLayer2(): AgentInfo {
  const ua  = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const mtp = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0;

  // iPad: 구형 (iPad in UA) + 신형 (Macintosh + touch > 1)
  const isIPad   = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && mtp > 1);
  const isIPhone = /iPhone|iPod/.test(ua) && !isIPad;
  const isIOS    = isIPad || isIPhone;

  // 인앱 브라우저 (SNS/메신저 내부 WebView)
  const isInApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(ua);

  // 모바일 여부: iPad + iPhone + Android/Mobi 계열
  const mobile = isIOS || /Android|Mobi/i.test(ua);
  const isAndroid = !isIOS && (/Android/i.test(ua) || (!isIPad && !isIPhone && mobile));

  // 브라우저 종류
  let browserKey: BrowserKey = "other";
  let isIOSSafari = false;

  if (/SamsungBrowser/i.test(ua)) {
    browserKey = "samsung";
  } else if (/OPR\/|Opera|OPT\//i.test(ua)) {
    // Opera (Android 및 iOS)
    browserKey = "other";
  } else if (/EdgA?\/|EdgiOS|Edge\//i.test(ua)) {
    // Edge
    browserKey = "other";
  } else if (/Whale\//i.test(ua)) {
    // Naver Whale
    browserKey = "other";
  } else if (/Firefox|FxiOS/i.test(ua)) {
    // Firefox
    browserKey = "other";
  } else if (/DuckDuckGo\//i.test(ua)) {
    // DuckDuckGo
    browserKey = "other";
  } else if (/Brave\//i.test(ua)) {
    // Brave
    browserKey = "other";
  } else if (/CriOS|GSA\//i.test(ua)) {
    // iOS Chrome 및 Google 앱
    browserKey = "chrome";
  } else if (isIOS) {
    // iOS 환경: 위 서드파티(Chrome, Firefox, Edge, Opera, Whale, DuckDuckGo, Brave 등)가 아닌 경우만 실제 Safari
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
      browserKey = "safari";
      isIOSSafari = !isInApp;
    } else {
      browserKey = "other";
    }
  } else if (/Chrome/i.test(ua) || /GSA\//i.test(ua)) {
    // Android 및 데스크톱 Chrome, Google 앱
    browserKey = "chrome";
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browserKey = "safari";
  }

  // 데스크톱 OS (모바일이 아닐 경우만)
  let desktopOS: DesktopOS = null;
  if (!mobile) {
    if      (/Macintosh/i.test(ua) && mtp === 0)               desktopOS = "macos";
    else if (/Windows NT/i.test(ua) && !/Mobile/i.test(ua))    desktopOS = "windows";
    else if (/Linux/i.test(ua) && !/Android|Mobile/i.test(ua)) desktopOS = "linux";
  }

  // iOS/Safari 버전 — iOS/iPadOS 기기이거나 Safari UA 일 때만 계산
  const needsIOSVersion = isIOS || browserKey === "safari";
  const iosVersion   = needsIOSVersion ? calcIOSVersion(ua) : 0;
  const isIOS26Plus  = iosVersion >= 26;
  const isIOS15Plus  = iosVersion >= 15;
  const isIOS13Plus  = iosVersion >= 13;

  const isIOSChrome = isIOS && browserKey === "chrome";
  const isIOSOther  = isIOS && !isIOSSafari && !isIOSChrome;

  return {
    isMobile: mobile, isDesktop: !mobile, desktopOS,
    isIPad, isIPhone, isIOS, isAndroid, isIOSSafari,
    isIOSChrome, isIOSOther,
    browserKey, isInAppBrowser: isInApp,
    iosVersion, isIOS26Plus, isIOS15Plus, isIOS13Plus,
    isInstalledApp: false,   // detect() 에서 실제 값으로 덧쓰임
    detectionLayer: 2,
  };
}

// ── Layer 3: CSS/JS 기능 감지 (Fallback) ─────────────────────────────────────
//
// UA도 Client Hints도 신뢰할 수 없을 때 마지막 수단.
// pointer: coarse (터치 입력) 와 hover: none 조합으로 모바일 추정.
// 주의: Surface Pro 같은 터치스크린 노트북은 false positive 가능.

function detectLayer3(): AgentInfo {
  if (typeof window === "undefined") return defaultAgent();

  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const hasHover = window.matchMedia("(hover: hover)").matches;
  const mtp      = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0;

  const mobile = isCoarse && !hasHover;
  const isIPad = mtp > 1 && !isCoarse;
  const isIOS = isIPad;
  const isAndroid = mobile && !isIOS;

  return {
    isMobile: mobile, isDesktop: !mobile, desktopOS: null,
    isIPad, isIPhone: false, isIOS, isAndroid, isIOSSafari: false,
    isIOSChrome: false, isIOSOther: false,
    browserKey: "other", isInAppBrowser: false,
    iosVersion: 0, isIOS26Plus: false, isIOS15Plus: false, isIOS13Plus: false,
    isInstalledApp: false,   // detect() 에서 실제 값으로 덧쓰임
    detectionLayer: 3,
  };
}

// ── 통합 감지 함수 ────────────────────────────────────────────────────────────

/**
 * detect() — 3-Layer 우선순위로 기기/브라우저/버전을 감지하고 AgentInfo를 반환.
 *
 * Layer 1 (Client Hints) 가 사용 가능한 경우:
 *   - 모바일/플랫폼은 CH 값을 신뢰
 *   - 브라우저 키는 brands 를 우선 사용 (Samsung/Chrome 구분)
 *   - iOS 기기가 존재하지 않으므로 iosVersion = 0
 *
 * Layer 2 (UA 파싱):
 *   - Safari/Firefox/iOS 포함 전 브라우저 커버
 *   - iOS 버전 동결 대응 (Version/X.X vs os X)
 *
 * Layer 3 (기능 감지):
 *   - pointer: coarse + hover: none → 모바일 추정
 */
export function detect(): AgentInfo {
  if (typeof window === "undefined") return defaultAgent();

  const inApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent);

  // PWA standalone / Native 앱 실행 여부 (브라우저 재접속 시는 false)
  const isInstalledApp =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true ||
    (/; wv\)/i.test(navigator.userAgent) && !/GSA\//i.test(navigator.userAgent));  // Android TWA / WebView (Google 앱 제외)

  // Layer 1: Client Hints (Chromium 전용)
  const ch = detectLayer1();
  if (ch) {
    return {
      isMobile:       ch.isMobile!,
      isDesktop:      ch.isDesktop!,
      desktopOS:      ch.desktopOS!,
      isIPad:         false,
      isIPhone:       false,
      isIOS:          false,
      isAndroid:      ch.isAndroid!,
      isIOSSafari:    false,
      isIOSChrome:    false,
      isIOSOther:     false,
      browserKey:     ch.browserKey!,
      isInAppBrowser: inApp,
      iosVersion:     0,
      isIOS26Plus:    false,
      isIOS15Plus:    false,
      isIOS13Plus:    false,
      isInstalledApp,
      detectionLayer: 1,
    };
  }

  // Layer 2: UA 파싱 (Safari / Firefox / 기타)
  const ua2 = detectLayer2();
  if (ua2.browserKey !== "other" || ua2.isIPad || ua2.isIPhone || ua2.desktopOS !== null) {
    return { ...ua2, isInAppBrowser: inApp, isInstalledApp };
  }

  // Layer 3: 기능 감지 fallback
  return { ...detectLayer3(), isInAppBrowser: inApp, isInstalledApp };
}

// ── 모듈 레벨 싱글턴 (모듈 로드 시 1회만 실행) ─────────────────────────────────

/** 3-Layer 통합 감지 결과. 애플리케이션 전체에서 이 값을 공유한다. */
export const agent: AgentInfo =
  typeof window !== "undefined" ? detect() : defaultAgent();

// ── 편의 상수 (하위 호환 — 신규 코드는 agent.xxx 직접 사용 권장) ─────────────
//   ex) agent.browserKey === "samsung"  대신  isSamsungBrowser
//       agent.isMobile                 대신  isMobileDevice
//   @deprecated — 향후 제거 예정. 소비 파일에서 agent를 직접 import 할 것.

/** @deprecated agent.browserKey 사용 */
export const browserKey: BrowserKey  = agent.browserKey;
/** @deprecated agent.browserKey === "samsung" 사용 */
export const isSamsungBrowser        = agent.browserKey === "samsung";
/** iOS Mobile Safari 여부 (Chrome/Firefox 등 iOS 기타 브라우저 제외) */
export const isIOSSafari             = agent.isIOSSafari;
/** iOS Chrome 여부 (CriOS) */
export const isIOSChrome             = agent.isIOSChrome;
/** iOS 기타 브라우저 여부 (Safari/Chrome 제외) */
export const isIOSOther              = agent.isIOSOther;
/** iOS/iPadOS 기기 여부 */
export const isIOS                   = agent.isIOS;
/** Android 기기 여부 */
export const isAndroid               = agent.isAndroid;
/** @deprecated agent.browserKey === "chrome" 사용 */
export const isChromeBrowser         = agent.browserKey === "chrome";
/** @deprecated agent.browserKey === "other" 사용 */
export const isOtherBrowser          = agent.browserKey === "other";
/** @deprecated agent.isInAppBrowser 사용 */
export const isInAppBrowser          = agent.isInAppBrowser;
/** @deprecated agent.isIPad 사용 */
export const isIPad                  = agent.isIPad;
/** @deprecated agent.isIPhone 사용 */
export const isIPhone                = agent.isIPhone;
/** @deprecated agent.isDesktop 사용 */
export const isDesktop               = agent.isDesktop;
/** @deprecated agent.isMobile 사용 */
export const isMobileDevice          = agent.isMobile;
/** @deprecated agent.desktopOS 사용 */
export const desktopOS: DesktopOS    = agent.desktopOS;

// ── 편의 상수 — iOS/Safari 버전 ──────────────────────────────────────────────

/**
 * iOS / iPadOS / Safari 메이저 버전
 * - iOS 26+에서 UA 동결 대응 완료 (Version/X.X 우선)
 * - iOS/Safari 기기가 아니면 0
 */
export const iosVersion              = agent.iosVersion;
/** iOS 26+ (iPhone 17+) — 공유 버튼이 ··· 메뉴 안에 숨겨짐 */
export const isIOS26Plus             = agent.isIOS26Plus;
/** iOS 15~25 — 공유 버튼이 하단 중앙 툴바 */
export const isIOS15Plus             = agent.isIOS15Plus;

// ── 편의 함수 (하위 호환) ─────────────────────────────────────────────────────

export function detectBrowser(): BrowserKey  { return agent.browserKey; }
export function detectIsIPad(): boolean      { return agent.isIPad; }
export function detectIsIPhone(): boolean    { return agent.isIPhone; }
export function detectIsDesktop(): boolean   { return agent.isDesktop; }
export function detectDesktopOS(): DesktopOS { return agent.desktopOS; }

/**
 * iOS/Safari 버전 반환 (하위 호환 — 내부적으로 agent.iosVersion 사용)
 * @deprecated agent.iosVersion 또는 상수 iosVersion 을 직접 사용하세요.
 */
export function detectIOSVersion(): number { return agent.iosVersion; }

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

// ── 다운로드 유도 페이지 표시 여부 ───────────────────────────────────────────

/**
 * shouldShowDownloadPage()
 * 표시 조건:
 *   1. 인앱 브라우저 아닐 것
 *   2. 앱으로 실행 중이 아닐 것 (PWA standalone / TWA / WebView)
 *      → 브라우저로 재접속 시 쿠키·설치 여부와 무관하게 표시함
 *   3. 사용자가 dismiss 하지 않았을 것
 *   4. 모바일 기기일 것 (데스크톱 제외)
 *   5. 다운로드 대상 브라우저:
 *      - Android: Chrome/Google, Samsung Internet 및 Opera 등 브라우저 전체
 *      - iOS: Safari 및 iOS Chrome 표시 (기타 브라우저는 PWA 프롬프트 미지원으로 사이트 직행)
 */
export function shouldShowDownloadPage(): boolean {
  if (typeof window === "undefined") return false;
  const isDismissed =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("download_page_dismissed") === "1";
  if (agent.isInAppBrowser || agent.isInstalledApp || isDismissed || !agent.isMobile) {
    return false;
  }
  if (agent.isIOS) {
    // iOS에서는 Safari와 Chrome에 다운로드 유도 페이지 표시
    // 기타 브라우저는 PWA 프롬프트를 띄울 수 없으므로 유도 페이지 없이 사이트 직행
    return agent.isIOSSafari || agent.isIOSChrome;
  }
  if (agent.isAndroid) {
    // Android에서는 Chrome/Google, Samsung 및 Opera 등 브라우저 모두 표시
    return true;
  }
  return true;
}

/** @internal UA 기반 인앱 브라우저 여부 (detect() 내부에서 사용) */
export function isInAppBrowserUA(): boolean {
  if (typeof window === "undefined") return false;
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent);
}