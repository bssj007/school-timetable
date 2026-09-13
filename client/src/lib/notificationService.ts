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
 * 브라우저 환경의 알림 지원 여부 확인
 */
export function isNotificationSupported(): boolean {
    if (typeof window === "undefined") return false;
    return "Notification" in window;
}

/**
 * 현재 기기의 알림 권한 상태 반환
 */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
    if (!isNotificationSupported()) return "unsupported";
    return Notification.permission;
}

/**
 * 사용자가 현재 수행 알림받기를 활성화(ON)했는지 여부
 */
export function isNotificationSubscribed(): boolean {
    if (typeof window === "undefined") return false;
    if (!isNotificationSupported()) return false;
    return (
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
 * 로컬 시스템 알림 팝업 즉시 띄우기
 */
export async function displayLocalNotification(title: string, body: string, url: string = "/") {
    if (typeof window === "undefined") return;

    // 1. AndroidBridge 네이티브 호출 확인
    const win = window as any;
    if (typeof win.AndroidBridge?.postNotification === "function") {
        try {
            win.AndroidBridge.postNotification(title, body);
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
                    badge: "/favicon-32x32.png",
                    data: { url },
                    tag: "sj-alert-" + Date.now()
                });
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

    const supported = isNotificationSupported();
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
                    platform: getCurrentPlatform(),
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

    // 2. 권한 요청
    let permission = Notification.permission;
    if (permission === "default") {
        try {
            permission = await Notification.requestPermission();
        } catch (e) {
            console.error("Notification permission error:", e);
        }
    }

    if (permission !== "granted") {
        localStorage.setItem(NOTIF_ENABLED_KEY, "0");
        setNotificationCookie(false);
        return { success: false, enabled: false, reason: "permission_denied" };
    }

    // 3. 성공 시 로컬 및 서버 등록
    localStorage.setItem(NOTIF_ENABLED_KEY, "1");
    setNotificationCookie(true);

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
                platform: getCurrentPlatform(),
                enabled: 1
            })
        });
    } catch (e) {
        console.warn("Notification subscribe server sync error:", e);
    }

    // 4. 환영 알림 발송
    const welcomeMsg = info.role === "teacher" 
        ? "교사용 수행평가 및 공지 알림을 정상적으로 수신합니다."
        : "새로운 수행평가 및 학사 일정이 등록되면 알려드립니다.";

    await displayLocalNotification("🔔 수행 알림받기 설정 완료", welcomeMsg);

    return { success: true, enabled: true };
}
