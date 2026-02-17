
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
        // Rule: Delete logs older than retention period, ONLY IF the user (IP) has not accessed recently.
        // If a user has accessed within the retention period, keep ALL their logs (reset retention).
        const logQuery = `
            DELETE FROM access_logs 
            WHERE accessedAt < datetime('now', '+9 hours', '-${retentionDaysLogs} days')
            AND ip NOT IN (
                SELECT DISTINCT ip 
                FROM access_logs 
                WHERE accessedAt >= datetime('now', '+9 hours', '-${retentionDaysLogs} days')
            )
        `;
        const logResult = await db.prepare(logQuery).run();
        deletedLogs = logResult.meta.changes;

        // 3. Cleanup "Other" Users
        // Rule: Delete ip_profiles older than retention period AND classified as "Other"
        // "Other" = (No Student Profile OR Incomplete Student Profile) OR (Unknown User Agent)
        // We check lastAccess.

        // Define "Known User Agent" keywords (same as frontend)
        const uaKeywords = ['Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Whale', 'Kakao', 'iPhone', 'Android'];
        const uaCheckClause = uaKeywords.map(k => `userAgent NOT LIKE '%${k}%'`).join(' AND ');

        const otherUserQuery = `
            DELETE FROM ip_profiles
            WHERE lastAccess < datetime('now', '+9 hours', '-${retentionDaysOthers} days')
            AND (
                student_profile_id IS NULL
                OR (
                    SELECT COUNT(*) FROM student_profiles 
                    WHERE id = ip_profiles.student_profile_id 
                    AND (grade IS NULL OR classNum IS NULL)
                ) > 0
            )
            AND (
                userAgent IS NULL 
                OR (${uaCheckClause})
            )
        `;

        // Note: The logic for "Other" on frontend is: 
        // "Other" = NOT (KnownUA AND HasInfo)
        // So "Other" = (NOT KnownUA) OR (NOT HasInfo)
        // My query above implements: (NOT HasInfo) AND (NOT KnownUA). 
        // Wait, strictly speaking "Other" includes "Normal PCs without Info".
        // If I want to delete "Other", I should delete ANYONE who falls into the "Other" category.

        // Correction:
        // "Other" users are those who are NOT "Known Users".
        // Known User = (Has Known UA) AND (Has Grade/Class Info).
        // Therefore, Other User = (NOT Has Known UA) OR (NOT Has Grade/Class Info).

        // So the query should be OR between the UA check and the Info check.

        const otherUserQueryCorrected = `
            DELETE FROM ip_profiles
            WHERE lastAccess < datetime('now', '+9 hours', '-${retentionDaysOthers} days')
            AND (
                (
                    userAgent IS NULL 
                    OR (${uaCheckClause})
                )
                OR 
                (
                    student_profile_id IS NULL
                    OR (
                        SELECT COUNT(*) FROM student_profiles 
                        WHERE id = ip_profiles.student_profile_id 
                        AND (grade IS NULL OR classNum IS NULL)
                    ) > 0
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
