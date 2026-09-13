import { useState, createContext, useContext, ReactNode, useEffect } from "react";
import {
    getRoleCookie,
    getTeacherNameCookie,
    setRoleCookie,
    setTeacherNameCookie,
    clearRoleCookie,
    clearTeacherCookie,
    clearStoredTeacherPassword,
    getAuthenticatedTeacher,
    getActiveTeacherName
} from "@/lib/teacherUtils";
import { isMaintenanceBypassed, getInstallTargetType } from "@/lib/browserDetect";
import { toast } from "sonner";

export interface UserConfig {
    schoolName: string;
    grade: string;
    classNum: string;
    studentNumber: string;
    studentName: string;
    semesterKey?: string;
    instructionDismissedV2?: boolean;
}

export interface KakaoUser {
    id: number;
    nickname: string;
    profileImage: string;
    thumbnailImage: string;
    loggedIn: boolean;
}

const COOKIE_NAME = "school_timetable_config";
const LS_SEMESTER_KEY = "semester_key_server_cache"; // localStorage 캐시 키
const EMPTY_CONFIG: UserConfig = {
    schoolName: "", grade: "", classNum: "",
    studentNumber: "", studentName: "", instructionDismissedV2: false
};

function clearConfigCookie() {
    document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}

function readCookieRaw(): (UserConfig & { semesterKey?: string }) | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (!match) return null;
    try { return JSON.parse(decodeURIComponent(match[2])); } catch { return null; }
}

interface UserConfigContextType {
    schoolName: string;
    grade: string;
    classNum: string;
    studentNumber: string;
    studentName: string;
    instructionDismissedV2: boolean;
    setConfig: (config: Partial<UserConfig>) => void;
    isConfigured: boolean;
    /** true 동안은 앱 렌더링 차단 (최초 방문 시 딱 한 번) */
    isValidating: boolean;
    kakaoUser: KakaoUser | null;
    refreshKakaoUser: () => Promise<void>;
    /** 현재 사용자 역할: 'student' | 'teacher' | null (미선택) */
    userRole: "student" | "teacher" | null;
    /** 교사 이름 (교사 역할인 경우) */
    teacherName: string | null;
    /** 역할 쿠키 갱신 (RoleSelectDialog에서 직접 쿠키 저장 후 상태 동기화용) */
    refreshRole: () => void;
    /** 역할 쿠키 삭제 및 상태 초기화 */
    clearRole: () => void;
    /** 역할 전환 함수 (프로필 보존하며 학생/교사 간 전환) */
    switchToRole: (targetRole: "student" | "teacher") => void;
    /** RoleSelectDialog 열기 제어 */
    openRoleSelect: (step?: "role" | "student-info" | "teacher-name" | "install") => void;
    /** RoleSelectDialog 닫기 제어 */
    closeRoleSelect: () => void;
    /** RoleSelectDialog 열림 여부 */
    isRoleSelectOpen: boolean;
    /** RoleSelectDialog 현재 단계 */
    roleSelectStep: "role" | "student-info" | "teacher-name" | "install";
    /** 서버 점검 중 여부 — true이면 역할 선택/온보딩 다이얼로그를 숨긴다 */
    isMaintenanceMode: boolean;
    /** 전역 public 설정 데이터 (캐시된 상태 포함) */
    publicSettings: any;
}

const UserConfigContext = createContext<UserConfigContextType | undefined>(undefined);

// ── 동기 초기화: localStorage 캐시로 즉시 결정 ──────────────────────────────
function computeInitialState(): { config: UserConfig; isValidating: boolean } {
    if (typeof window === "undefined") return { config: EMPTY_CONFIG, isValidating: true };

    const cachedServerKey = localStorage.getItem(LS_SEMESTER_KEY); // null = 미캐시
    const cookieData = readCookieRaw();

    if (cachedServerKey === null) {
        // 캐시 없음 → 서버 확인 필요 (최초 방문 또는 캐시 만료)
        return { config: EMPTY_CONFIG, isValidating: true };
    }

    if (!cookieData) {
        // 쿠키 없음 → 새 사용자, 즉시 온보딩
        return { config: EMPTY_CONFIG, isValidating: false };
    }

    const cookieKey = cookieData.semesterKey ?? '';
    if (cookieKey !== cachedServerKey) {
        // 키 불일치 → 즉시 쿠키 파기 (네트워크 불필요)
        clearConfigCookie();
        return { config: EMPTY_CONFIG, isValidating: false };
    }

    // ✅ 키 일치 → 쿠키 데이터 즉시 적재, 지연 없음
    return {
        config: { ...cookieData, instructionDismissedV2: false },
        isValidating: false
    };
}

