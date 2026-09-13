// client/src/lib/notificationService.ts
import { useState, useEffect, useCallback, useMemo } from "react";
import { agent, getInstalledAppType } from "./browserDetect";
import { toast } from "sonner";

const DEVICE_ID_KEY = "sj_device_id";
const NOTIF_ENABLED_KEY = "sj_notification_enabled";
const NOTIF_LAST_VIEWED_KEY = "sj_notif_last_viewed_time";
const NOTIF_READ_IDS_KEY = "sj_notif_read_ids";

/**
 * 클라이언트 로컬 스토리지 기준 읽은 알림 ID 목록 조회
 */
export function getClientReadNotificationIds(): Set<number> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(NOTIF_READ_IDS_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

/**
 * 클라이언트 로컬 스토리지 기준 마지막 알림 확인 일시
 */
export function getClientLastViewedNotificationTime(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(NOTIF_LAST_VIEWED_KEY);
}

/**
 * 알림 버튼 클릭 시 클라이언트 측에서 모든 알림을 읽음 처리
 */
export function markClientNotificationsAsRead(notifications: Array<{ id: number; createdAt?: string }>) {
    if (typeof window === "undefined") return;
    try {
        const currentIds = getClientReadNotificationIds();
        notifications.forEach(n => {
            if (n.id) currentIds.add(n.id);
        });
        const idsArray = Array.from(currentIds).slice(-200);
        localStorage.setItem(NOTIF_READ_IDS_KEY, JSON.stringify(idsArray));
        localStorage.setItem(NOTIF_LAST_VIEWED_KEY, new Date().toISOString());
        window.dispatchEvent(new CustomEvent("sj_notification_read_updated"));
    } catch (e) {
        console.warn("Failed to mark notifications as read locally", e);
    }
}

/**
 * 단일 알림 읽음 처리
 */
export function markClientSingleNotificationAsRead(notificationId: number) {
    if (typeof window === "undefined") return;
    try {
        const currentIds = getClientReadNotificationIds();
        currentIds.add(notificationId);
        const idsArray = Array.from(currentIds).slice(-200);
        localStorage.setItem(NOTIF_READ_IDS_KEY, JSON.stringify(idsArray));
        window.dispatchEvent(new CustomEvent("sj_notification_read_updated"));
    } catch (e) {
        console.warn("Failed to mark single notification as read locally", e);
    }
}

/**
 * 클라이언트 전용 미읽음 계산 로직
 * - 사용자의 로컬 읽음 목록(readIds)에 없는 알림은 모두 미읽음으로 계산하여 배지 표출
 * - 사용자가 알림 버튼을 클릭하여 markClientNotificationsAsRead가 호출되면 즉시 배지 제거
 * - 이후 신규 알림이 도착하면 ID가 readIds에 없으므로 자동으로 다시 배지 표출
 */
export function computeClientNotificationItems<T extends { id: number; createdAt?: string; read?: boolean }>(
    items: T[]
): { items: (T & { read: boolean })[]; unreadCount: number } {
    if (!items || items.length === 0) {
        return { items: [], unreadCount: 0 };
    }

    const readIds = getClientReadNotificationIds();

    const processed = items.map(item => {
        const isRead = readIds.has(item.id);
        return { ...item, read: isRead };
    });

    const unreadCount = processed.filter(it => !it.read).length;
    return { items: processed, unreadCount };
}

const BANNER_NOTIFIED_KEY = "sj_banner_notified_ids";

/**
 * 이번 브라우저 세션에서 이미 푸시/토스트 배너가 표출된 알림 ID 목록
 */
export function getSessionNotifiedBannerIds(): Set<number> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = sessionStorage.getItem(BANNER_NOTIFIED_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

/**
 * 배너 표출 완료된 알림 ID 기록 (세션 단위 중복 알림 방지)
 */
export function markSessionBannerNotified(id: number) {
    if (typeof window === "undefined") return;
    try {
        const set = getSessionNotifiedBannerIds();
        set.add(id);
        sessionStorage.setItem(BANNER_NOTIFIED_KEY, JSON.stringify(Array.from(set).slice(-100)));
    } catch (_) {}
}

/**
 * 클라이언트 측 알림 상태 관리 훅
 */
export function useClientNotificationState(serverNotifications: any[] = []) {
    const [readVersion, setReadVersion] = useState(0);

    useEffect(() => {
        const handleUpdate = () => setReadVersion(v => v + 1);
        window.addEventListener("sj_notification_read_updated", handleUpdate);
        window.addEventListener("storage", handleUpdate);
        return () => {
            window.removeEventListener("sj_notification_read_updated", handleUpdate);
            window.removeEventListener("storage", handleUpdate);
        };
    }, []);

    const { items, unreadCount } = useMemo(() => {
        return computeClientNotificationItems(serverNotifications);
    }, [serverNotifications, readVersion]);

    // 미읽음 알림 개수에 맞춰 모바일/PWA 앱 아이콘 배지 동기화
    useEffect(() => {
        updateAppBadge(unreadCount);
    }, [unreadCount]);

    const markAllRead = useCallback(() => {
        markClientNotificationsAsRead(serverNotifications);
    }, [serverNotifications]);

    const markSingleRead = useCallback((id: number) => {
        markClientSingleNotificationAsRead(id);
    }, []);

    return {
        items,
        unreadCount,
        markAllRead,
        markSingleRead
    };
}

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
    
    // 명시적으로 비활성화(0)한 경우는 제외
    const stored = localStorage.getItem(NOTIF_ENABLED_KEY);
    if (stored === "0") return false;

    // 1. 네이티브 앱 환경: 사용자가 명시적으로 끄지 않았다면 기본 활성
    if (isNativeApp()) {
        return true;
    }

    // 2. 웹/PWA 환경: 브라우저 알림 권한이 허용되어 있거나 명시적으로 켠 경우 활성
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        return true;
    }

    return stored === "1";
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
 * PWA 앱 아이콘 및 네이티브 앱 배지(숫자) 동기화
 */
export function updateAppBadge(count: number) {
    if (typeof window === "undefined") return;

    // 1. AndroidBridge / Android 네이티브 브리지 배지 연동
    const win = window as any;
    if (typeof win.AndroidBridge?.setBadge === "function") {
        try { win.AndroidBridge.setBadge(count); } catch (_) {}
    } else if (typeof win.Android?.setBadge === "function") {
        try { win.Android.setBadge(count); } catch (_) {}
    } else if (typeof win.AndroidBridge?.setAppBadge === "function") {
        try { win.AndroidBridge.setAppBadge(count); } catch (_) {}
    } else if (typeof win.Android?.setAppBadge === "function") {
        try { win.Android.setAppBadge(count); } catch (_) {}
    }

    // 2. 표준 Badging API (PWA, Chrome, Edge, Safari iOS 16.4+)
    if (count > 0) {
        if ("setAppBadge" in navigator) {
            try {
                (navigator as any).setAppBadge(count).catch(() => {});
            } catch (_) {}
        }
    } else {
        clearAppBadge();
    }
}

/**
 * PWA 앱 아이콘 및 네이티브 앱 배지 제거
 */
export function clearAppBadge() {
    if (typeof window === "undefined") return;
    const win = window as any;
    if (typeof win.AndroidBridge?.clearBadge === "function") {
        try { win.AndroidBridge.clearBadge(); } catch (_) {}
    } else if (typeof win.Android?.clearBadge === "function") {
        try { win.Android.clearBadge(); } catch (_) {}
    }

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
    if (typeof window === "undefined") return false;

    // 1. AndroidBridge / Android 네이티브 호출 확인
    const win = window as any;
    if (typeof win.AndroidBridge?.postNotification === "function") {
        try {
            win.AndroidBridge.postNotification(title, body);
            return true;
        } catch (_) {}
    }
    if (typeof win.Android?.postNotification === "function") {
        try {
            win.Android.postNotification(title, body);
            return true;
        } catch (_) {}
    }

    // 2. Service Worker showNotification 우선 시도 (데드락 방지 250ms 타임아웃 레이스)
    let shown = false;
    if ("serviceWorker" in navigator && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
            const readyPromise = navigator.serviceWorker.ready.catch(() => null);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 250));
            const reg = (await Promise.race([readyPromise, timeoutPromise])) as ServiceWorkerRegistration | null
                || (await navigator.serviceWorker.getRegistration().catch(() => null));

            if (reg && reg.showNotification) {
                await reg.showNotification(title, {
                    body,
                    icon: "/favicon-48x48.png",
                    badge: "/favicon-48x48.png",
                    data: { url },
                    tag: "sj-alert-" + Date.now()
                });
                shown = true;
                return true;
            }
        } catch (_) {}
    }

    // 3. 브라우저 표준 Notification 객체 폴백
    if (!shown && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
            const notif = new Notification(title, {
                body,
                icon: "/favicon-48x48.png",
                tag: "sj-alert-" + Date.now()
            });
            notif.onclick = () => {
                window.focus();
                if (url && url !== "/") {
                    window.location.href = url;
                }
            };
            shown = true;
            return true;
        } catch (_) {}
    }

    // 4. 최후 폴백: 인앱 토스트 배너 (Sonner)
    try {
        toast.info(title, {
            description: body,
            duration: 6000,
            action: url && url !== "/" ? {
                label: "이동",
                onClick: () => { window.location.href = url; }
            } : undefined
        });
        return true;
    } catch (_) {
        return false;
    }
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
