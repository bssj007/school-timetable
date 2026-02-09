
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
        const deletePastAssessments = settings.delete_past_assessments === 'true';

        let deletedAssessments = 0;
        let deletedLogs = 0;

        // 1. Cleanup Assessments
        // Delete items created older than retention period
        // OR (if deletePastAssessments is true) items with dueDate in the past
        let assessmentQuery = `DELETE FROM performance_assessments WHERE createdAt < datetime('now', '-${retentionDaysAssessments} days')`;
        if (deletePastAssessments) {
            assessmentQuery += ` OR dueDate < date('now')`;
        }

        const assessmentResult = await db.prepare(assessmentQuery).run();
        deletedAssessments = assessmentResult.meta.changes;

        // 2. Cleanup Logs
        const logResult = await db.prepare(`DELETE FROM access_logs WHERE accessedAt < datetime('now', '-${retentionDaysLogs} days')`).run();
        deletedLogs = logResult.meta.changes;

        return {
            success: true,
            deleted: {
                assessments: deletedAssessments,
                logs: deletedLogs
            },
            config: {
                retentionDaysAssessments,
                retentionDaysLogs,
                deletePastAssessments
            }
        };

    } catch (e: any) {
        console.error("Cleanup Error:", e);
        return { success: false, error: e.message || "Unknown error" };
    }
}
