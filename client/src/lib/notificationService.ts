// client/src/lib/notificationService.ts
import { agent, getInstalledAppType } from "./browserDetect";
import { toast } from "sonner";

const DEVICE_ID_KEY = "sj_device_id";
const NOTIF_ENABLED_KEY = "sj_notification_enabled";

/**
 * 고유 기기 식별자 (UUID) 생성 및 조회
 */
export function getOrCreateDeviceId(): string {
    if (typeof window === "undefined") return "server-dummy-id";
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            id = crypto.randomUUID();
        } else {
            id = "dev_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        }
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

/**
 * 네이티브 앱 (Android WebView, AndroidBridge 주입 환경, 전용 앱 등) 판별
 */
export function isNativeApp(): boolean {
    if (typeof window === "undefined") return false;
    const win = window as any;

    // 1. 네이티브 브리지 주입 확인
    if (Boolean(win.AndroidBridge || win.Android || win.schoolTimetableApp || win.ReactNativeWebView || win.flutter_inappwebview)) {
        return true;
    }

    // 2. getInstalledAppType() 검사
    if (getInstalledAppType() === "webview") {
        return true;
    }

    // 3. User-Agent 정식 앱 식별자 검사
    const ua = navigator.userAgent || "";
    if (/SeongjisuhaengApp/i.test(ua)) return true;
    if (!/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(ua)) {
        if (!/GSA\//i.test(ua) && (/;\s*wv[;)]/i.test(ua) || /\bwv\b/i.test(ua))) {
            return true;
        }
        if (!/SamsungBrowser|Whale|OPR|OPT|Opera|EdgA|Firefox|FxiOS/i.test(ua) &&
            /Version\/[0-9.]+/i.test(ua) && /Chrome\/[0-9.]+/i.test(ua) && /Mobile Safari\/[0-9.]+/i.test(ua)) {
            return true;
        }
    }

    return false;
}

/**
 * 브라우저 및 앱 환경의 알림 지원 여부 확인
 */
export function isNotificationSupported(): boolean {
    if (typeof window === "undefined") return false;
    // 1. 네이티브 앱 환경: Android WebView 및 브리지 환경은 알림 100% 지원
    if (isNativeApp()) return true;
    // 2. 웹/PWA 환경: 표준 Notification API 존재 여부 확인
    return "Notification" in window;
}

/**
 * 현재 기기의 알림 권한 상태 반환
 */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
    if (isNativeApp()) return "granted";
    if (!isNotificationSupported()) return "unsupported";
    return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
}

/**
 * 사용자가 현재 수행 알림받기를 활성화(ON)했는지 여부
 */
export function isNotificationSubscribed(): boolean {
    if (typeof window === "undefined") return false;
    if (!isNotificationSupported()) return false;
    
    // 네이티브 앱 환경: 브라우저 Notification 객체 권한 대신 로컬 스토리지 활성화 여부 확인
    if (isNativeApp()) {
        return localStorage.getItem(NOTIF_ENABLED_KEY) === "1";
    }

    return (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        localStorage.getItem(NOTIF_ENABLED_KEY) === "1"
    );
}

/**
 * 현재 환경 플랫폼 분류 ('pwa' | 'webview' | 'web')
 */
function getCurrentPlatform(): string {
    const appType = getInstalledAppType();
    if (appType === "pwa") return "pwa";
    if (appType === "webview") return "webview";
    return "web";
}

/**
 * 쿠키 설정 헬퍼
 */
