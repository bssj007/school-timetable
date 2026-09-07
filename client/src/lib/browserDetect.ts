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
  /** 카카오톡 인앱 브라우저 여부 */
  isKakaoTalk: boolean;
  /** Firefox 브라우저 여부 (Android/iOS/Desktop 전체) */
  isFirefox: boolean;
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
  /**
   * 설치된 앱 실행 유형 (isInstalledApp === true 일 때만 의미 있음)
   * - "pwa"     : display-mode:standalone 또는 navigator.standalone (PWA 홈화면 추가)
   * - "webview" : Android TWA / WebView (UA에 "; wv)" 포함, 정식 설치된 앱)
   * - null      : 설치된 앱이 아님
   */
  installedAppType: "pwa" | "webview" | null;
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
    browserKey: "other", isInAppBrowser: false, isKakaoTalk: false,
    isFirefox: false,
    iosVersion: 0, isIOS26Plus: false, isIOS15Plus: false, isIOS13Plus: false,
    isInstalledApp: false, installedAppType: null,
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
  // Samsung Internet, Opera, Edge, Whale 등을 정확하게 구분 (카카오는 기타 브라우저로 취급)
  const isKakao = /KAKAOTALK/i.test(rawUA);
  const isOpera = /opera|opr|opt/i.test(brandStr) || /OPR\/|Opera|OPT\//i.test(rawUA);
  const isSamsung = /samsung internet|samsungbrowser/i.test(brandStr) || /SamsungBrowser/i.test(rawUA);
  const isEdge = /microsoft edge|edg/i.test(brandStr) || /EdgA?\/|Edge\//i.test(rawUA);
  const isWhale = /whale/i.test(brandStr) || /Whale\//i.test(rawUA);

  let browserKey: BrowserKey = "chrome";
  if (isKakao) {
    browserKey = "other";
  } else if (isSamsung) {
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
    isInAppBrowser: isKakao || /NAVER|Instagram|FBAN|FBAV|LINE/i.test(rawUA),
    isKakaoTalk: isKakao,
    isFirefox: false,
    // iOS 버전: Chromium 환경이므로 항상 0
    iosVersion: 0, isIOS26Plus: false, isIOS15Plus: false, isIOS13Plus: false,
    isInstalledApp: false, installedAppType: null,  // detect() 에서 실제 값으로 덧쓰임
    detectionLayer: 1,
  };
}

// ── Layer 2: UA 문자열 파싱 ───────────────────────────────────────────────────
//
// Safari / Firefox 를 포함한 모든 브라우저에서 동작.
// iPad 신형(iPadOS 13+) 감지를 위해 maxTouchPoints 를 보조로 사용.
//
// 브라우저 감지 우선순위:
//   1. KakaoTalk (UA) → 기타 브라우저("other")로 취급
//   2. SamsungBrowser (UA)
//   3. Safari (UA) && !Chrome → iOS/iPadOS/macOS Safari, iOS CriOS 포함
//   4. Chrome (UA)
//   5. 기타
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
  const isKakaoTalk = /KAKAOTALK/i.test(ua);
  const isInApp = isKakaoTalk || /NAVER|Instagram|FBAN|FBAV|LINE/i.test(ua);

  // 모바일 여부: iPad + iPhone + Android/Mobi 계열
  const mobile = isIOS || /Android|Mobi/i.test(ua);
  const isAndroid = !isIOS && (/Android/i.test(ua) || (!isIPad && !isIPhone && mobile));

  // 브라우저 종류
  let browserKey: BrowserKey = "other";
  let isIOSSafari = false;

  if (isKakaoTalk) {
    browserKey = "other";
  } else if (/SamsungBrowser/i.test(ua)) {
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
    browserKey, isInAppBrowser: isInApp, isKakaoTalk,
    isFirefox: /Firefox|FxiOS/i.test(ua),
    iosVersion, isIOS26Plus, isIOS15Plus, isIOS13Plus,
    isInstalledApp: false, installedAppType: null,   // detect() 에서 실제 값으로 덧쓰임
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
  const isKakaoTalk = typeof navigator !== "undefined" && /KAKAOTALK/i.test(navigator.userAgent);
  const isInApp = isKakaoTalk || (typeof navigator !== "undefined" && /NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent));

  return {
    isMobile: mobile, isDesktop: !mobile, desktopOS: null,
    isIPad, isIPhone: false, isIOS, isAndroid, isIOSSafari: false,
    isIOSChrome: false, isIOSOther: false,
    browserKey: "other",
    isInAppBrowser: isInApp,
    isKakaoTalk,
    isFirefox: typeof navigator !== "undefined" && /Firefox|FxiOS/i.test(navigator.userAgent),
    iosVersion: 0, isIOS26Plus: false, isIOS15Plus: false, isIOS13Plus: false,
    isInstalledApp: false, installedAppType: null,   // detect() 에서 실제 값으로 덧쓰임
    detectionLayer: 3,
  };
}

