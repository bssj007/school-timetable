
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
        // "Other" = (No Student Info) OR (Unknown User Agent)
        // With new schema: Student Info exists if `studentNumber` is NOT NULL (and points to valid profile, but FK ensures that usually).

        // Define "Known User Agent" keywords
        const uaKeywords = ['Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Whale', 'Kakao', 'iPhone', 'Android'];
        // clause: userAgent NOT LIKE '%Key%' AND ...
        const uaCheckClause = uaKeywords.map(k => `userAgent NOT LIKE '%${k}%'`).join(' AND ');

        // Logic:
        // Delete if:
        // 1. Last access > retention
        // 2. AND is "Other"
        //    "Other" means:
        //    (studentNumber IS NULL)  <-- No Info
        //    OR
        //    (userAgent IS NULL OR (userAgent NOT LIKE ...)) <-- Unknown Browser

        const otherUserQueryCorrected = `
            DELETE FROM ip_profiles
            WHERE lastAccess < datetime('now', '+9 hours', '-${retentionDaysOthers} days')
            AND (
                (studentNumber IS NULL)
                OR
                (
                    userAgent IS NULL 
                    OR (${uaCheckClause})
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
