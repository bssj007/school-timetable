import { useState, createContext, useContext, ReactNode, useEffect } from "react";

export interface UserConfig {
    schoolName: string;
    grade: string;
    classNum: string;
    studentNumber: string;
    studentName: string;          // 복합 식별자 구성 (이름 + 학번)
    semesterKey?: string;         // 학기 키 — 서버와 불일치 시 재등록 강제
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
const EMPTY_CONFIG: UserConfig = { schoolName: "", grade: "", classNum: "", studentNumber: "", studentName: "", instructionDismissedV2: false };

/** 쿠키를 완전히 지워 온보딩 다이얼로그를 다시 표시 */
function clearConfigCookie() {
    document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}

/** 쿠키 원본 파싱 (동기) */
function readCookieRaw(): (UserConfig & { semesterKey?: string }) | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (!match) return null;
    try {
        return JSON.parse(decodeURIComponent(match[2]));
    } catch {
        return null;
    }
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
    isValidating: boolean;   // true 동안은 앱 렌더링 차단
    kakaoUser: KakaoUser | null;
    refreshKakaoUser: () => Promise<void>;
}

const UserConfigContext = createContext<UserConfigContextType | undefined>(undefined);

export function UserConfigProvider({ children }: { children: ReactNode }) {
    // ── 학기 키 검증 완료 전까지는 빈 config로 시작 ────────────────────────
    // useEffect에서 서버 semester_key 확인 후 결정
    const [config, setConfigState] = useState<UserConfig>(EMPTY_CONFIG);
    const [isValidating, setIsValidating] = useState(true);

    const [kakaoUser, setKakaoUser] = useState<KakaoUser | null>(null);

    const refreshKakaoUser = async () => {
        try {
            const response = await fetch('/api/kakao/me');
            if (response.ok) {
                const data = await response.json();
                setKakaoUser(data.loggedIn ? data : null);
            }
        } catch (error) {
            console.error("Failed to fetch kakao user", error);
        }
    };

    useEffect(() => {
        refreshKakaoUser();

        // ── 학기 키 검증 ─────────────────────────────────────────────────────
        // 서버의 semester_key를 가져와 쿠키의 값과 비교.
        // 불일치 → 쿠키 파기 → 빈 config 유지 (온보딩 표시)
        // 일치   → 쿠키 데이터를 state에 적재 (정상 사용)
        fetch('/api/settings/public')
            .then(res => res.ok ? res.json() : null)
            .then((settings: any) => {
                const serverKey: string = settings?.semester_key ?? '1';
                const cookieData = readCookieRaw();

                if (cookieData) {
                    const cookieKey: string = cookieData.semesterKey ?? '';
                    if (cookieKey !== serverKey) {
                        // ⚠ 학기 키 불일치 → 쿠키 파기, 빈 config 유지
                        console.log(`[SemesterKey] Mismatch (cookie="${cookieKey}", server="${serverKey}"). Clearing cookie.`);
                        clearConfigCookie();
                        // config는 EMPTY_CONFIG 상태 그대로 → 온보딩 다이얼로그 표시
                    } else {
                        // ✅ 키 일치 → 쿠키 데이터 적재
                        const loaded: UserConfig = {
                            ...cookieData,
                            instructionDismissedV2: false, // 쿠키 저장 안 함
                            studentName: cookieData.studentName || '',
                        };
                        setConfigState(loaded);

                        // dismiss-instruction 서버 상태 확인
                        const params = new URLSearchParams();
                        if (loaded.grade) params.append('grade', loaded.grade);
                        if (loaded.classNum) params.append('classNum', loaded.classNum);
                        if (loaded.studentNumber) params.append('studentNumber', loaded.studentNumber);
                        if (loaded.studentName) params.append('studentName', loaded.studentName);

                        fetch(`/api/dismiss-instruction?${params.toString()}`)
                            .then(res => res.json())
                            .then(data => {
                                setConfigState(prev => ({
                                    ...prev,
                                    instructionDismissedV2: !!data.dismissed,
                                }));
                            })
                            .catch(err => console.error("Failed to fetch instruction status", err));
                    }
                }
                // 쿠키 없음 → EMPTY_CONFIG 유지 → 온보딩
            })
            .catch(err => {
                // 네트워크 오류 시: 쿠키 데이터를 그냥 적재 (검증 실패로 막지 않음)
                console.error("[SemesterKey] Failed to fetch public settings:", err);
                const cookieData = readCookieRaw();
                if (cookieData) {
                    setConfigState({ ...cookieData, instructionDismissedV2: false, studentName: cookieData.studentName || '' });
                }
            })
            .finally(() => {
                // 검증 완료 → 앱 렌더링 허용
                setIsValidating(false);
            });
    }, []);

    const setConfig = (newConfig: Partial<UserConfig>) => {
        const updated = { ...config, ...newConfig };
        setConfigState(updated);

        // 쿠키 저장 — dismiss 상태는 절대 저장하지 않음
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
        config.schoolName &&
        config.grade &&
        config.classNum &&
        config.studentNumber &&
        config.studentName
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
        }}>
            {children}
        </UserConfigContext.Provider>
    );
}

export function useUserConfig() {
    const context = useContext(UserConfigContext);
    if (context === undefined) {
        throw new Error("useUserConfig must be used within a UserConfigProvider");
    }
    return context;
}