// ── PWA 및 Native/WebView 정식 앱 감지 로직 ───────────────────────────────────

/**
 * PWA standalone 또는 WebView 정식 앱 실행 유형 판정
 * - "pwa"     : 홈화면에 추가된 PWA 앱 (standalone, minimal-ui, fullscreen, iOS standalone 등)
 * - "webview" : Google Play / App Store 정식 설치 앱 (Android WebView, TWA, iOS WKWebView 등)
 * - null      : 일반 웹 브라우저 접속
 */
export function getInstalledAppType(): "pwa" | "webview" | null {
  if (typeof window === "undefined") return null;

  const ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "";
  const isKakaoTalk = /KAKAOTALK/i.test(ua);
  const inApp = isKakaoTalk || /NAVER|Instagram|FBAN|FBAV|LINE/i.test(ua);

  // 1. PWA Standalone 감지
  // - display-mode: standalone
  // - display-mode: minimal-ui (삼성 인터넷 PWA manifest 등)
  // - display-mode: fullscreen
  // - display-mode: window-controls-overlay
  // - iOS Safari standalone: (navigator as any).standalone === true
  const isPwaStandalone =
    !inApp && (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      (navigator as any).standalone === true
    );

  // 2. Android WebView / 정식 앱 감지
  // - Android UA의 '; wv' 토큰 (세미콜론/괄호/공백 등 위치 무관 매칭)
  const hasAndroidWvToken = !/GSA\//i.test(ua) && (/;\s*wv[;)]/i.test(ua) || /\bwv\b/i.test(ua));
  // - Android WebView 기본 UA 특성: Version/X.X 와 Chrome/X.X, Mobile Safari 동시 포함 (일반 모바일 크롬 브라우저에는 Version/X.X가 없음)
  const isAndroidWebViewUA = !/GSA\//i.test(ua) && /Version\/[0-9.]+/i.test(ua) && /Chrome\/[0-9.]+/i.test(ua) && /Mobile Safari\/[0-9.]+/i.test(ua);
  // - Android TWA / 앱 레퍼러 (Google Play 정식 앱에서 웹 페이지 로드 시 레퍼러가 android-app:// 으로 설정됨)
  const isAndroidAppReferrer = typeof document !== "undefined" && Boolean(document.referrer && document.referrer.startsWith("android-app://"));
  // - Android Native Bridge 인터페이스 주입 확인
  const hasAndroidBridge = Boolean((window as any).AndroidBridge || (window as any).Android || (window as any).schoolTimetableApp || (window as any).ReactNativeWebView || (window as any).flutter_inappwebview);

  // 3. iOS 정식 앱 (WKWebView) 감지
  // - iOS 기기이면서 일반 인앱(카카오/네이버/인스타)이 아니고, 일반 브라우저(Safari, CriOS, FxiOS) 토큰이 없거나 WKWebView 메시지 핸들러가 있는 경우
  const isIOSDevice = /iPhone|iPad|iPod/i.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isIOSApp = isIOSDevice && !inApp && !/CriOS/i.test(ua) && !/FxiOS/i.test(ua) && (!/Safari\//i.test(ua) || Boolean((window as any).webkit?.messageHandlers));

  const isWebView = !inApp && (hasAndroidWvToken || isAndroidWebViewUA || isAndroidAppReferrer || hasAndroidBridge || isIOSApp);

  if (isWebView) return "webview";
  if (isPwaStandalone) return "pwa";

  // 4. URL 파라미터 기반 앱 실행 감지 (?mode=pwa, ?mode=app, ?standalone=1, ?utm_source=homescreen 등)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get("mode");
    if (mode === "webview" || mode === "app") return "webview";
    if (mode === "pwa" || searchParams.get("standalone") === "1" || searchParams.get("utm_source") === "homescreen") return "pwa";
  } catch {}

  // 5. 세션 스토리지 / 쿠키에 기록된 standalone 상태 (단, 인앱 브라우저 내부가 아닌 경우)
  if (!inApp) {
    try {
      if (sessionStorage.getItem("is_pwa_standalone") === "1" || document.cookie.includes("pwa_standalone=1")) {
        return "pwa";
      }
    } catch {}
  }

  return null;
}

