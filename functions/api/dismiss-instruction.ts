export const onRequest = async (context: any) => {
    const { request, env } = context;
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
    }

    // GET: Check status
    if (request.method === "GET") {
        let dismissed = false;
        try {
            const url = new URL(request.url);
            const reqGrade = url.searchParams.get("grade");
            const reqClassNum = url.searchParams.get("classNum");
            const reqStudentNum = url.searchParams.get("studentNumber");
            const reqStudentName = url.searchParams.get("studentName")?.trim() ?? '';

            const cGrade = reqGrade ? Number(reqGrade) : null;
            const cClassNum = reqClassNum ? Number(reqClassNum) : null;
            const cStudentNum = reqStudentNum ? Number(reqStudentNum) : null;
            let dismissedTimestamp = 0;

            // 이름 + 학번 4개 전부 있어야 조회
            if (reqStudentName && cGrade && cClassNum && cStudentNum) {
                const studentResult = await env.DB.prepare(
                    "SELECT instructionDismissed FROM student_profiles WHERE name = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(reqStudentName, cGrade, cClassNum, cStudentNum).first();

                if (studentResult) {
                    dismissed = !!studentResult.instructionDismissed;
                    const val = Number(studentResult.instructionDismissed);
                    if (!isNaN(val) && val > 0) {
                        dismissedTimestamp = val === 1 ? Date.now() : val;
                    }
                }
            }

            // Check if Promotion Reset is enabled
            if (dismissed && reqStudentName && cGrade && cClassNum && cStudentNum) {
                const settingRow = await env.DB.prepare(
                    "SELECT value FROM system_settings WHERE key = 'promotion_reset_days'"
                ).first();

                const resetDays = settingRow && settingRow.value ? parseInt(settingRow.value, 10) : 0;

                if (resetDays > 0) {
                    const now = Date.now();
                    const profileDiffDays = dismissedTimestamp > 0 ? Math.floor((now - dismissedTimestamp) / (1000 * 60 * 60 * 24)) : 9999;

                    if (profileDiffDays >= resetDays) {
                        dismissed = false;
                    }

                    if (!dismissed) {
                        await env.DB.prepare(
                            "UPDATE student_profiles SET instructionDismissed = 0 WHERE name = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
                        ).bind(reqStudentName, cGrade, cClassNum, cStudentNum).run();
                        await env.DB.prepare(
                            `UPDATE ip_profiles SET instructionDismissed = 0 WHERE student_profile_id = (
                                SELECT id FROM student_profiles WHERE name = ? AND grade = ? AND classNum = ? AND studentNumber = ?
                            )`
                        ).bind(reqStudentName, cGrade, cClassNum, cStudentNum).run();
                    }
                }
            }

            return new Response(JSON.stringify({ dismissed }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            console.error("GET dismiss error:", e.message);
            return new Response(JSON.stringify({ dismissed: dismissed, _error: e.message }), { status: 200 });
        }
    }

    // POST: Set dismissed = 1
    if (request.method === "POST") {
        try {
            const body = await request.json().catch(() => ({}));
            const grade = body.grade ? Number(body.grade) : null;
            const classNum = body.classNum ? Number(body.classNum) : null;
            const studentNumber = body.studentNumber ? Number(body.studentNumber) : null;
            const studentName = typeof body.studentName === 'string' ? body.studentName.trim() : '';

            // 이름 + 학번 모두 있어야 저장
            if (studentName && grade && classNum && studentNumber) {
                await env.DB.prepare(`
                    INSERT INTO student_profiles(name, grade, classNum, studentNumber, instructionDismissed)
                    VALUES(?, ?, ?, ?, ?)
                    ON CONFLICT(name, grade, classNum, studentNumber) DO UPDATE SET 
                        instructionDismissed = ?
                `).bind(studentName, grade, classNum, studentNumber, Date.now(), Date.now()).run();

                // ip_profiles도 업데이트
                await env.DB.prepare(`
                    INSERT INTO ip_profiles(ip, instructionDismissed, lastAccess)
                    VALUES(?, ?, datetime('now'))
                    ON CONFLICT(ip) DO UPDATE SET 
                        instructionDismissed = ?,
                        lastAccess = datetime('now')
                `).bind(ip, Date.now(), Date.now()).run();
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (e: any) {
            console.error("POST dismiss error:", e.message);
            return new Response(JSON.stringify({ success: true, warning: e.message }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    return new Response("Method not allowed", { status: 405 });
};
