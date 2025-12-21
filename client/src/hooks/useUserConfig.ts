import { useState, useEffect } from "react";

export interface UserConfig {
    grade: string;
    classNum: string;
}

const COOKIE_NAME = "school_timetable_config";

export function useUserConfig() {
    const [config, setConfigState] = useState<UserConfig>(() => {
        // 초기 로드 시 쿠키 확인
        if (typeof document === "undefined") return { grade: "", classNum: "" };

        const match = document.cookie.match(new RegExp('(^| )' + COOKIE_NAME + '=([^;]+)'));
        if (match) {
            try {
                return JSON.parse(decodeURIComponent(match[2]));
            } catch (e) {
                console.error("Failed to parse config cookie", e);
            }
        }
        return { grade: "", classNum: "" };
    });

    const setConfig = (newConfig: UserConfig) => {
        setConfigState(newConfig);
        // 쿠키 저장 (만료 1년)
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(newConfig))}; expires=${expires.toUTCString()}; path=/`;
    };

    const isConfigured = !!(config.grade && config.classNum);

    return {
        grade: config.grade,
        classNum: config.classNum,
        setConfig,
        isConfigured,
    };
}
