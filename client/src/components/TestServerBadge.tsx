import React from "react";
import { TriangleAlert } from "lucide-react";

export interface EnvBindingInfo {
    isTestServer: boolean;
    serverName: string;
    isTestDb: boolean;
    dbName: string;
    isMismatch: boolean;
}

export function getTestBadgeLabel(envInfo: EnvBindingInfo): string {
    if (envInfo.isTestServer && envInfo.isTestDb) {
        return "테스트 서버+DB";
    }
    if (envInfo.isTestServer && !envInfo.isTestDb) {
        return "테스트 서버 (운영 DB 연결됨)";
    }
    if (!envInfo.isTestServer && envInfo.isTestDb) {
        return "운영 서버 (테스트 DB 연결됨)";
    }
    return "테스트 환경";
}

export function EnvMismatchWarningBar({ envInfo }: { envInfo: EnvBindingInfo }) {
    if (!envInfo.isMismatch) return null;

    const mismatchDetail = envInfo.isTestServer && !envInfo.isTestDb
        ? `테스트 서버(${envInfo.serverName})에 운영 DB(${envInfo.dbName})가 연결되어 있습니다.`
        : `운영 서버(${envInfo.serverName})에 테스트 DB(${envInfo.dbName})가 연결되어 있습니다.`;

    return (
        <div className="w-full bg-yellow-100/95 border-b border-yellow-300 text-yellow-900 text-xs py-1 px-4 font-semibold text-center flex items-center justify-center gap-1.5 shadow-sm sticky top-0 z-50">
            <TriangleAlert className="h-3.5 w-3.5 text-yellow-700 shrink-0" />
            <span>[환경 불일치 경고] {mismatchDetail}</span>
        </div>
    );
}

export function TestServerBadge({ envInfo, className = "" }: { envInfo: EnvBindingInfo; className?: string }) {
    if (!envInfo.isTestServer && !envInfo.isTestDb) return null;
    const label = getTestBadgeLabel(envInfo);
    const isMismatch = envInfo.isMismatch;

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs md:text-sm font-black border-2 border-dashed shadow-sm select-none tracking-tight ${
                isMismatch ? "text-amber-950 border-amber-500" : "text-amber-900 border-amber-400"
            } ${className}`}
            style={{
                backgroundImage: isMismatch
                    ? 'repeating-linear-gradient(-45deg, #fef3c7, #fef3c7 6px, #fde68a 6px, #fde68a 12px)'
                    : 'repeating-linear-gradient(-45deg, #fef9c3, #fef9c3 6px, #fef08a 6px, #fef08a 12px)',
            }}
        >
            {isMismatch && <TriangleAlert className="h-3.5 w-3.5 text-amber-700 shrink-0" />}
            <span>{label}</span>
        </span>
    );
}
