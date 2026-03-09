export const onRequest = async (context: any) => {
    const { request, env } = context;
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
    }

    // GET: Check status
    if (request.method === "GET") {
        try {
            const url = new URL(request.url);
            const reqGrade = url.searchParams.get("grade");
            const reqClassNum = url.searchParams.get("classNum");
            const reqStudentNum = url.searchParams.get("studentNumber");

            let dismissed = false;
            let cGrade = reqGrade;
            let cClassNum = reqClassNum;
            let cStudentNum = reqStudentNum;
            let dismissedTimestamp = 0;

            // Only check dismissal for fully authenticated users (with a student number)
            // Users without a student number are admins or guests, we don't save their dismissal state.
            if (cGrade && cClassNum && cStudentNum) {
                // Use student_profiles as the single source of truth for logged-in/identified users
                const profileQuery = "SELECT instructionDismissed FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?";
                const studentResult = await env.DB.prepare(profileQuery).bind(cGrade, cClassNum, cStudentNum).first();

                if (studentResult) {
                    dismissed = !!studentResult.instructionDismissed;

                    const val = Number(studentResult.instructionDismissed);
                    if (!isNaN(val) && val > 0) {
                        // Same logic: if legacy '1', treat as just dismissed to prevent instant wipe
                        dismissedTimestamp = val === 1 ? Date.now() : val;
                    }
                }
            }

            // Check if Promotion Reset is enabled
            if (dismissed && cGrade && cClassNum && cStudentNum) {
                const settingRow = await env.DB.prepare(
                    "SELECT value FROM system_settings WHERE key = 'promotion_reset_days'"
                ).first();

                const resetDays = settingRow && settingRow.value ? parseInt(settingRow.value, 10) : 0;

                if (resetDays > 0) {
                    // Check the latest assessment modification for all IPs belonging to this student
                    const lastModifiedSql = `
                        SELECT MAX(updatedAt) as latestUpdate 
                        FROM performance_assessments 
                        WHERE lastModifiedIp IN (
                            SELECT ip FROM cookie_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?
                            UNION
                            SELECT ip FROM ip_profiles WHERE student_profile_id = (
                                SELECT id FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?
                            )
                        )
                    `;
                    const lastModifiedParams = [cGrade, cClassNum, cStudentNum, cGrade, cClassNum, cStudentNum];

                    const latestRow = await env.DB.prepare(lastModifiedSql).bind(...lastModifiedParams).first();
                    const now = Date.now();

                    // We only reset if the user hasn't DIMSISSED recently as well.
                    // If they dismissed it 1 hour ago (profileDiffDays = 0), we DO NOT reset it yet!
                    const profileDiffDays = dismissedTimestamp > 0 ? Math.floor((now - dismissedTimestamp) / (1000 * 60 * 60 * 24)) : 9999;

                    if (latestRow && latestRow.latestUpdate) {
                        const latestDate = new Date(latestRow.latestUpdate as string + 'Z').getTime();
                        const diffTime = now - latestDate;
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays >= resetDays && profileDiffDays >= resetDays) {
                            dismissed = false;
                        }
                    } else {
                        // If they have NEVER modified an assessment, they definitely should see the popup
                        // UNLESS they literally just dismissed it within the reset period.
                        if (profileDiffDays >= resetDays) {
                            dismissed = false;
                        }
                    }

                    // Apply the reset state to the DB for this group if it was triggered
                    if (!dismissed) {
                        await env.DB.prepare(
                            "UPDATE student_profiles SET instructionDismissed = 0 WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                        ).bind(cGrade, cClassNum, cStudentNum).run();
                        // Also clear IP profiles just in case
                        await env.DB.prepare(
                            `UPDATE ip_profiles SET instructionDismissed = 0 WHERE student_profile_id = (
                                SELECT id FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?
                            )`
                        ).bind(cGrade, cClassNum, cStudentNum).run();
                    }
                }
            }

            return new Response(JSON.stringify({
                dismissed
            }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            // Table might not exist yet -> do not force false, let client rely on local config
            console.error("GET dismiss error:", e.message);
            return new Response(JSON.stringify({ error: e.message }), { status: 200 });
        }
    }

    // POST: Set dismissed = 1
    if (request.method === "POST") {
        try {
            const body = await request.json().catch(() => ({}));
            const grade = body.grade || null;
            const classNum = body.classNum || null;
            const studentNumber = body.studentNumber || null;

            if (grade && classNum && studentNumber) {
                // Upsert into student_profiles
                await env.DB.prepare(`
                    INSERT INTO student_profiles(grade, classNum, studentNumber, instructionDismissed)
                    VALUES(?, ?, ?, ?)
                    ON CONFLICT(grade, classNum, studentNumber) DO UPDATE SET 
                        instructionDismissed = ?
                                    `).bind(grade, classNum, studentNumber, Date.now(), Date.now()).run();

                // Also update ip_profiles
                await env.DB.prepare(`
                    INSERT INTO ip_profiles(ip, instructionDismissed, lastAccess)
                    VALUES(?, ?, datetime('now'))
                    ON CONFLICT(ip) DO UPDATE SET 
                        instructionDismissed = ?,
                                lastAccess = datetime('now')
                                    `).bind(ip, Date.now(), Date.now()).run();
            }
            // For administrators/guests without a student number, we simply do nothing.

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            console.error("POST dismiss error:", e.message);
            // Even if DB fails (e.g., column missing), tell the client we succeeded
            // so they don't get stuck in an infinite pop-up loop.
            return new Response(JSON.stringify({ success: true, warning: e.message }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    return new Response("Method not allowed", { status: 405 });
};