export function UserConfigProvider({ children }: { children: ReactNode }) {
    const initial = computeInitialState();
    const [config, setConfigState] = useState<UserConfig>(initial.config);
    const [isValidating, setIsValidating] = useState(initial.isValidating);
    const [kakaoUser, setKakaoUser] = useState<KakaoUser | null>(null);
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [publicSettings, setPublicSettings] = useState<any>(() => {
        if (typeof window === "undefined") return null;
        try {
            const cached = localStorage.getItem("public_settings_cache");
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });

    // ── 역할 상태: 쿠키에서 즉시 읽기 ──
    const [userRole, setUserRoleState] = useState<"student" | "teacher" | null>(() => {
        const r = getRoleCookie();
        return (r === "student" || r === "teacher") ? r : null;
    });
    const [teacherName, setTeacherNameState] = useState<string | null>(() => getTeacherNameCookie());

    // ── 역할 선택 다이얼로그 제어 ──
    const [isRoleSelectOpen, setIsRoleSelectOpen] = useState(false);
    const [roleSelectStep, setRoleSelectStep] = useState<"role" | "student-info" | "teacher-name" | "install">(() => {
        if (typeof window === "undefined") return "role";
        let cachedSettings: any = null;
        try {
            const cached = localStorage.getItem("public_settings_cache");
            if (cached) cachedSettings = JSON.parse(cached);
        } catch {}
        return getInstallTargetType(cachedSettings) !== null ? "install" : "role";
    });

    const openRoleSelect = (step?: "role" | "student-info" | "teacher-name" | "install") => {
        let targetStep = step;
        if (!targetStep) {
            targetStep = getInstallTargetType(publicSettings) !== null ? "install" : "role";
        }
        setRoleSelectStep(targetStep);
        setIsRoleSelectOpen(true);
    };

    const closeRoleSelect = () => {
        setIsRoleSelectOpen(false);
    };

    const refreshRole = () => {
        const r = getRoleCookie();
        setUserRoleState((r === "student" || r === "teacher") ? r : null);
        setTeacherNameState(getTeacherNameCookie());
    };

    const clearRole = () => {
        clearRoleCookie();
        setUserRoleState(null);
    };

    const switchToRole = (targetRole: "student" | "teacher") => {
        if (targetRole === "student") {
            // 교사→학생 전환: 역할 선택 화면(role step)부터 다시 시작
            // 저장된 학생 정보는 다이얼로그 내 handleSelectStudent에서 이미 채워진 상태로 유지됨
            clearRoleCookie();
            setUserRoleState(null);
            openRoleSelect("role");
            if (typeof window !== "undefined" && window.location.pathname !== "/") {
                window.location.href = "/";
            }
        } else if (targetRole === "teacher") {
            // 학생→교사 전환: 동일하게 역할 선택 화면(role step)부터 다시 시작
            // 저장된 교사 정보(로그인/최근 선택)는 handleSelectTeacher에서 자동 접속함
            clearRoleCookie();
            setUserRoleState(null);
            openRoleSelect("role");
        }
    };


    const refreshKakaoUser = async () => {
        try {
            const res = await fetch('/api/kakao/me');
            if (res.ok) {
                const data = await res.json();
                setKakaoUser(data.loggedIn ? data : null);
            }
        } catch (e) { console.error("Failed to fetch kakao user", e); }
    };

    useEffect(() => {
        refreshKakaoUser();

        // 백그라운드에서 항상 서버 키 갱신 확인
        fetch('/api/settings/public')
            .then(res => res.ok ? res.json() : null)
            .then((settings: any) => {
                const serverKey: string = settings?.semester_key ?? '1';

                // 서버 점검 중 감지 (화이트리스트 및 접속환경별 점검 우회 확인)
                const maintenanceActive = Boolean(
                    settings?.maintenance_mode?.active &&
                    !settings?.is_whitelisted &&
                    !isMaintenanceBypassed(settings)
                );
                setIsMaintenanceMode(maintenanceActive);
                
                // 설정 상태 저장 (방문제한 등은 캐싱하지 않음)
                setPublicSettings(settings);
                try {
                    localStorage.setItem("public_settings_cache", JSON.stringify(settings));
                } catch {}

                // localStorage 캐시 갱신
                localStorage.setItem(LS_SEMESTER_KEY, serverKey);

                const cookieData = readCookieRaw();

                // 개발자 가상 계정 비활성화(OFF) 시 기존 가상 세션 즉시 파기 및 차단
                const isDevEnabled = Boolean(settings?.dev_account_enabled);
                let devBlocked = false;

                if (!isDevEnabled) {
                    // 1) 학생 가상 계정 (9999 김학생) 검사
                    if (cookieData && (cookieData.studentName === '김학생' || cookieData.grade === '9' || cookieData.studentNumber === '99')) {
                        clearConfigCookie();
                        clearRoleCookie();
                        setConfigState(EMPTY_CONFIG);
                        setUserRoleState(null);
                        devBlocked = true;
                    }

                    // 2) 교사 가상 계정 (김교사) 검사
                    const activeT = getTeacherNameCookie();
                    const authT = getAuthenticatedTeacher();
                    const lsTeacher = typeof localStorage !== 'undefined' ? localStorage.getItem('last_selected_teacher_name') : null;
                    if (activeT === '김교사' || authT === '김교사' || lsTeacher === '김교사') {
                        clearTeacherCookie();
                        clearStoredTeacherPassword('김교사');
                        clearRoleCookie();
                        setUserRoleState(null);
                        setTeacherNameState(null);
                        try {
                            localStorage.removeItem('last_selected_teacher_name');
                            localStorage.removeItem('teacher-page-selected-teacher');
                        } catch {}
                        devBlocked = true;
                    }

                    if (devBlocked) {
                        toast.error("개발자 가상 계정 기능이 비활성화되어 접근이 차단되었습니다.");
                        if (typeof window !== 'undefined' && window.location.pathname !== '/') {
                            window.location.href = '/';
                        }
                        return;
                    }
                }

                if (cookieData) {
                    const cookieKey = cookieData.semesterKey ?? '';
                    if (cookieKey !== serverKey) {
                        // 서버와 불일치 → 쿠키 파기, 온보딩
                        console.log(`[SemesterKey] Mismatch (cookie="${cookieKey}", server="${serverKey}"). Clearing.`);
                        clearConfigCookie();
                        setConfigState(EMPTY_CONFIG);
                    } else if (isValidating) {
                        // 최초 방문(isValidating=true)이었다면 이제 쿠키 적재
                        const loaded: UserConfig = { ...cookieData, instructionDismissedV2: false };
                        setConfigState(loaded);

                        // dismiss-instruction 서버 상태 확인
                        const params = new URLSearchParams();
                        if (loaded.grade) params.append('grade', loaded.grade);
                        if (loaded.classNum) params.append('classNum', loaded.classNum);
                        if (loaded.studentNumber) params.append('studentNumber', loaded.studentNumber);
                        if (loaded.studentName) params.append('studentName', loaded.studentName);
                        fetch(`/api/dismiss-instruction?${params}`)
                            .then(r => r.json())
                            .then(d => setConfigState(prev => ({ ...prev, instructionDismissedV2: !!d.dismissed })))
                            .catch(() => {});
                    }
                }

                // dismiss-instruction 확인 (즉시 로드된 경우, 배경에서 갱신)
                if (!isValidating && cookieData && (cookieData.semesterKey ?? '') === serverKey) {
                    const params = new URLSearchParams();
                    if (cookieData.grade) params.append('grade', cookieData.grade);
                    if (cookieData.classNum) params.append('classNum', cookieData.classNum);
                    if (cookieData.studentNumber) params.append('studentNumber', cookieData.studentNumber);
                    if (cookieData.studentName) params.append('studentName', cookieData.studentName);
                    fetch(`/api/dismiss-instruction?${params}`)
                        .then(r => r.json())
                        .then(d => setConfigState(prev => ({ ...prev, instructionDismissedV2: !!d.dismissed })))
                        .catch(() => {});
                }
            })
            .catch(err => {
                // 네트워크 오류 → isValidating 중이었다면 캐시 없이 쿠키 적재 (관대하게 처리)
                console.error("[SemesterKey] Network error:", err);
                if (isValidating) {
                    const cookieData = readCookieRaw();
                    if (cookieData) setConfigState({ ...cookieData, instructionDismissedV2: false });
                }
            })
            .finally(() => {
                setIsValidating(false);
            });
    }, []);

    const setConfig = (newConfig: Partial<UserConfig>) => {
        const updated = { ...config, ...newConfig };
        setConfigState(updated);

        const cookieData = { ...updated };
        delete cookieData.instructionDismissedV2;

        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 10);
        document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(cookieData))}; expires=${expires.toUTCString()}; path=/`;

        if (newConfig.instructionDismissedV2) {
            fetch('/api/dismiss-instruction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentName: updated.studentName,
                    grade: updated.grade,
                    classNum: updated.classNum,
                    studentNumber: updated.studentNumber,
                })
            }).catch(err => console.error(err));
        }
    };

    const isConfigured = !!(
        config.schoolName && config.grade && config.classNum &&
        config.studentNumber && config.studentName
    );

    return (
        <UserConfigContext.Provider value={{
            schoolName: config.schoolName,
            grade: config.grade,
            classNum: config.classNum,
            studentNumber: config.studentNumber || "",
            studentName: config.studentName || "",
            instructionDismissedV2: !!config.instructionDismissedV2,
            setConfig,
            isConfigured,
            isValidating,
            kakaoUser,
            refreshKakaoUser,
            userRole,
            teacherName,
            refreshRole,
            clearRole,
            switchToRole,
            openRoleSelect,
            closeRoleSelect,
            isRoleSelectOpen,
            roleSelectStep,
            isMaintenanceMode,
            publicSettings,
        }}>
            {children}
        </UserConfigContext.Provider>
    );
}

export function useUserConfig() {
    const ctx = useContext(UserConfigContext);
    if (!ctx) throw new Error("useUserConfig must be used within a UserConfigProvider");
    return ctx;
}
