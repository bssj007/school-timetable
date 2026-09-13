// client/src/lib/notificationService.ts
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const DEVICE_ID_KEY = "sj_device_id";
const NOTIF_ENABLED_KEY = "sj_notification_enabled";
const NOTIF_LAST_VIEWED_KEY = "sj_notif_last_viewed_time";
const NOTIF_READ_IDS_KEY = "sj_notif_read_ids";

const DEFAULT_VAPID_PUBLIC_KEY =
    "BGhRyV8sLTVNkaVOgJDVulv0aMNOpCljPB4Bv2EEqBBvTJWfTeSwB7t_Kj9VA7N2mQTPfnNUczO51ZQGVm3VE3E";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

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
 */
export function computeClientNotificationItems<T extends { id: number; createdAt?: string; read?: boolean }>(
    items: T[]
): { items: (T & { read: boolean })[]; unreadCount: number } {
    if (!items || items.length === 0) {
        return { items: [], unreadCount: 0 };
    }

    const readIds = getClientReadNotificationIds();
    const processed = items.map(item => {
        const isRead = readIds.has(item.id) || Boolean(item.read);
        return { ...item, read: isRead };
    });

    const unreadCount = processed.filter(it => !it.read).length;
    return { items: processed, unreadCount };
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
 * 네이티브 앱 (Android WebView, AndroidBridge 환경) 판별
 */
export function isNativeApp(): boolean {
    if (typeof window === "undefined") return false;
    const win = window as any;
    return Boolean(win.AndroidBridge || win.Android || win.schoolTimetableApp || win.ReactNativeWebView || win.flutter_inappwebview);
}

/**
 * PWA (홈 화면에 설치된 독립 실행형 웹앱) 판별
 */
export function isPWA(): boolean {
    if (typeof window === "undefined") return false;
    const isStandaloneMode = window.matchMedia("(display-mode: standalone)").matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    return Boolean(isStandaloneMode || isIOSStandalone);
}

/**
 * 푸시 알림 기능 지원 여부 확인
 * - 사용자 요구사항: "현재 PWA와 네이티브 앱만 고려하여 개발하고 브라우저는 고려 사항에서 제외한다."
 * - 네이티브 앱(AndroidBridge) 또는 PWA 환경에서만 true를 반환
 */
export function isNotificationSupported(): boolean {
    if (typeof window === "undefined") return false;
    if (isNativeApp()) return true;
    if (isPWA()) {
        return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    }
    // 일반 브라우저: 푸시 알림 미지원 (헤더 알림함 조회 전용)
    return false;
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

    const stored = localStorage.getItem(NOTIF_ENABLED_KEY);
    if (stored === "0") return false;

    // 1. 네이티브 앱 환경: 사용자가 명시적으로 끄지 않았다면 기본 활성
    if (isNativeApp()) {
        return true;
    }

    // 2. PWA 환경: 브라우저 알림 권한 허용 여부와 로컬 설정 검사
    if (isPWA()) {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            return stored !== "0";
        }
    }

    return stored === "1";
}

/**
 * PWA 앱 아이콘 및 네이티브 앱 배지(숫자) 동기화
 */
export function updateAppBadge(count: number) {
    if (typeof window === "undefined") return;

    const win = window as any;
    if (typeof win.AndroidBridge?.setBadge === "function") {
        try { win.AndroidBridge.setBadge(count); } catch (_) {}
    } else if (typeof win.AndroidBridge?.setAppBadge === "function") {
        try { win.AndroidBridge.setAppBadge(count); } catch (_) {}
    }

    if (count > 0) {
        if ("setAppBadge" in navigator) {
            try { (navigator as any).setAppBadge(count).catch(() => {}); } catch (_) {}
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
    }
    if ("clearAppBadge" in navigator) {
        try { (navigator as any).clearAppBadge().catch(() => {}); } catch (_) {}
    }
}

/**
 * PWA PushManager 구독 생성 또는 기존 구독 조회
 */
async function getOrRegisterPushSubscription(): Promise<PushSubscription | null> {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            const applicationServerKey = urlBase64ToUint8Array(DEFAULT_VAPID_PUBLIC_KEY);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey as any
            });
        }
        return subscription;
    } catch (err) {
        console.warn("[notificationService] Push subscription registration error:", err);
        return null;
    }
}

export interface UserSubscriptionProfile {
    role: "student" | "teacher";
    grade?: number | string;
    classNum?: number | string;
    studentNumber?: number | string;
    studentName?: string;
    teacherName?: string;
}

/**
 * 앱 접속 시 구독 상태 및 사용자 프로필 동기화
 */
