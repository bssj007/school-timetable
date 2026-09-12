/**
 * 자동 오류 보고 유틸리티
 * 치명적 오류 및 D1/SQLite 오류 발생 시 자동으로 /api/bug-reports에 등록합니다.
 */

import { toast } from "sonner";

const COOKIE_NAME = "school_timetable_config";
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5분 중복 방지
const recentlyReported = new Map<string, number>();

/** D1 / SQLite 데이터베이스 관련 오류인지 감지합니다 */
export function isD1SqliteError(content: any): boolean {
    if (!content) return false;
    let str = "";
    if (typeof content === "string") {
        str = content;
    } else if (content instanceof Error) {
        str = `${content.name} ${content.message} ${content.stack || ''}`;
    } else if (typeof content === "object") {
        try {
            str = JSON.stringify(content);
        } catch {
            str = String(content);
        }
    } else {
        str = String(content);
    }

    const lower = str.toLowerCase();
    return (
        lower.includes("d1_error") ||
        lower.includes("sqlite_error") ||
        lower.includes("d1_exec_error") ||
        lower.includes("no such column") ||
        lower.includes("no such table") ||
        lower.includes("sqlite_constraint") ||
        lower.includes("unique constraint failed") ||
        lower.includes("database is locked") ||
        lower.includes("sqlite_corrupt") ||
        lower.includes("sqlite_busy") ||
        (lower.includes("sqlite") && lower.includes("error")) ||
        (lower.includes("d1") && lower.includes("error"))
    );
}

/** 쿠키에서 유저 설정(studentName, grade, classNum, studentNumber)을 읽어옵니다 */
function getUserConfigFromCookie(): { studentName?: string; grade?: string; classNum?: string; studentNumber?: string } {
    try {
        const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
        if (match) {
            const parsed = JSON.parse(decodeURIComponent(match[2]));
            return {
                studentName: parsed.studentName || undefined,
                grade: parsed.grade || undefined,
                classNum: parsed.classNum || undefined,
                studentNumber: parsed.studentNumber || undefined,
            };
        }
    } catch { /* ignore */ }
    return {};
}

/** 중복 여부를 확인하고, 중복이 아니면 true를 반환합니다 */
function shouldReport(key: string): boolean {
    const now = Date.now();
    // 오류 메시지 앞단 150글자 기반 정규화된 디둡 키 생성
    const normKey = key.trim().slice(0, 150);
    const lastReported = recentlyReported.get(normKey);
    if (lastReported && now - lastReported < DEDUP_WINDOW_MS) {
        return false;
    }
    recentlyReported.set(normKey, now);
    return true;
}

/** 오류 정보를 /api/bug-reports에 자동으로 POST합니다 */
export async function reportErrorToBugApi(error: {
    message: string;
    stack?: string;
    source?: string;
    isFatal?: boolean;
}) {
    try {
        const dedupKey = error.message || "unknown";
        if (!shouldReport(dedupKey)) return;

        const { studentName, grade, classNum, studentNumber } = getUserConfigFromCookie();
        const location = typeof window !== "undefined" ? (window.location.pathname + window.location.hash) : "";

        const isD1 = isD1SqliteError(error.message) || isD1SqliteError(error.stack) || isD1SqliteError(error.source);
        const isFatal = Boolean(error.isFatal || (error.source && error.source.toLowerCase().includes("errorboundary")));
        const headerTag = isFatal
            ? `[치명적 오류보고 (unexpected error occurred)]`
            : (isD1 ? `[D1/SQLite 자동오류보고]` : `[자동오류보고]`);

        const lines = [
            headerTag,
            `페이지: ${location}`,
            `오류: ${error.message}`,
        ];
        if (error.source) lines.push(`출처: ${error.source}`);
        if (error.stack) lines.push(`\n--- Stack Trace ---\n${error.stack}`);

        const message = lines.join("\n");

        await fetch("/api/bug-reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentName, grade, classNum, studentNumber, message }),
        });

        console.info(`[AutoErrorReporter] ${isD1 ? "D1/SQLite" : "치명적"} 오류가 자동으로 제보되었습니다.`);
    } catch {
        // API 호출 실패 시 무시 (무한 루프 방지)
    }
}

/** D1/SQLite 오류인지 판별하여 맞으면 즉시 자동 제보합니다 */
export async function checkAndReportD1Error(errorOrMessage: any, source?: string) {
    if (!isD1SqliteError(errorOrMessage)) return;

    let msg = "";
    let stack: string | undefined = undefined;

    if (errorOrMessage instanceof Error) {
        msg = errorOrMessage.message;
        stack = errorOrMessage.stack;
    } else if (typeof errorOrMessage === "string") {
        msg = errorOrMessage;
    } else if (typeof errorOrMessage === "object") {
        msg = errorOrMessage?.message || errorOrMessage?.error || JSON.stringify(errorOrMessage);
        stack = errorOrMessage?.stack;
    } else {
        msg = String(errorOrMessage);
    }

    await reportErrorToBugApi({
        message: msg,
        stack,
        source: source || "D1/SQLite Detection",
    });
}

let isInitialized = false;

/** 글로벌 오류 핸들러 및 D1 SQLite 자동 감지 인터셉터를 등록합니다 (앱 시작 시 1회 호출) */
export function initGlobalErrorHandlers() {
    if (typeof window === "undefined" || isInitialized) return;
    isInitialized = true;

    // 1. JS 런타임 오류
    const originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
        reportErrorToBugApi({
            message: String(message),
            stack: error?.stack || `at ${source}:${lineno}:${colno}`,
            source: source ? `${source}:${lineno}:${colno}` : undefined,
        });
        if (originalOnError) {
            return originalOnError(message, source, lineno, colno, error);
        }
        return false;
    };

    // 2. 미처리 Promise rejection
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        reportErrorToBugApi({
            message: reason?.message || String(reason) || "Unhandled Promise Rejection",
            stack: reason?.stack,
            source: "unhandledrejection",
        });
    });

    // 3. 글로벌 Fetch 인터셉터 (API 응답 중 D1 / SQLite 오류 자동 감지)
    const originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof originalFetch>) {
        const response = await originalFetch.apply(this, args);
        try {
            const firstArg = args[0];
            const urlStr = typeof firstArg === "string"
                ? firstArg
                : (firstArg instanceof Request ? firstArg.url : String(firstArg));

            // 버그 리포트 제출 API 호출 자체는 인터셉트하지 않음 (무한 루프 원천 방지)
            if (!urlStr.includes("/api/bug-reports")) {
                if (!response.ok || response.status >= 400) {
                    const clone = response.clone();
                    clone.text().then(text => {
                        if (isD1SqliteError(text)) {
                            let parsedMsg = text;
                            try {
                                const json = JSON.parse(text);
                                if (json.error) parsedMsg = json.error;
                            } catch (_) {}
                            checkAndReportD1Error(parsedMsg, `API Fetch (${response.status}) ${urlStr}`);
                        }
                    }).catch(() => {});
                }
            }
        } catch (_) {}
        return response;
    };

    // 4. Sonner Toast UI 인터셉터 (toast.error에 D1/SQLite 오류가 전달되면 자동 감지)
    try {
        const originalToastError = toast.error;
        toast.error = function (message: any, data?: any) {
            checkAndReportD1Error(message, "UI 알림 (Toast.error)");
            return originalToastError(message, data);
        };
    } catch (e) {
        console.warn("[AutoErrorReporter] Failed to wrap toast.error:", e);
    }
}
