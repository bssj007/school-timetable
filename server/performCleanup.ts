
export async function performCleanup(db: any) {
    try {
        // Fetch Settings
        const { results } = await db.prepare("SELECT key, value FROM system_settings").all();
        const settings: any = {};
        results.forEach((row: any) => {
            settings[row.key] = row.value;
        });

        // Check if Auto Delete is enabled
        if (settings.auto_delete_enabled !== 'true') {
            return {
                success: false,
                message: "Auto-deletion is disabled in settings.",
                deleted: { assessments: 0, logs: 0 }
            };
        }

        const retentionDaysAssessments = parseInt(settings.retention_days_assessments || '30');
        const retentionDaysLogs = parseInt(settings.retention_days_logs || '30');
        const retentionDaysOthers = parseInt(settings.retention_days_others || '30');
        // delete_past_assessments feature removed

        let deletedAssessments = 0;
        let deletedLogs = 0;
        let deletedOthers = 0;

        // 1. Cleanup Assessments
        // Delete items created older than retention period
        // Use KST (+9 hours) for correct date comparison
        let assessmentQuery = `DELETE FROM performance_assessments WHERE createdAt < datetime('now', '+9 hours', '-${retentionDaysAssessments} days')`;

        const assessmentResult = await db.prepare(assessmentQuery).run();
        deletedAssessments = assessmentResult.meta.changes;

        // 2. Cleanup Logs
        // Rule: Delete ALL logs older than retention period (all IPs, including active ones).
        // 기존 로직(활성 IP 로그 무보존)은 활성 사용자 로그가 무한 축적되어
        // ip_profile API 타임아웃 / D1 응답 초과 버그를 유발했음 → 단순 날짜 기반 삭제로 변경
        const logQuery = `
            DELETE FROM access_logs 
            WHERE accessedAt < datetime('now', '+9 hours', '-${retentionDaysLogs} days')
        `;
        const logResult = await db.prepare(logQuery).run();
        deletedLogs = logResult.meta.changes;

        // 3. Cleanup "Other" Users
        // Rule: Delete ip_profiles older than retention period AND classified as "Other"
        // "Other" = (No Student Info) OR (Unknown Browser)
        //
        // browserKey 컬럼이 있는 신규 행: browserKey = 'other' 로 판별 (parseUA 결과 그대로)
        // browserKey 컬럼이 NULL인 구버전 행: 기존 UA 키워드 LIKE 로 fallback
        const uaKeywords = ['Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Whale', 'Kakao', 'iPhone', 'Android'];
        const uaFallbackClause = uaKeywords.map(k => `userAgent NOT LIKE '%${k}%'`).join(' AND ');

        const otherUserQueryCorrected = `
            DELETE FROM ip_profiles
            WHERE lastAccess < datetime('now', '+9 hours', '-${retentionDaysOthers} days')
            AND (
                (studentNumber IS NULL)
                OR
                (
                    -- 신규 행: browserKey 컬럼으로 판별
                    (browserKey IS NOT NULL AND browserKey = 'other')
                    OR
                    -- 구버전 행(마이그레이션 전): UA 문자열 키워드 fallback
                    (browserKey IS NULL AND (userAgent IS NULL OR (${uaFallbackClause})))
                )
            )
        `;


        const otherResult = await db.prepare(otherUserQueryCorrected).run();
        deletedOthers = otherResult.meta.changes;

        return {
            success: true,
            deleted: {
                assessments: deletedAssessments,
                logs: deletedLogs,
                others: deletedOthers
            },
            config: {
                retentionDaysAssessments,
                retentionDaysLogs,
                retentionDaysOthers
            }
        };

    } catch (e: any) {
        console.error("Cleanup Error:", e);
        return { success: false, error: e.message || "Unknown error" };
    }
}