export async function syncNotificationStatusOnConnect(profile: UserSubscriptionProfile) {
    if (typeof window === "undefined") return;

    // 일반 브라우저는 푸시 대상 제외이므로 서버 구독 동기화 건너뜀
    if (!isNotificationSupported()) return;

    const deviceId = getOrCreateDeviceId();
    const isEnabled = isNotificationSubscribed();

    // 1. 네이티브 앱: AndroidBridge 동기화
    const win = window as any;
    const bridgeData = {
        deviceId,
        role: profile.role,
        grade: Number(profile.grade) || 0,
        classNum: Number(profile.classNum) || 0,
        studentNumber: Number(profile.studentNumber) || 0,
        studentName: (profile.studentName || "").trim(),
        teacherName: (profile.teacherName || "").trim(),
        enabled: isEnabled
    };
    if (typeof win.AndroidBridge?.syncUserSubscription === "function") {
        try { win.AndroidBridge.syncUserSubscription(JSON.stringify(bridgeData)); } catch (_) {}
    }

    // 2. PWA 환경: 활성화 상태일 경우 서버 구독 정보 갱신
    if (isPWA() && isEnabled) {
        try {
            let pushSubStr = "";
            const sub = await getOrRegisterPushSubscription();
            if (sub) {
                pushSubStr = JSON.stringify(sub.toJSON());
            }

            await fetch("/api/notifications/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceId,
                    role: profile.role,
                    grade: Number(profile.grade) || 0,
                    classNum: Number(profile.classNum) || 0,
                    studentNumber: Number(profile.studentNumber) || 0,
                    studentName: (profile.studentName || "").trim(),
                    teacherName: (profile.teacherName || "").trim(),
                    platform: "pwa",
                    pushSubscription: pushSubStr,
                    enabled: 1
                })
            });
        } catch (_) {}
    }
}

/**
 * 알림 구독 ON/OFF 토글
 * - toggleNotificationSubscription(checked, profile) 및 toggleNotificationSubscription(profile, checked) 양방향 지원
 */
export async function toggleNotificationSubscription(
    arg1: boolean | UserSubscriptionProfile,
    arg2?: UserSubscriptionProfile | boolean
): Promise<{ success: boolean; enabled: boolean; reason?: string }> {
    if (typeof window === "undefined") return { success: false, enabled: false };

    let targetState: boolean | undefined = undefined;
    let profile: UserSubscriptionProfile;

    if (typeof arg1 === "boolean") {
        targetState = arg1;
        profile = (arg2 as UserSubscriptionProfile) || { role: "student" };
    } else {
        profile = arg1 || { role: "student" };
        if (typeof arg2 === "boolean") {
            targetState = arg2;
        }
    }

    // 일반 브라우저는 푸시를 지원하지 않음
    if (!isNotificationSupported()) {
        return { success: false, enabled: false, reason: "browser_not_supported" };
    }

    const currentState = isNotificationSubscribed();
    const nextState = targetState !== undefined ? targetState : !currentState;
    const deviceId = getOrCreateDeviceId();

    // 알림 끄기 (OFF)
    if (!nextState) {
        localStorage.setItem(NOTIF_ENABLED_KEY, "0");

        // 네이티브 앱 브릿지 동기화
        const win = window as any;
        const bridgeData = {
            deviceId,
            role: profile.role,
            grade: Number(profile.grade) || 0,
            classNum: Number(profile.classNum) || 0,
            studentNumber: Number(profile.studentNumber) || 0,
            studentName: (profile.studentName || "").trim(),
            teacherName: (profile.teacherName || "").trim(),
            enabled: false
        };
        if (typeof win.AndroidBridge?.syncUserSubscription === "function") {
            try { win.AndroidBridge.syncUserSubscription(JSON.stringify(bridgeData)); } catch (_) {}
        }

        // PWA Push 해제
        if (isPWA()) {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (sub) await sub.unsubscribe();
            } catch (_) {}

            try {
                await fetch("/api/notifications/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        deviceId,
                        role: profile.role,
                        platform: "pwa",
                        enabled: 0
                    })
                });
            } catch (_) {}
        }

        return { success: true, enabled: false };
    }

    // 알림 켜기 (ON)
    // 0. 서버 마스터 스위치 확인
    try {
        const statusRes = await fetch("/api/notifications/status", { cache: "no-store" });
        if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData && statusData.systemEnabled === false) {
                return { success: false, enabled: false, reason: "system_disabled" };
            }
        }
    } catch (_) {}

    // 1. PWA 권한 요청
    if (isPWA()) {
        let permission = typeof Notification !== "undefined" ? Notification.permission : "default";
        if (permission === "default") {
            permission = await Notification.requestPermission();
        }

        if (permission !== "granted") {
            localStorage.setItem(NOTIF_ENABLED_KEY, "0");
            return { success: false, enabled: false, reason: "permission_denied" };
        }
    }

    localStorage.setItem(NOTIF_ENABLED_KEY, "1");

    // 2. 네이티브 앱 브릿지 동기화
    const win = window as any;
    const bridgeData = {
        deviceId,
        role: profile.role,
        grade: Number(profile.grade) || 0,
        classNum: Number(profile.classNum) || 0,
        studentNumber: Number(profile.studentNumber) || 0,
        studentName: (profile.studentName || "").trim(),
        teacherName: (profile.teacherName || "").trim(),
        enabled: true
    };
    if (typeof win.AndroidBridge?.syncUserSubscription === "function") {
        try { win.AndroidBridge.syncUserSubscription(JSON.stringify(bridgeData)); } catch (_) {}
    }

    // 3. PWA PushManager 등록 및 서버 전송
    if (isPWA()) {
        try {
            const sub = await getOrRegisterPushSubscription();
            const pushSubStr = sub ? JSON.stringify(sub.toJSON()) : "";

            await fetch("/api/notifications/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceId,
                    role: profile.role,
                    grade: Number(profile.grade) || 0,
                    classNum: Number(profile.classNum) || 0,
                    studentNumber: Number(profile.studentNumber) || 0,
                    studentName: (profile.studentName || "").trim(),
                    teacherName: (profile.teacherName || "").trim(),
                    platform: "pwa",
                    pushSubscription: pushSubStr,
                    enabled: 1
                })
            });
        } catch (e) {
            console.warn("[toggleNotificationSubscription] Server sync error:", e);
        }
    }

    return { success: true, enabled: true };
}

