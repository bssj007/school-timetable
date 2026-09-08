/**
 * teacherUtils.ts
 *
 * 교사 관련 쿠키/localStorage 순수 유틸 함수 모음.
 * 이 파일은 React 컴포넌트나 Context를 일절 import하지 않아야 한다 (순환 의존성 방지).
 */

// ── 쿠키 키 상수 ─────────────────────────────────────────────
export const ROLE_COOKIE = "sj_user_role";
export const TEACHER_COOKIE = "sj_teacher_name";
export const AUTH_TEACHER_KEY = "sj_authenticated_teacher";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10년

// ── 쿠키 읽기 ────────────────────────────────────────────────
export function getRoleCookie(): string | null {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(new RegExp("(^| )" + ROLE_COOKIE + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
}

export function getTeacherNameCookie(): string | null {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(new RegExp("(^| )" + TEACHER_COOKIE + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
}

// ── 쿠키 쓰기 ────────────────────────────────────────────────
export function setRoleCookie(role: "student" | "teacher") {
    if (typeof document === "undefined") return;
    document.cookie = `${ROLE_COOKIE}=${role}; max-age=${COOKIE_MAX_AGE}; path=/`;
}

export function setTeacherNameCookie(name: string) {
    if (typeof document === "undefined") return;
    document.cookie = `${TEACHER_COOKIE}=${encodeURIComponent(name)}; max-age=${COOKIE_MAX_AGE}; path=/`;
}

export function clearRoleCookie() {
    if (typeof document === "undefined") return;
    document.cookie = `${ROLE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    // 학생/선생님 프로필(TEACHER_COOKIE, 교사 비밀번호, 학생 설정)은 절대 삭제하지 않음
}

export function clearTeacherCookie() {
    if (typeof document === "undefined") return;
    document.cookie = `${TEACHER_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}

// ── 이름 정규화 ───────────────────────────────────────────────
export function normalizeTeacherName(name: string | null | undefined): string {
    if (!name) return '';
    return name.trim().replace(/선생님$/, '').replace(/\*+$/, '').trim();
}

// ── 인증 교사 (localStorage) ──────────────────────────────────
/** 현재 클라이언트에 비밀번호 인증이 완료된 단일 선생님 이름 반환 */
export function getAuthenticatedTeacher(): string | null {
    if (typeof localStorage === "undefined") return null;
    const auth = localStorage.getItem(AUTH_TEACHER_KEY);
    return auth ? normalizeTeacherName(auth) : null;
}

/**
 * 자동 접속 교사 결정 규칙:
 * 1. 로그인 된 교사(getAuthenticatedTeacher)가 있다면 무조건 그 교사명 반환 (최근 선택 교사 무시)
 * 2. 로그인 된 교사가 없다면 가장 최근 선택했던 교사(쿠키 또는 last_selected_teacher_name) 반환
 */
export function getActiveTeacherName(): string | null {
    const authTeacher = getAuthenticatedTeacher();
    if (authTeacher) {
        return authTeacher;
    }
    const recent =
        getTeacherNameCookie() ||
        (typeof localStorage !== "undefined"
            ? localStorage.getItem("last_selected_teacher_name")
            : null);
    return recent ? normalizeTeacherName(recent) : null;
}

// ── 비밀번호 저장/조회/삭제 ───────────────────────────────────
export function getStoredTeacherPassword(teacherName?: string): string | null {
    if (typeof localStorage === "undefined") return null;
    const authTeacher = localStorage.getItem(AUTH_TEACHER_KEY);
    if (!authTeacher) return null;
    const cleanAuth = normalizeTeacherName(authTeacher);

    if (teacherName) {
        const cleanRequested = normalizeTeacherName(teacherName);
        if (cleanRequested !== cleanAuth) return null;
    }

    try {
        const raw =
            localStorage.getItem(`teacher-pw-${cleanAuth}`) ??
            localStorage.getItem(`teacher-pw-${authTeacher}`) ??
            localStorage.getItem(`teacher-pw-${cleanAuth}*`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return typeof parsed?.password === 'string' ? parsed.password : null;
    } catch {
        return null;
    }
}

export function setStoredTeacherPassword(teacherName: string, password: string): void {
    if (typeof localStorage === "undefined" || !teacherName) return;
    const clean = normalizeTeacherName(teacherName);
    const rawTrimmed = teacherName.trim().replace(/선생님$/, '').trim();

    // 단일 교사 인증 보장: 이전의 모든 교사 인증정보 삭제
    clearStoredTeacherPassword();

    localStorage.setItem(AUTH_TEACHER_KEY, clean);
    const payload = JSON.stringify({
        password: password.trim(),
        savedAt: Date.now(),
    });
    localStorage.setItem(`teacher-pw-${clean}`, payload);
    if (rawTrimmed && rawTrimmed !== clean) {
        localStorage.setItem(`teacher-pw-${rawTrimmed}`, payload);
    }
    localStorage.setItem(`teacher-pw-${clean}*`, payload);
}

export function clearStoredTeacherPassword(teacherName?: string): void {
    if (typeof localStorage === "undefined") return;
    if (teacherName) {
        const clean = normalizeTeacherName(teacherName);
        const rawTrimmed = teacherName.trim().replace(/선생님$/, '').trim();
        const currentAuth = localStorage.getItem(AUTH_TEACHER_KEY);
        if (currentAuth && normalizeTeacherName(currentAuth) === clean) {
            localStorage.removeItem(AUTH_TEACHER_KEY);
        }
        localStorage.removeItem(`teacher-pw-${clean}`);
        localStorage.removeItem(`teacher-pw-${rawTrimmed}`);
        localStorage.removeItem(`teacher-pw-${clean}*`);
    } else {
        localStorage.removeItem(AUTH_TEACHER_KEY);
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('teacher-pw-')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
}
