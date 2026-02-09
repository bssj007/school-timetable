import { useState, createContext, useContext, ReactNode, useEffect } from "react";

export interface UserConfig {
    schoolName: string;
    grade: string;
    classNum: string;
    studentNumber: string;
}

export interface KakaoUser {
    id: number;
    nickname: string;
    profileImage: string;
    thumbnailImage: string;
    loggedIn: boolean;
}

const COOKIE_NAME = "school_timetable_config";

interface UserConfigContextType {
    schoolName: string;
    grade: string;
    classNum: string;
    studentNumber: string;
    setConfig: (config: Partial<UserConfig>) => void;
    isConfigured: boolean;
    kakaoUser: KakaoUser | null;
    refreshKakaoUser: () => Promise<void>;
}

const UserConfigContext = createContext<UserConfigContextType | undefined>(undefined);

export function UserConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfigState] = useState<UserConfig>(() => {
        // 초기 로드 시 쿠키 확인
        if (typeof document === "undefined") return { schoolName: "", grade: "", classNum: "", studentNumber: "" };

        const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
        if (match) {
            try {
                return JSON.parse(decodeURIComponent(match[2]));
            } catch (e) {
                console.error("Failed to parse config cookie", e);
            }
        }
        return { schoolName: "", grade: "", classNum: "", studentNumber: "" };
    });

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
    }, []);

    const setConfig = (newConfig: Partial<UserConfig>) => {
        const updated = { ...config, ...newConfig };
        setConfigState(updated);
        // 쿠키 저장 (만료 1년)
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(updated))}; expires=${expires.toUTCString()}; path=/`;
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