export interface GlobalNotificationWatcherProps {
    role?: "student" | "teacher" | null;
    grade?: number | string;
    classNum?: number | string;
    studentNumber?: number | string;
    studentName?: string;
    teacherName?: string | null;
}

/**
 * 알림 쿼리 키 생성기
 */
export function getNotificationQueryKey(
    role: "student" | "teacher" | null | undefined,
    info: {
        grade?: number | string;
        classNum?: number | string;
        studentNumber?: number | string;
        studentName?: string;
        teacherName?: string | null;
    },
    deviceId: string
) {
    const effectiveRole = role === "teacher" ? "teacher" : "student";
    const targetKey = effectiveRole === "teacher"
        ? (info.teacherName || "")
        : `${info.grade || "0"}-${info.classNum || "0"}-${info.studentNumber || "0"}-${info.studentName || ""}`;
    return ["notifications", effectiveRole, targetKey, deviceId] as const;
}

/**
 * 전역 알림 감시 훅
 * - 앱 진입 시 또는 포그라운드 사용 중 시스템 알림이나 인앱 토스트를 일절 발생시키지 않습니다.
 * - 오직 서버의 알림 목록 및 미읽음 배지(unreadCount)만 조용히 동기화합니다.
 */
export function useGlobalNotificationWatcher(info: GlobalNotificationWatcherProps) {
    const queryClient = useQueryClient();
    const deviceId = useMemo(() => getOrCreateDeviceId(), []);

    const effectiveRole = info.role || "student";
    const queryKey = getNotificationQueryKey(effectiveRole, info, deviceId);

    const notificationsQuery = useQuery({
        queryKey,
        queryFn: async () => {
            const sp = new URLSearchParams({
                role: effectiveRole,
                grade: String(info.grade || "0"),
                classNum: String(info.classNum || "0"),
                studentNumber: String(info.studentNumber || "0"),
                studentName: String(info.studentName || ""),
                teacherName: String(info.teacherName || ""),
                deviceId,
                _t: String(Date.now())
            });
            const res = await fetch(`/api/notifications/list?${sp.toString()}`, {
                cache: "no-store",
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                }
            });
            if (!res.ok) throw new Error("Failed to fetch notifications");
            return res.json();
        },
        refetchInterval: 60000, // 1분 주기 안전 폴링
        staleTime: 5000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true
    });

    // 1. 화면 복귀 및 서비스 워커 푸시 수신 시 즉각 캐시 무효화
    useEffect(() => {
        const handleWakeup = () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        };

        const handleSwMessage = (e: MessageEvent) => {
            if (e.data && e.data.type === "PUSH_NOTIFICATION_RECEIVED") {
                queryClient.invalidateQueries({ queryKey: ["notifications"] });
            }
        };

        document.addEventListener("visibilitychange", handleWakeup);
        window.addEventListener("focus", handleWakeup);
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.addEventListener("message", handleSwMessage);
        }

        return () => {
            document.removeEventListener("visibilitychange", handleWakeup);
            window.removeEventListener("focus", handleWakeup);
            if ("serviceWorker" in navigator) {
                navigator.serviceWorker.removeEventListener("message", handleSwMessage);
            }
        };
    }, [queryClient]);

    // 2. 접속 시 구독 상태 동기화 (PWA / 네이티브 앱)
    useEffect(() => {
        syncNotificationStatusOnConnect({
            role: effectiveRole,
            grade: info.grade,
            classNum: info.classNum,
            studentNumber: info.studentNumber,
            studentName: info.studentName,
            teacherName: info.teacherName || undefined
        });
    }, [effectiveRole, info.grade, info.classNum, info.studentNumber, info.studentName, info.teacherName]);

    return notificationsQuery;
}
