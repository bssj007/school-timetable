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

            if (!reqGrade || !reqClassNum || !reqStudentNum) {
                // Try to infer from ip_profiles if not fully logged in
                const result = await env.DB.prepare(
                    "SELECT grade, classNum, studentNumber, instructionDismissed FROM ip_profiles WHERE ip = ?"
                ).bind(ip).first();

                if (result) {
                    cGrade = reqGrade || result.grade;
                    cClassNum = reqClassNum || result.classNum;
                    cStudentNum = reqStudentNum || result.studentNumber;
                    dismissed = !!result.instructionDismissed;
                }
            }

            // Check if THIS student dismissed it via student_profiles
            if (cGrade && cClassNum) {
                // Use student_profiles as the single source of truth for logged-in/identified users
                let profileQuery = "SELECT instructionDismissed FROM student_profiles WHERE grade = ? AND classNum = ?";
                let profileParams = [cGrade, cClassNum];

                if (cStudentNum) {
                    profileQuery += " AND studentNumber = ?";
                    profileParams.push(cStudentNum);
                } else {
                    profileQuery += " AND (studentNumber IS NULL OR studentNumber = '')";
                }

                const studentResult = await env.DB.prepare(profileQuery).bind(...profileParams).first();

                if (studentResult) {
                    dismissed = !!studentResult.instructionDismissed;
                }
            }

            // Check if Promotion Reset is enabled
            if (dismissed && cGrade && cClassNum) {
                const settingRow = await env.DB.prepare(
                    "SELECT value FROM system_settings WHERE key = 'promotion_reset_days'"
                ).first();

                const resetDays = settingRow && settingRow.value ? parseInt(settingRow.value, 10) : 0;

                if (resetDays > 0) {
                    // Check the latest assessment modification for all IPs belonging to this student
                    let lastModifiedSql = "";
                    let lastModifiedParams: any[] = [];

                    if (cStudentNum) {
                        lastModifiedSql = `
                            SELECT MAX(updatedAt) as latestUpdate 
                            FROM performance_assessments 
                            WHERE lastModifiedIp IN (
                                SELECT ip FROM ip_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?
                            )
                        `;
                        lastModifiedParams = [cGrade, cClassNum, cStudentNum];
                    } else {
                        // If no student number, just check their current IP
                        lastModifiedSql = `
                            SELECT MAX(updatedAt) as latestUpdate 
                            FROM performance_assessments 
                            WHERE lastModifiedIp = ?
                        `;
                        lastModifiedParams = [ip];
                    }

                    const latestRow = await env.DB.prepare(lastModifiedSql).bind(...lastModifiedParams).first();

                    if (latestRow && latestRow.latestUpdate) {
                        const latestDate = new Date(latestRow.latestUpdate as string + 'Z');
                        const now = new Date();
                        const diffTime = Math.abs(now.getTime() - latestDate.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays > resetDays) {
                            dismissed = false;
                        }
                    } else {
                        // If they have NEVER modified an assessment, they definitely should see the popup
                        dismissed = false;
                    }

                    // Apply the reset state to the DB for this group if it was triggered
                    if (!dismissed) {
                        if (cStudentNum) {
                            await env.DB.prepare(
                                "UPDATE student_profiles SET instructionDismissed = 0 WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                            ).bind(cGrade, cClassNum, cStudentNum).run();
                            // Also clear IP profiles just in case
                            await env.DB.prepare(
                                "UPDATE ip_profiles SET instructionDismissed = 0 WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                            ).bind(cGrade, cClassNum, cStudentNum).run();
                        } else {
                            await env.DB.prepare(
                                "UPDATE student_profiles SET instructionDismissed = 0 WHERE grade = ? AND classNum = ? AND (studentNumber IS NULL OR studentNumber = '')"
                            ).bind(cGrade, cClassNum).run();
                            await env.DB.prepare(
                                "UPDATE ip_profiles SET instructionDismissed = 0 WHERE ip = ?"
                            ).bind(ip).run();
                        }
                    }
                }
            }

            return new Response(JSON.stringify({
                dismissed
            }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            // Table might not exist yet -> treat as not dismissed
            console.error("GET dismiss error:", e.message);
            return new Response(JSON.stringify({ dismissed: false }), { status: 200 });
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
                    INSERT INTO student_profiles (grade, classNum, studentNumber, instructionDismissed, updatedAt)
                    VALUES (?, ?, ?, 1, datetime('now'))
                    ON CONFLICT(grade, classNum, studentNumber) DO UPDATE SET 
                        instructionDismissed = 1,
                        updatedAt = datetime('now')
                `).bind(grade, classNum, studentNumber).run();

                // Also update ip_profiles
                await env.DB.prepare(`
                    INSERT INTO ip_profiles (ip, instructionDismissed, lastAccess, grade, classNum, studentNumber)
                    VALUES (?, 1, datetime('now'), ?, ?, ?)
                    ON CONFLICT(ip) DO UPDATE SET 
                        instructionDismissed = 1,
                        lastAccess = datetime('now'),
                        grade = COALESCE(?, grade),
                        classNum = COALESCE(?, classNum),
                        studentNumber = COALESCE(?, studentNumber)
                `).bind(ip, grade, classNum, studentNumber, grade, classNum, studentNumber).run();

            } else {
                // Upsert into ip_profiles using IP only (fallback for unidentified users)
                await env.DB.prepare(`
                    INSERT INTO ip_profiles (ip, instructionDismissed, lastAccess)
                    VALUES (?, 1, datetime('now'))
                    ON CONFLICT(ip) DO UPDATE SET 
                        instructionDismissed = 1,
                        lastAccess = datetime('now')
                `).bind(ip).run();
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            console.error("POST dismiss error:", e.message);
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response("Method not allowed", { status: 405 });
};
