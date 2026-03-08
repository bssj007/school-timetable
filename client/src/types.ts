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
    printCount?: number;
    downloadCount?: number;
    lastAccess: string | null; // ISO Date string
    recentUserAgents: string[];
    isStandalone?: boolean;
    grade?: string | null;
    classNum?: string | null;
    studentNumber?: string | null;
    hasElectives?: boolean;
    electives?: Record<string, any> | null;

    // --- Detailed History (Empty in List View, Populated in Detail View) ---
    assessments: { id: number, subject: string, title: string, createdAt: string, grade: number, classNum: number }[];
    logs: { accessedAt: string, method: string, endpoint: string }[];

    // --- Meta ---
    detailsLoaded: boolean; // Flag to indicate if full details are present
}
