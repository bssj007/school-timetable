/**
 * pwaDetect.ts — PWA 설치 여부 실시간 감지 및 앱 실행 유틸리티
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. navigator.getInstalledRelatedApps():
 *    Android Chromium (Chrome, 삼성 인터넷 등)에서 쿠키/로컬 저장소 없이
 *    OS에 직접 질의하여 현재 기기에 PWA가 설치되어 있는지 실시간 확인
 *
 * 2. window.matchMedia('(display-mode: standalone)'):
 *    PWA Standalone 모드 실행 여부 감지
 *
 * 3. openPwaApp():
 *    설치 완료된 PWA(WebAPK)를 브라우저에서 실행(Android Intent / Deep link)
 */

import { useState, useEffect } from "react";

/** 기기에 PWA가 설치되어 있는지 확인 (쿠키/스토리지 없이 OS 및 브라우저 API로 판별) */
export async function checkIsPwaInstalledOnDevice(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1. 이미 standalone 모드로 실행 중인 경우
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  ) {
    return true;
  }

  // 2. Android Chromium 계열: getInstalledRelatedApps() 지원 시 OS에 직접 질의
  if ("getInstalledRelatedApps" in navigator) {
    try {
      const relatedApps = await (navigator as any).getInstalledRelatedApps();
      if (Array.isArray(relatedApps) && relatedApps.length > 0) {
        return true;
      }
    } catch (e) {
      console.debug("getInstalledRelatedApps check failed:", e);
    }
  }

  return false;
}

/** React 컴포넌트에서 실시간 PWA 설치 여부를 구독하는 훅 */
export function useIsPwaInstalled(): boolean {
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true
    );
  });

  useEffect(() => {
    let isMounted = true;

    // 비동기 OS 설치 여부 조회
    checkIsPwaInstalledOnDevice().then((installed) => {
      if (isMounted && installed) {
        setIsInstalled(true);
      }
    });

    // PWA 설치 완료 이벤트 수신 (설치 즉시 버튼 상태 갱신)
    const handleAppInstalled = () => {
      if (isMounted) {
        setIsInstalled(true);
      }
    };

    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      isMounted = false;
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  return isInstalled;
}

/** 설치된 PWA 앱으로 이동 / 실행 */
export function openPwaApp(targetUrl: string = "/?mode=pwa") {
  if (typeof window === "undefined") return;

  const origin = window.location.origin;
  const host = window.location.host;
  const pathWithQuery = targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`;

  // Android WebAPK를 직접 호출하는 표준 안드로이드 Intent URI
  const intentUrl = `intent://${host}${pathWithQuery}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

  try {
    window.location.href = intentUrl;
  } catch {
    window.location.href = `${origin}${pathWithQuery}`;
  }
}