function setNotificationCookie(enabled: boolean) {
    if (typeof document === "undefined") return;
    const val = enabled ? "1" : "0";
    document.cookie = `sj_notification_enabled=${val}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * PWA 앱 아이콘에 표시되는 숫자 배지(알림 숫자) 강제 제거
 */
export function clearAppBadge() {
    if (typeof window === "undefined") return;
    if ("clearAppBadge" in navigator) {
        try {
            (navigator as any).clearAppBadge().catch(() => {});
        } catch (_) {}
    }
}

/**
 * 로컬 시스템 알림 팝업 즉시 띄우기
 */
export async function displayLocalNotification(title: string, body: string, url: string = "/") {
    if (typeof window === "undefined") return;

    // 1. AndroidBridge / Android 네이티브 호출 확인
    const win = window as any;
    if (typeof win.AndroidBridge?.postNotification === "function") {
        try {
            win.AndroidBridge.postNotification(title, body);
            clearAppBadge();
            return;
        } catch (_) {}
    }
    if (typeof win.Android?.postNotification === "function") {
        try {
            win.Android.postNotification(title, body);
            clearAppBadge();
            return;
        } catch (_) {}
    }

    // 2. Service Worker showNotification 우선 시도
    if ("serviceWorker" in navigator) {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.showNotification) {
                await reg.showNotification(title, {
                    body,
                    icon: "/favicon-48x48.png",
                    data: { url },
                    tag: "sj-alert-" + Date.now()
                });
                // 푸시 알림만 띄우고 PWA 앱 아이콘에 별도 숫자(배지)가 표시되지 않도록 즉시 클리어
                clearAppBadge();
                setTimeout(clearAppBadge, 150);
                setTimeout(clearAppBadge, 500);
                setTimeout(clearAppBadge, 1200);
                return;
            }
        } catch (_) {}
    }

    // 3. 브라우저 표준 Notification 객체 폴백
    if (isNotificationSupported() && Notification.permission === "granted") {
        try {
            new Notification(title, {
                body,
                icon: "/favicon-48x48.png",
                tag: "sj-alert-" + Date.now()
            });
            clearAppBadge();
            setTimeout(clearAppBadge, 150);
            setTimeout(clearAppBadge, 500);
            return;
        } catch (_) {}
    }

    // 4. 최후 폴백: 토스트 메시지
    toast.info(title, { description: body });
}

export interface UserSubscriptionInfo {
    role: "student" | "teacher";
    grade?: number | string;
    classNum?: number | string;
    studentNumber?: number | string;
    studentName?: string;
    teacherName?: string;
}

/**
 * 사이트 접속 시 알림 권한 및 상태 서버 동기화
 */
export async function syncNotificationStatusOnConnect(info: UserSubscriptionInfo) {
    if (typeof window === "undefined") return;

    if (!isNotificationSupported()) return;

    // 1. 네이티브 앱 처리
    if (isNativeApp()) {
        const localEnabled = localStorage.getItem(NOTIF_ENABLED_KEY) === "1";
        setNotificationCookie(localEnabled);
        if (localEnabled) {
            try {
                const deviceId = getOrCreateDeviceId();
                await fetch("/api/notifications/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        deviceId,
                        role: info.role,
                        grade: Number(info.grade) || 0,
                        classNum: Number(info.classNum) || 0,
                        studentNumber: Number(info.studentNumber) || 0,
                        studentName: (info.studentName || "").trim(),
                        teacherName: (info.teacherName || "").trim(),
                        platform: "webview",
                        enabled: 1
                    })
                });
            } catch (_) {}
        }
        return;
    }

    // 2. 일반 웹/PWA 브라우저 처리
    const supported = typeof Notification !== "undefined";
    const perm = supported ? Notification.permission : "unsupported";
    const localEnabled = localStorage.getItem(NOTIF_ENABLED_KEY) === "1";

    // 권한이 revoked되었으면 로컬 및 쿠키도 OFF로 보정
    if (perm !== "granted" && localEnabled) {
        localStorage.setItem(NOTIF_ENABLED_KEY, "0");
        setNotificationCookie(false);
        return;
    }

    const isActive = perm === "granted" && localEnabled;
    setNotificationCookie(isActive);

    if (isActive) {
        // 백엔드에 최신 접속 기기/IP/구독 정보 ping
        try {
            const deviceId = getOrCreateDeviceId();
            await fetch("/api/notifications/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceId,
                    role: info.role,
                    grade: Number(info.grade) || 0,
                    classNum: Number(info.classNum) || 0,
                    studentNumber: Number(info.studentNumber) || 0,
                    studentName: (info.studentName || "").trim(),
                    teacherName: (info.teacherName || "").trim(),
                    platform: getCurrentPlatform(),
                    enabled: 1
                })
            });
        } catch (_) {}
    }
}

/**
 * 브라우저 및 플랫폼 호환 알림 권한 요청 헬퍼
 * - Promise / Callback / undefined 반환 환경(삼성 인터넷 등) 모두 대응
 * - 사용자가 시스템 팝업에서 '허용' 누르는 순간 즉시 감지 (100ms 폴링 + focus 이벤트)
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";

    if (Notification.permission !== "default") {
        return Notification.permission;
    }

    return new Promise<NotificationPermission>((resolve) => {
        let isDone = false;
        let timer: any = null;
        let timeoutTimer: any = null;

        const cleanup = () => {
            if (timer) clearInterval(timer);
            if (timeoutTimer) clearTimeout(timeoutTimer);
            window.removeEventListener("focus", onFocus);
        };

        const finish = (result?: any) => {
            if (isDone) return;
            isDone = true;
            cleanup();
            const finalPerm = (typeof Notification !== "undefined" && Notification.permission === "granted") || result === "granted"
                ? "granted"
                : (result || (typeof Notification !== "undefined" ? Notification.permission : "denied"));
            resolve(finalPerm);
        };

        // 1. 주기적 감시 (삼성 인터넷/안드로이드 등 비동기 콜백 누락 및 undefined 반환 방지)
        timer = setInterval(() => {
            if (typeof Notification !== "undefined" && Notification.permission !== "default") {
                finish(Notification.permission);
            }
        }, 100);

        // 2. 창 포커스 복귀 감지 (시스템 팝업 클릭 완료 즉시)
        const onFocus = () => {
            setTimeout(() => {
                if (typeof Notification !== "undefined" && Notification.permission !== "default") {
                    finish(Notification.permission);
                }
            }, 80);
        };
        window.addEventListener("focus", onFocus);

        // 3. 최대 45초 타임아웃 안전장치
        timeoutTimer = setTimeout(() => {
            finish(typeof Notification !== "undefined" ? Notification.permission : "default");
        }, 45000);

        // 4. 표준 API 호출 (Callback + Promise)
        try {
            const p = Notification.requestPermission((cbResult) => {
                if (cbResult) {
                    finish(cbResult);
                }
            });

            if (p && typeof (p as any).then === "function") {
                (p as any).then((promiseResult: any) => {
                    if (promiseResult) {
                        finish(promiseResult);
                    }
                }).catch(() => {
                    finish(Notification.permission);
                });
            }
        } catch (e) {
            console.warn("Notification.requestPermission error:", e);
        }
    });
}

/**
 * 알림 구독 스위치 토글 핸들러
 */
export async function toggleNotificationSubscription(
    targetEnabled: boolean,
    info: UserSubscriptionInfo
): Promise<{ success: boolean; enabled: boolean; reason?: string }> {
    if (typeof window === "undefined") return { success: false, enabled: false };

    const deviceId = getOrCreateDeviceId();

    if (!targetEnabled) {
        // 알림 끄기 (OFF)
        localStorage.setItem(NOTIF_ENABLED_KEY, "0");
        setNotificationCookie(false);

        try {
            await fetch("/api/notifications/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceId,
                    role: info.role,
                    grade: Number(info.grade) || 0,
                    classNum: Number(info.classNum) || 0,
                    studentNumber: Number(info.studentNumber) || 0,
                    studentName: (info.studentName || "").trim(),
                    teacherName: (info.teacherName || "").trim(),
                    platform: isNativeApp() ? "webview" : getCurrentPlatform(),
                    enabled: 0
                })
            });
        } catch (_) {}

        return { success: true, enabled: false };
    }

    // 알림 켜기 (ON)
    // 1. 지원 여부 점검
    if (!isNotificationSupported()) {
        // iOS Safari (비 PWA) 환경인지 확인
        const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
        if (agent.isIOS && !isStandalone) {
            return { success: false, enabled: false, reason: "ios_safari_needs_pwa" };
        }
        return { success: false, enabled: false, reason: "unsupported" };
    }

    // 2. 권한 요청 (네이티브 앱이 아닌 일반 웹/PWA 환경인 경우만 브라우저 권한 요청)
    if (!isNativeApp()) {
        let permission = typeof Notification !== "undefined" ? Notification.permission : "default";
        if (permission === "default") {
            permission = await requestNotificationPermission();
        }

        // 최신 상태 재확인 (허용 즉시 반영)
        if (permission !== "granted" && typeof Notification !== "undefined" && Notification.permission === "granted") {
            permission = "granted";
        }

        if (permission !== "granted") {
            localStorage.setItem(NOTIF_ENABLED_KEY, "0");
            setNotificationCookie(false);
            return { success: false, enabled: false, reason: "permission_denied" };
        }
    }

    // 3. 성공 시 로컬 및 쿠키 즉시 갱신 (지연 없이 즉각 완료 처리)
    localStorage.setItem(NOTIF_ENABLED_KEY, "1");
    setNotificationCookie(true);
    clearAppBadge();

    // 4. 백그라운드에서 서버 동기화 및 환영 알림 발송 (UI 블로킹 방지)
    (async () => {
        try {
            await fetch("/api/notifications/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceId,
                    role: info.role,
                    grade: Number(info.grade) || 0,
                    classNum: Number(info.classNum) || 0,
                    studentNumber: Number(info.studentNumber) || 0,
                    studentName: (info.studentName || "").trim(),
                    teacherName: (info.teacherName || "").trim(),
                    platform: isNativeApp() ? "webview" : getCurrentPlatform(),
                    enabled: 1
                })
            });
        } catch (e) {
            console.warn("Notification subscribe server sync error:", e);
        }

        const welcomeMsg = info.role === "teacher" 
            ? "교사용 수행평가 및 공지 알림을 정상적으로 수신합니다."
            : "새로운 수행평가 및 학사 일정이 등록되면 알려드립니다.";

        displayLocalNotification("🔔 수행 알림받기 설정 완료", welcomeMsg).catch(() => {});
    })();

    return { success: true, enabled: true };
}