/** PWA standalone 또는 WebView 정식 앱으로 실행 중인지 여부 (실시간 판정) */
export function checkIsInstalledApp(): boolean {
  return getInstalledAppType() !== null;
}

// ── 통합 감지 함수 ────────────────────────────────────────────────────────────

/**
 * detect() — 3-Layer 우선순위로 기기/브라우저/버전을 감지하고 AgentInfo를 반환.
 */
export function detect(): AgentInfo {
  if (typeof window === "undefined") return defaultAgent();

  const isKakaoTalk = /KAKAOTALK/i.test(navigator.userAgent);
  const inApp = isKakaoTalk || /NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent);

  // PWA standalone / Native WebView 정식 앱 실행 여부 종합 판별
  const installedAppType = getInstalledAppType();
  const isInstalledApp = installedAppType !== null;

  // Layer 1: Client Hints (Chromium 전용)
  const ch = detectLayer1();
  if (ch) {
    return {
      isMobile:         ch.isMobile!,
      isDesktop:        ch.isDesktop!,
      desktopOS:        ch.desktopOS!,
      isIPad:           false,
      isIPhone:         false,
      isIOS:            false,
      isAndroid:        ch.isAndroid!,
      isIOSSafari:      false,
      isIOSChrome:      false,
      isIOSOther:       false,
      browserKey:       isKakaoTalk ? "other" : ch.browserKey!,
      isInAppBrowser:   inApp,
      isKakaoTalk,
      isFirefox:        false,
      iosVersion:       0,
      isIOS26Plus:      false,
      isIOS15Plus:      false,
      isIOS13Plus:      false,
      isInstalledApp,
      installedAppType,
      detectionLayer:   1,
    };
  }

  // Layer 2: UA 파싱 (Safari / Firefox / 기타 전 브라우저)
  const ua2 = detectLayer2();
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    return {
      ...ua2,
      browserKey: isKakaoTalk ? "other" : ua2.browserKey,
      isInAppBrowser: inApp,
      isKakaoTalk,
      isInstalledApp,
      installedAppType,
    };
  }

  // Layer 3: 기능 감지 fallback (UA가 비어있거나 감지 불가할 때만 사용)
  return {
    ...detectLayer3(),
    browserKey: "other",
    isInAppBrowser: inApp,
    isKakaoTalk,
    isInstalledApp,
    installedAppType,
  };
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
/** 카카오톡 인앱 브라우저 여부 */
export const isKakaoTalk             = agent.isKakaoTalk;
/** Firefox 브라우저 여부 */
export const isFirefox               = agent.isFirefox;
/** @deprecated 카카오톡은 '기타 브라우저'로 통일 처리됨 */
export const isKakaoBrowser          = agent.isKakaoTalk;
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
 * shouldShowDownloadPage(settings?: any) — 단일 진실원천
 * 표시 조건:
 *   1. 인앱 브라우저 아닐 것 (단, 카카오톡은 스토어 링크 등록 및 스위치 활성 시 허용)
 *   2. 앱으로 실행 중이 아닐 것 (PWA standalone / TWA / WebView)
 *      → 브라우저로 재접속 시 쿠키·설치 여부와 무관하게 표시함
 *   3. 사용자가 dismiss 하지 않았을 것
 *   4. 모바일 기기일 것 (데스크톱 제외)
 *   5. 전체 서킷브레이커(pwa_install_button_visible)가 켜져 있을 것
 *   6. 다운로드 대상 브라우저 및 링크 등록 / 개별 스위치 여부:
 *      - Android:
 *        * Chrome/Google: chrome_install_button_visible 켜져 있으면 항상 표시
 *        * 카카오톡: play_store_url 등록 + other_install_button_visible 켜져 있을 때만 표시
 *        * 삼성: play_store_url 등록 + samsung_install_button_visible 켜져 있을 때만 표시
 *        * 기타 브라우저: play_store_url 등록 + other_install_button_visible 켜져 있을 때만 표시
 *      - iOS:
 *        * app_store_url 등록 시: 해당 브라우저 스위치(safari/chrome/other) 켜져 있으면 표시
 *        * app_store_url 미등록 시: Safari(safari_install_button_visible) 및 Chrome(chrome_install_button_visible)만 PWA 가이드 유도 (카카오 및 기타 브라우저는 사이트 직행)
 */
