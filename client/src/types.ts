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
    lastAccess: string | null; // ISO Date string
    recentUserAgents: string[];

    // --- Detailed History (Empty in List View, Populated in Detail View) ---
    assessments: { id: number, subject: string, title: string, createdAt: string, grade: number, classNum: number }[];
    logs: { accessedAt: string, method: string, endpoint: string }[];

    // --- Meta ---
    detailsLoaded: boolean; // Flag to indicate if full details are present
}
