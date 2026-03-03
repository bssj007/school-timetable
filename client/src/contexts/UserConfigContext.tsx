import { useState, createContext, useContext, ReactNode, useEffect } from "react";

export interface UserConfig {
    schoolName: string;
    grade: string;
    classNum: string;
    studentNumber: string;
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
const LS_KEY = "school_timetable_config"; // localStorage 백업 키

function readConfig(): UserConfig {
    const empty: UserConfig = { schoolName: "", grade: "", classNum: "", studentNumber: "", instructionDismissedV2: false };
    if (typeof document === "undefined") return empty;

    // 1순위: 쿠키
    const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
    if (match) {
        try {
            return JSON.parse(decodeURIComponent(match[2]));
        } catch (e) {
            console.error("Failed to parse config cookie", e);
        }
    }

    // 2순위: localStorage (쿠키 삭제 후 복구)
    try {
        const ls = localStorage.getItem(LS_KEY);
        if (ls) return JSON.parse(ls);
    } catch (e) {
        console.error("Failed to read config from localStorage", e);
    }

    return empty;
}

function writeConfig(config: UserConfig) {
    // 쿠키 저장 (만료 1년)
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(config))}; expires=${expires.toUTCString()}; path=/`;

    // localStorage 백업
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(config));
    } catch (e) {
        console.error("Failed to write config to localStorage", e);
    }
}

interface UserConfigContextType {
    schoolName: string;
    grade: string;
    classNum: string;
    studentNumber: string;
    instructionDismissedV2: boolean;
    setConfig: (config: Partial<UserConfig>) => void;
    isConfigured: boolean;
    kakaoUser: KakaoUser | null;
    refreshKakaoUser: () => Promise<void>;
}

const UserConfigContext = createContext<UserConfigContextType | undefined>(undefined);

export function UserConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfigState] = useState<UserConfig>(() => readConfig());

    const [kakaoUser, setKakaoUser] = useState<KakaoUser | null>(null);

    const refreshKakaoUser = async () => {
        try {
            const response = await fetch('/api/kakao/me');
            if (response.ok) {
                const data = await response.json();
                if (data.loggedIn) {
                    setKakaoUser(data);
                } else {
                    setKakaoUser(null);
                }
            }
        } catch (error) {
            console.error("Failed to fetch kakao user", error);
        }
    };

    useEffect(() => {
        refreshKakaoUser();
        // Check server-side dismissal status
        fetch('/api/dismiss-instruction')
            .then(res => res.json())
            .then(data => {
                if (data.dismissed) {
                    setConfigState(prev => {
                        if (prev.instructionDismissedV2) return prev; // Already true
                        return { ...prev, instructionDismissedV2: true };
                    });
                }
            })
            .catch(err => console.error("Failed to fetch instruction status", err));
    }, []);

    const setConfig = (newConfig: Partial<UserConfig>) => {
        const updated = { ...config, ...newConfig };
        setConfigState(updated);
        writeConfig(updated);

        // If dismissing instruction, sync to server
        if (newConfig.instructionDismissedV2) {
            fetch('/api/dismiss-instruction', { method: 'POST' }).catch(err => console.error(err));
        }
    };

    const isConfigured = !!(
        config.schoolName &&
        config.grade &&
        config.classNum &&
        config.studentNumber
    );

    return (
        <UserConfigContext.Provider value={{
            schoolName: config.schoolName,
            grade: config.grade,
            classNum: config.classNum,
            studentNumber: config.studentNumber || "",
            instructionDismissedV2: !!config.instructionDismissedV2,
            setConfig,
            isConfigured,
            kakaoUser,
            refreshKakaoUser
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