export function shouldShowDownloadPage(settings?: any): boolean {
  if (typeof window === "undefined") return false;

  // PWA 앱이나 WebView 정식 앱의 경우 다운로드 버튼이나 유도 페이지를 절대 표시하지 않음 (단일 진실원천)
  if (agent.isInstalledApp || checkIsInstalledApp()) {
    return false;
  }

  const isDismissed =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("download_page_dismissed") === "1";
  if (isDismissed || !agent.isMobile) {
    return false;
  }

  let resolvedSettings = settings;
  if (!resolvedSettings && typeof localStorage !== "undefined") {
    try {
      const cached = localStorage.getItem("public_settings_cache");
      if (cached) resolvedSettings = JSON.parse(cached);
    } catch {}
  }

  // 전체 서킷브레이커 OFF 시 유도 페이지 미표시
  if (resolvedSettings?.pwa_install_button_visible === false) {
    return false;
  }

  const hasAppStore = Boolean(resolvedSettings?.app_store_url && resolvedSettings.app_store_url.trim());
  const hasPlayStore = Boolean(resolvedSettings?.play_store_url && resolvedSettings.play_store_url.trim());
  // 일반 인앱 브라우저(네이버, 인스타그램 등)는 유도 페이지 미표시 (카카오톡은 기타 브라우저로 취급하여 통과)
  if (agent.isInAppBrowser && !agent.isKakaoTalk) {
    return false;
  }

  if (agent.isIOS) {
    // 1. 앱스토어 링크가 있는 경우: 해당 브라우저의 스위치 확인 후 표시
    if (hasAppStore) {
      const isHidden = agent.isIOSSafari
        ? resolvedSettings?.safari_install_button_visible === false
        : agent.browserKey === "chrome"
          ? resolvedSettings?.chrome_install_button_visible === false
          : resolvedSettings?.other_install_button_visible === false;
      if (isHidden) return false;
      return true;
    }
    // 2. 앱스토어 링크 없는 경우: Safari와 Chrome만 PWA 가이드 유도 (기타 브라우저는 사이트 직행)
    if (agent.isIOSSafari) return resolvedSettings?.safari_install_button_visible !== false;
    if (agent.isIOSChrome) return resolvedSettings?.chrome_install_button_visible !== false;
    return false;
  }

  if (agent.isAndroid) {
    // 1. Chrome/Google 브라우저이면 PWA 설치 버튼 지원하므로 스위치 확인 후 표시
    if (agent.browserKey === "chrome") {
      return resolvedSettings?.chrome_install_button_visible !== false;
    }
    // 2. 삼성 브라우저 및 기타 Android 브라우저(카카오 포함): Play Store 링크 등록 + 스위치 활성 시 표시
    const isSamsung = agent.browserKey === "samsung";
    const isHidden = isSamsung
      ? resolvedSettings?.samsung_install_button_visible === false
      : resolvedSettings?.other_install_button_visible === false;
    if (isHidden) return false;

    if (resolvedSettings) {
      return hasPlayStore;
    }
    return true;
  }

  return false;
}

