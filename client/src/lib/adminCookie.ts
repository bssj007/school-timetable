/**
 * adminCookie.ts
 *
 * 관리자(Admin) 페이지 비밀번호 전용 1일 만료 쿠키 유틸리티.
 * 브라우저 닫기/새로고침 후에도 24시간 동안 관리자 세션을 유지합니다.
 */

export const ADMIN_COOKIE_NAME = "admin_password";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24; // 1일 (24시간 = 86,400초)

/**
 * 1일 만료 쿠키에서 관리자 비밀번호 조회
 * (기본 키: admin_password, 하위 호환: sj_admin_password)
 */
export function getAdminPasswordCookie(): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/(?:^|;\s*)(?:admin_password|sj_admin_password)=([^;]*)/);
    if (match && match[1]) {
        try {
            return decodeURIComponent(match[1]);
        } catch {
            return match[1];
        }
    }
    return null;
}

/**
 * 관리자 비밀번호를 1일(24시간) 만료 쿠키에 저장
 * max-age 및 expires 둘 다 지정하여 브라우저 호환성 극대화
 */
export function setAdminPasswordCookie(password: string): void {
    if (typeof document === "undefined" || !password) return;
    const expires = new Date(Date.now() + ADMIN_COOKIE_MAX_AGE * 1000).toUTCString();
    document.cookie = `${ADMIN_COOKIE_NAME}=${encodeURIComponent(password)}; max-age=${ADMIN_COOKIE_MAX_AGE}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * 관리자 비밀번호 쿠키 즉시 삭제 (로그아웃 / 초기화 / 인증 실패 시)
 */
export function clearAdminPasswordCookie(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${ADMIN_COOKIE_NAME}=; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
    document.cookie = `sj_admin_password=; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}
