
import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // 1. Auth Check
    const password = request.headers.get("X-Admin-Password");
    if (password !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), { status: 500 });
    }

    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        // Fetch Settings
        const { results } = await env.DB.prepare("SELECT key, value FROM system_settings").all();
        const settings: any = {};
        results.forEach((row: any) => {
            settings[row.key] = row.value;
        });

        // Check if Auto Delete is enabled
        if (settings.auto_delete_enabled !== 'true') {
            return new Response(JSON.stringify({ message: "Auto-deletion is disabled in settings.", deleted: { assessments: 0, logs: 0 } }), { headers: { "Content-Type": "application/json" } });
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

        const assessmentResult = await env.DB.prepare(assessmentQuery).run();
        deletedAssessments = assessmentResult.meta.changes;

        // 2. Cleanup Logs
        const logResult = await env.DB.prepare(`DELETE FROM access_logs WHERE accessedAt < datetime('now', '-${retentionDaysLogs} days')`).run();
        deletedLogs = logResult.meta.changes;

        return new Response(JSON.stringify({
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
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
    }
}
