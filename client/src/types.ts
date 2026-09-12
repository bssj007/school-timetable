export interface IPProfile {
    // --- Core Identity ---
    ip: string;
    kakaoAccounts: { kakaoId: string; kakaoNickname: string }[]; // List of all linked accounts

    // --- Status ---
    isBlocked: boolean;
    blockReason: string | null;
    blockId?: number; // For unblocking (if available)

    // --- Stats ---
    modificationCount: number;
    addCount?: number;
    deleteCount?: number;
    printCount?: number;
    downloadCount?: number;
    lastAccess: string | null; // ISO Date string
    recentUserAgents: string[];
    userAgent?: string | null;
    appType?: "webview" | "pwa" | null;
    os?: string | null;
    browserKey?: string | null;
    deviceType?: string | null;
    isInApp?: boolean;
    isStandalone?: boolean;
    studentName?: string | null;      // 복합 식별자 — 이름 부분
    teacherName?: string | null;      // 선생님 이름 (sj_teacher_name 쿠키)
    grade?: string | null;
    classNum?: string | null;
    studentNumber?: string | null;
    hasElectives?: boolean;
    electives?: Record<string, any> | null;
    instructionDismissed?: boolean;
    isBetaTester?: boolean;
    betaTesterSince?: string | null;
    historicalEnvironments?: { os: string; deviceType: string; browserKey: string; isInApp: boolean; isApp?: boolean; userAgent?: string | null; lastAccess?: string | null }[];

    // --- Detailed History (Empty in List View, Populated in Detail View) ---
    assessments: { id: number, subject: string, title: string, createdAt: string, grade: number, classNum: number }[];
    logs: { accessedAt: string, method: string, endpoint: string }[];
    totalLogCount?: number;
    relatedStudentLogsCount?: number;
    relatedOtherIps?: string[];
    _debug?: {
        queriedIp: string;
        normalizedIp: string;
        totalAccessLogsInDb: number;
        sampleIpsInAccessLogs: string[];
        recentLogSamples?: { id: number; ip: string; endpoint: string; method: string; accessedAt: string }[];
        matchedLogCount: number;
        relatedStudentLogsCount?: number;
        queryErrors?: Record<string, string>;
    };

    // --- Meta ---
    detailsLoaded: boolean; // Flag to indicate if full details are present
}

