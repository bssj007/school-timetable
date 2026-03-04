/**
 * 자동 오류 보고 유틸리티
 * 치명적 오류 발생 시 자동으로 /api/bug-reports에 등록합니다.
 */

const COOKIE_NAME = "school_timetable_config";
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5분 중복 방지
const recentlyReported = new Map<string, number>();

/** 쿠키에서 유저 설정(grade, classNum, studentNumber)을 읽어옵니다 */
function getUserConfigFromCookie(): { grade?: string; classNum?: string; studentNumber?: string } {
    try {
        const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
        if (match) {
            const parsed = JSON.parse(decodeURIComponent(match[2]));
            return {
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
    const lastReported = recentlyReported.get(key);
    if (lastReported && now - lastReported < DEDUP_WINDOW_MS) {
        return false;
    }
    recentlyReported.set(key, now);
    return true;
}

/** 오류 정보를 /api/bug-reports에 자동으로 POST합니다 */
export async function reportErrorToBugApi(error: {
    message: string;
    stack?: string;
    source?: string;
}) {
    try {
        const dedupKey = error.message || "unknown";
        if (!shouldReport(dedupKey)) return;

        const { grade, classNum, studentNumber } = getUserConfigFromCookie();
        const location = window.location.pathname + window.location.hash;

        const lines = [
            `[자동오류보고]`,
            `페이지: ${location}`,
            `오류: ${error.message}`,
        ];
        if (error.source) lines.push(`출처: ${error.source}`);
        if (error.stack) lines.push(`\n--- Stack Trace ---\n${error.stack}`);

        const message = lines.join("\n");

        await fetch("/api/bug-reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grade, classNum, studentNumber, message }),
        });

        console.info("[AutoErrorReporter] 오류가 자동으로 제보되었습니다.");
    } catch {
        // API 호출 실패 시 무시 (무한 루프 방지)
    }
}

/** 글로벌 오류 핸들러를 등록합니다 (앱 시작 시 1회 호출) */
export function initGlobalErrorHandlers() {
    // JS 런타임 오류
    window.onerror = (message, source, lineno, colno, error) => {
        reportErrorToBugApi({
            message: String(message),
            stack: error?.stack || `at ${source}:${lineno}:${colno}`,
            source: source ? `${source}:${lineno}:${colno}` : undefined,
        });
        // 기본 동작(콘솔 출력)은 유지
        return false;
    };

    // 미처리 Promise rejection
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        reportErrorToBugApi({
            message: reason?.message || String(reason) || "Unhandled Promise Rejection",
            stack: reason?.stack,
            source: "unhandledrejection",
        });
    });
}
