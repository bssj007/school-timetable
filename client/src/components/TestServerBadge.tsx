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

export function RealDbResetWarning({ envInfo, className = "" }: { envInfo: EnvBindingInfo; className?: string }) {
    if (envInfo.isTestDb) return null;

    return (
        <div className={`w-full bg-red-50 border-2 border-red-500 text-red-950 p-3.5 rounded-lg text-xs leading-relaxed font-medium space-y-1.5 shadow-sm text-left ${className}`}>
            <div className="flex items-center gap-1.5 font-bold text-red-700 text-sm">
                <TriangleAlert className="h-4 w-4 text-red-600 shrink-0" />
                <span>[위험: 실제 운영(Live) DB 연결됨]</span>
            </div>
            <p className="text-red-900 font-semibold">
                현재 테스트용이 아닌 <span className="underline underline-offset-2 font-black text-red-950">실제 운영 데이터베이스({envInfo.dbName || 'school-timetable-db'})</span>에 연결되어 있습니다.
            </p>
            <p className="text-red-800">
                초기화 시 실제 학생 시간표, 수행평가, 교사 설정 등 모든 실제 서비스 데이터가 영구히 파괴되며 절대 복원할 수 없습니다.
            </p>
            {envInfo.isTestServer && (
                <div className="pt-1 text-[11px] font-bold text-amber-900 bg-amber-100/90 p-1.5 rounded border border-amber-300 flex items-center gap-1.5">
                    <TriangleAlert className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                    <span>주의: 테스트 서버에서 실제 운영 DB에 연결되어 있으므로 더욱 주의해야 합니다.</span>
                </div>
            )}
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