/** @internal UA 기반 인앱 브라우저 여부 (detect() 내부에서 사용) */
export function isInAppBrowserUA(): boolean {
  if (typeof window === "undefined") return false;
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent);
}

// ── 접속환경별 점검 우회 (detect() 기반 단일 진실원천 일원화) ─────────────────

export type BypassEnvironmentKey = "chrome" | "samsung" | "safari" | "other" | "pwa_app" | "webview_app";

/**
 * detect() 결과(agent)를 기반으로 현재 환경의 BypassEnvironmentKey 반환
 * 단일 진실원천: 3-Layer 통합 감지(detect)로 일원화
 */
export function getCurrentBypassEnvironment(customAgent?: AgentInfo): BypassEnvironmentKey {
  const a = customAgent || agent || detect();
  const isInstalled = a.isInstalledApp || checkIsInstalledApp();
  if (isInstalled) {
    const appType = a.installedAppType || getInstalledAppType();
    return appType === "webview" ? "webview_app" : "pwa_app";
  }
  if (a.browserKey === "samsung") return "samsung";
  if (a.browserKey === "safari")  return "safari";
  if (a.browserKey === "chrome")  return "chrome";
  return "other";
}

/**
 * 현재 접속환경(detect() 기반)이 서버 설정에 의해 점검 우회(maintenance bypass) 대상인지 판단.
 * 기존의 불안정한 브라우저 로컬 쿠키 방식을 폐기하고, detect() 함수 기반의 단일 진실원천으로 일원화.
 *
 * @param settings public_settings (서버에서 내려온 시스템 설정)
 * @returns true이면 maintenance_mode.active=true 이더라도 접속제한을 우회합니다.
 */
export function isMaintenanceBypassed(settings?: any): boolean {
  if (typeof window === "undefined") return false;

  let resolvedSettings = settings;
  if (!resolvedSettings && typeof localStorage !== "undefined") {
    try {
      const cached = localStorage.getItem("public_settings_cache");
      if (cached) resolvedSettings = JSON.parse(cached);
    } catch {}
  }

  // detect() 기반 현재 환경 판별
  const envKey = getCurrentBypassEnvironment();
  const settingKey = `maintenance_bypass_${envKey}`;

  // 1. 서버 설정 (D1 DB system_settings) 기반 우회 판별
  if (resolvedSettings?.[settingKey] === true || resolvedSettings?.[settingKey] === "true") {
    return true;
  }
  if (resolvedSettings?.maintenance_bypass?.[envKey] === true) {
    return true;
  }

  // 2. 관리자 디버그/로컬 오버라이드 (호환성 보장)
  try {
    if (localStorage.getItem("maintenance_bypass_all") === "1" || localStorage.getItem(settingKey) === "1") {
      return true;
    }
  } catch {}

  return false;
}

/** 하위 호환성 유지용 alias (기존 getMaintenanceBypassCookie 호출 코드와 100% 호환) */
export const getMaintenanceBypassCookie = isMaintenanceBypassed;