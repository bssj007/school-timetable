
/**
 * Cloudflare Pages Function - 수행평가 관리 API (with D1)
 * Supports Class-Specific Data
 */

/**
 * POST 처리 전 스키마 마이그레이션을 한 번에 보장한다.
 * 컬럼이 이미 존재하는 경우 ALTER TABLE은 조용히 무시된다.
 */
async function ensureSchema(db: any) {
    const tableSql = `
        CREATE TABLE IF NOT EXISTS performance_assessments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          dueDate TEXT NOT NULL,
          grade INTEGER NOT NULL,
          classNum INTEGER NOT NULL,
          classTime INTEGER,
          isDone INTEGER DEFAULT 0,
          dataset TEXT DEFAULT '',
          createdAt TEXT DEFAULT (datetime('now')),
          isDeleted INTEGER DEFAULT 0,
          votes TEXT DEFAULT '[]',
          tempDueDate TEXT,
          tempClassTime INTEGER,
          teacher TEXT,
          classCode TEXT,
          isTeacherCreated INTEGER DEFAULT 0,
          activityType TEXT DEFAULT '수행평가',
          lastModifiedIp TEXT
        )
    `;
    await db.prepare(tableSql).run();

    const migrations: string[] = [
        "ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0",
        "ALTER TABLE performance_assessments ADD COLUMN dataset TEXT DEFAULT ''",
        "ALTER TABLE performance_assessments ADD COLUMN votes TEXT DEFAULT '[]'",
        "ALTER TABLE performance_assessments ADD COLUMN tempDueDate TEXT",
        "ALTER TABLE performance_assessments ADD COLUMN tempClassTime INTEGER",
        "ALTER TABLE performance_assessments ADD COLUMN teacher TEXT",
        "ALTER TABLE performance_assessments ADD COLUMN classCode TEXT",
        "ALTER TABLE performance_assessments ADD COLUMN isTeacherCreated INTEGER DEFAULT 0",
        "ALTER TABLE performance_assessments ADD COLUMN activityType TEXT DEFAULT '수행평가'",
        "ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT",
    ];
    for (const sql of migrations) {
        try { await db.prepare(sql).run(); } catch (_) { /* 이미 존재하면 무시 */ }
    }
}

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);
    // 5. Client ID from Context
    const clientId = (context.data as any).clientId;

    // DB 바인딩 확인
    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        // GET: 목록 조회 (학년/반 필터링 필수)
        if (request.method === 'GET') {
            const grade = url.searchParams.get('grade') || '1';
            const classNum = url.searchParams.get('classNum') || '1';

            let query = "SELECT * FROM performance_assessments WHERE grade = ? AND (classNum = ? OR classNum = 0) AND isDeleted = 0";
            const params: any[] = [grade, classNum];

            // Filter by dataset if provided, else filter by empty string (default manual)
            const rawDataset = url.searchParams.get('dataset') || '';
            const dataset = (rawDataset === 'MANUAL_PLAN' || rawDataset === 'SEMESTER_PLAN') ? rawDataset : 'COMCIGAN';
            query += " AND dataset = ?";
            params.push(dataset);

            query += " ORDER BY dueDate ASC";

            try {
                const { results } = await env.DB.prepare(query)
                    .bind(...params)
                    .all();

                return new Response(JSON.stringify(results), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    // Table missing? Create it and return empty list
                    await env.DB.prepare(`
                        CREATE TABLE IF NOT EXISTS performance_assessments (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          subject TEXT NOT NULL,
                          title TEXT NOT NULL,
                          description TEXT,
                          dueDate TEXT NOT NULL,
                          grade INTEGER NOT NULL,
                          classNum INTEGER NOT NULL,
                          classTime INTEGER,
                          isDone INTEGER DEFAULT 0,
                          dataset TEXT DEFAULT '',
                          createdAt TEXT DEFAULT (datetime('now')),
                          isDeleted INTEGER DEFAULT 0,
                          votes TEXT DEFAULT '[]',
                          tempDueDate TEXT,
                          tempClassTime INTEGER,
                          teacher TEXT,
                          classCode TEXT,
                          isTeacherCreated INTEGER DEFAULT 0,
                          activityType TEXT DEFAULT '수행평가'
                        )
                    `).run();
                    // Add isDeleted column if missing (migration for older tables)
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0").run(); } catch (_) {}
                    // Add dataset column if missing (migration for older tables)
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN dataset TEXT DEFAULT ''").run(); } catch (_) {}
                    // Add votes column if missing 
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN votes TEXT DEFAULT '[]'").run(); } catch (_) {}
                    // Add temp columns if missing
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempDueDate TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempClassTime INTEGER").run(); } catch (_) {}
                    // Add new columns for identification
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN teacher TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN classCode TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isTeacherCreated INTEGER DEFAULT 0").run(); } catch (_) {}
                    // Add activityType column if missing
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN activityType TEXT DEFAULT '수행평가'").run(); } catch (_) {}
                    return new Response(JSON.stringify([]), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Column missing
                if (e.message && e.message.includes("no such column") && e.message.includes("isDeleted")) {
                    console.log("[Assessment API] 'isDeleted' column missing in GET. Attempting to add it.");
                    await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0").run();

                    // Retry original query
                    const { results } = await env.DB.prepare(query).bind(...params).all();

                    return new Response(JSON.stringify(results), {
                         headers: { 'Content-Type': 'application/json' }
                    });
                }
                // Column missing: dataset
                if (e.message && e.message.includes("no such column") && e.message.includes("dataset")) {
                    console.log("[Assessment API] 'dataset' column missing in GET. Attempting to add it.");
                    await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN dataset TEXT DEFAULT ''").run();

                    // Retry original query
                    const { results } = await env.DB.prepare(query).bind(...params).all();

                    return new Response(JSON.stringify(results), {
                         headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                // Column missing: tempDueDate or tempClassTime
                if (e.message && e.message.includes("no such column") && (e.message.includes("tempDueDate") || e.message.includes("tempClassTime"))) {
                    console.log("[Assessment API] 'temp' columns missing in GET. Attempting to add them.");
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempDueDate TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempClassTime INTEGER").run(); } catch (_) {}

                    // Retry original query
                    const { results } = await env.DB.prepare(query).bind(...params).all();

                    return new Response(JSON.stringify(results), {
                         headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                // Column missing: teacher or classCode
                if (e.message && e.message.includes("no such column") && (e.message.includes("teacher") || e.message.includes("classCode"))) {
                    console.log("[Assessment API] 'teacher'/'classCode' columns missing in GET. Attempting to add them.");
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN teacher TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN classCode TEXT").run(); } catch (_) {}

                    // Retry original query
                    const { results } = await env.DB.prepare(query).bind(...params).all();

                    return new Response(JSON.stringify(results), {
                         headers: { 'Content-Type': 'application/json' }
                    });
                }

                return new Response(JSON.stringify({ error: `Failed query: ${e.message}` }), { status: 500 });
            }
        }

        // PATCH with action=vote: 투표 등록/변경/취소
        if (request.method === 'PATCH' && url.searchParams.get('action') === 'vote') {
            const body = await request.json();
            const { assessmentId, grade: vGrade, classNum: vClass, studentNumber: vStudent, vote } = body;

            if (!assessmentId || !vGrade || !vClass || !vStudent) {
                return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
            }

            try {
                // Read current votes
                const row = await env.DB.prepare(
                    "SELECT votes FROM performance_assessments WHERE id = ?"
                ).bind(assessmentId).first();

                if (!row) {
                    return new Response(JSON.stringify({ error: 'Assessment not found' }), { status: 404 });
                }

                let votesArr: { g: number; c: number; s: number; v: string }[] = [];
                try { votesArr = JSON.parse((row.votes as string) || '[]'); } catch { votesArr = []; }

                // Find existing vote for this student
                const idx = votesArr.findIndex(x => x.g === vGrade && x.c === vClass && x.s === vStudent);

                if (!vote) {
                    // DELETE vote
                    if (idx >= 0) votesArr.splice(idx, 1);
                } else if (vote === 'helpful' || vote === 'distrust') {
                    // UPSERT vote
                    if (idx >= 0) {
                        votesArr[idx].v = vote;
                    } else {
                        votesArr.push({ g: vGrade, c: vClass, s: vStudent, v: vote });
                    }
                } else {
                    return new Response(JSON.stringify({ error: 'Invalid vote value' }), { status: 400 });
                }

                // Save back
                await env.DB.prepare(
                    "UPDATE performance_assessments SET votes = ? WHERE id = ?"
                ).bind(JSON.stringify(votesArr), assessmentId).run();

                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e: any) {
                if (e.message && e.message.includes("no such column") && e.message.includes("votes")) {
                    // Auto-heal: add votes column
                    try {
                        await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN votes TEXT DEFAULT '[]'").run();
                    } catch (_) { /* already exists */ }
                    // Retry with empty votes
                    const votesArr = vote ? [{ g: vGrade, c: vClass, s: vStudent, v: vote }] : [];
                    await env.DB.prepare(
                        "UPDATE performance_assessments SET votes = ? WHERE id = ?"
                    ).bind(JSON.stringify(votesArr), assessmentId).run();
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                throw e;
            }
        }

        // POST: 추가 또는 자동예측
        if (request.method === 'POST') {
            const action = url.searchParams.get('action');

            if (action === 'predict' || action === 'preview' || action === 'force_predict') {
                try {
                    // Fetch all valid assessments across the whole school
                    // We only predict for assessments that haven't been manually deleted
                    const query = "SELECT * FROM performance_assessments WHERE isDeleted = 0";
                    const { results } = await env.DB.prepare(query).all();
                    
                    if (results && results.length > 0) {
                        const { applyAutoPredictions } = await import('../server/autoPredict');
                        
                        if (action === 'preview') {
                            // Run in preview mode (does not save to DB)
                            const previewResults = await applyAutoPredictions(results, env.DB, true);
                            return new Response(JSON.stringify({ success: true, data: previewResults }), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        } else if (action === 'force_predict') {
                            // applyAutoPredictions updates SQLite directly via db.prepare()
                            await applyAutoPredictions(results, env.DB, false, true); // force execution bypassing pause
                        } else {
                            // standard predict (respects pause check)
                            await applyAutoPredictions(results, env.DB, false, false);
                        }
                    }
                    
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (e: any) {
                    console.error(`[Assessment API/${action}] Error:`, e);
                    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
                }
            }

            const body = await request.json();
            const { subject, title, dueDate, description, grade, classNum, classTime, teacher, classCode, isTeacherCreated, activityType } = body;

            if (!subject || !title || !dueDate || !grade || !classNum) {
                return new Response("Missing required fields", { status: 400 });
            }
            // activityType 정규화: NULL이나 미입력 시 '수행평가'로 취급
            const resolvedActivityType = (activityType && activityType.trim()) ? activityType.trim() : '수행평가';

            // 학년별 등록 주체(학생/선생님) 권한 검증
            const targetGrade = parseInt(grade, 10);
            const isTeacher = isTeacherCreated === 1 || body.role === 'teacher';

            try {
                const permKey = isTeacher
                    ? `assessment_allow_teacher_grade${targetGrade}`
                    : `assessment_allow_student_grade${targetGrade}`;
                const msgKey = isTeacher
                    ? 'assessment_disallow_msg_teacher'
                    : 'assessment_disallow_msg_student';

                const permRows = await env.DB.prepare(
                    "SELECT key, value FROM system_settings WHERE key IN (?, ?)"
                ).bind(permKey, msgKey).all();

                const permMap: Record<string, string> = {};
                (permRows?.results || []).forEach((r: any) => { permMap[r.key] = r.value; });

                const isAllowed = permMap[permKey] !== 'false';
                if (!isAllowed) {
                    const defaultMsg = isTeacher
                        ? '현재 해당 학년의 선생님 수행평가 등록이 제한되어 있습니다.'
                        : '현재 해당 학년의 학생 수행평가 등록이 제한되어 있습니다.';
                    const errorMsg = permMap[msgKey] || defaultMsg;
                    return new Response(JSON.stringify({ error: errorMsg }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            } catch (permErr) {
                console.error("[Assessment API] Permission check failed (proceeding):", permErr);
            }

            console.log('[Assessment API] Creating:', { subject, title, dueDate, grade, classNum, classTime, teacher, classCode });

            // Check if the subject is an elective (isMovingClass = 1)
            let actualClassNum = classNum;
            const baseSubject = subject.replace(/\s*\(.*$/, '').trim();
            try {
                const electiveConfig = await env.DB.prepare(
                    "SELECT isMovingClass FROM elective_config WHERE grade = ? AND (subject = ? OR fullSubjectName = ?)"
                ).bind(grade, baseSubject, baseSubject).first();

                if (electiveConfig && electiveConfig.isMovingClass === 1) {
                    actualClassNum = 0; // 0 indicates it applies to all classes in the grade
                    console.log(`[Assessment API] Subject ${baseSubject} is a moving class. Setting classNum to 0.`);
                }
            } catch (e) {
                console.error("[Assessment API] Error checking elective config:", e);
                // Fail gracefully, keep actualClassNum as the specific class
            }

            // 중복 체크: 같은 날짜, 같은 교시에 이미 수행평가가 있는지 확인
            const rawDataset = body.dataset || '';
            const dataset = (rawDataset === 'MANUAL_PLAN' || rawDataset === 'SEMESTER_PLAN') ? rawDataset : 'COMCIGAN';

            // 중복 체크
            if (classTime) {
                const existing = await env.DB.prepare(
                    "SELECT id FROM performance_assessments WHERE grade = ? AND classNum = ? AND COALESCE(tempDueDate, dueDate) = ? AND COALESCE(tempClassTime, classTime) = ? AND dataset = ? AND isDeleted = 0"
                ).bind(grade, actualClassNum, dueDate, classTime, dataset).first();

                if (existing) {
                    return new Response(JSON.stringify({ error: "해당 교시에 이미 수행평가가 등록되어 있습니다." }), {
                        status: 409, // Conflict
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }

            const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

            // 모든 컬럼이 존재함을 보장한 뒤 INSERT
            await ensureSchema(env.DB);

            try {
                const result = await env.DB.prepare(
                    `INSERT INTO performance_assessments
                     (subject, title, description, dueDate, grade, classNum, classTime, isDone,
                      dataset, lastModifiedIp, teacher, classCode, isTeacherCreated, activityType)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    subject, title, description || '', dueDate, grade, actualClassNum,
                    classTime || null, dataset, ip,
                    teacher || null, classCode || null,
                    isTeacherCreated || 0, resolvedActivityType
                ).run();

                try {
                    const { applyAutoPredictions } = await import('../server/autoPredict');
                    const { results } = await env.DB.prepare(
                        "SELECT * FROM performance_assessments WHERE isDeleted = 0"
                    ).all();
                    await applyAutoPredictions(results, env.DB);
                } catch(e) {
                    console.error("[Assessment API/POST] Predict error:", e);
                }

                return new Response(JSON.stringify({ success: true, result }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (insertError: any) {
                console.error("[Assessment API] INSERT failed after ensureSchema:", insertError.message);
                return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
            }
        }

        // DELETE: 삭제 (보안상 좋지 않지만 일단 ID로 삭제)
        if (request.method === 'DELETE') {
            const id = url.searchParams.get('id');
            if (!id) return new Response('Missing ID', { status: 400 });

            try {
                let isTeacherCreated = 0;
                let assessmentGrade: any = null;
                try {
                    const existing: any = await env.DB.prepare(
                        "SELECT isTeacherCreated, grade FROM performance_assessments WHERE id = ?"
                    ).bind(id).first();
                    if (existing) {
                        isTeacherCreated = existing.isTeacherCreated || 0;
                        assessmentGrade = existing.grade;
                    }
                } catch (dbErr: any) {
                    console.log("[Assessment API] isTeacherCreated check failed, assuming 0:", dbErr.message);
                }

                const role = url.searchParams.get('role');
                const isTeacher = role === 'teacher';

                if (isTeacherCreated === 1 && !isTeacher) {
                    return new Response(JSON.stringify({ error: '선생님이 직접 등록한 수행평가는 삭제할 수 없습니다.' }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // 학생 권한 비활성화 시 삭제 차단
                if (!isTeacher && assessmentGrade) {
                    const targetGrade = parseInt(assessmentGrade, 10);
                    const permKey = `assessment_allow_student_grade${targetGrade}`;
                    const msgKey = 'assessment_disallow_msg_student';
                    const permRows = await env.DB.prepare(
                        "SELECT key, value FROM system_settings WHERE key IN (?, ?)"
                    ).bind(permKey, msgKey).all().catch(() => null);

                    const permMap: Record<string, string> = {};
                    (permRows?.results || []).forEach((r: any) => { permMap[r.key] = r.value; });

                    if (permMap[permKey] === 'false') {
                        const defaultMsg = '현재 학생의 수행평가 등록이 제한되어 있습니다.';
                        return new Response(JSON.stringify({ error: permMap[msgKey] || defaultMsg }), {
                            status: 403,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }

                await env.DB.prepare(
                    "UPDATE performance_assessments SET isDeleted = 1 WHERE id = ?"
                ).bind(id).run();
            } catch (err: any) {
                if (err.message && (err.message.includes("no such column") || err.message.includes("no column")) && err.message.includes("isDeleted")) {
                    console.log("[Assessment API] 'isDeleted' column missing in DELETE. Attempting to add it.");
                    await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0").run();
                    
                    // Retry Soft Delete
                    await env.DB.prepare(
                        "UPDATE performance_assessments SET isDeleted = 1 WHERE id = ?"
                    ).bind(id).run();
                } else {
                    throw err;
                }
            }

            try { const { applyAutoPredictions } = await import('../server/autoPredict'); const { results } = await env.DB.prepare("SELECT * FROM performance_assessments WHERE isDeleted = 0").all(); await applyAutoPredictions(results, env.DB); } catch(e) { console.error("[Assessment API/DELETE] Predict error:", e); }
            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // PATCH: 수정 및 연기
        if (request.method === 'PATCH') {
            const body = await request.json();
            const { id, subject, title, description, dueDate, round, classTime, tempDueDate, tempClassTime, teacher, classCode, isAutoPredicted, activityType: patchActivityType } = body;

            if (!id) return new Response('Missing ID', { status: 400 });

            const isTeacher = body.role === 'teacher' || body.isTeacherCreated === 1;
            // 학생 권한 비활성화 시 수정 및 연기 차단
            if (!isTeacher) {
                let targetGrade = body.grade ? parseInt(body.grade, 10) : null;
                if (!targetGrade) {
                    try {
                        const row: any = await env.DB.prepare("SELECT grade FROM performance_assessments WHERE id = ?").bind(id).first();
                        if (row) targetGrade = parseInt(row.grade, 10);
                    } catch (_) {}
                }

                if (targetGrade) {
                    const permKey = `assessment_allow_student_grade${targetGrade}`;
                    const msgKey = 'assessment_disallow_msg_student';
                    const permRows = await env.DB.prepare(
                        "SELECT key, value FROM system_settings WHERE key IN (?, ?)"
                    ).bind(permKey, msgKey).all().catch(() => null);

                    const permMap: Record<string, string> = {};
                    (permRows?.results || []).forEach((r: any) => { permMap[r.key] = r.value; });

                    if (permMap[permKey] === 'false') {
                        const defaultMsg = '현재 학생의 수행평가 등록이 제한되어 있습니다.';
                        return new Response(JSON.stringify({ error: permMap[msgKey] || defaultMsg }), {
                            status: 403,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
            }

            // 동적 쿼리 생성
            const updates: string[] = [];
            const values: any[] = [];

            if (subject !== undefined) { updates.push("subject = ?"); values.push(subject); }
            if (title !== undefined) { updates.push("title = ?"); values.push(title); }
            if (description !== undefined) { updates.push("description = ?"); values.push(description); }
            if (dueDate !== undefined) { updates.push("dueDate = ?"); values.push(dueDate); }
            if (classTime !== undefined) { updates.push("classTime = ?"); values.push(classTime); }
            if (teacher !== undefined) { updates.push("teacher = ?"); values.push(teacher); }
            if (classCode !== undefined) { updates.push("classCode = ?"); values.push(classCode); }
            if (patchActivityType !== undefined) { updates.push("activityType = ?"); values.push((patchActivityType && patchActivityType.trim()) ? patchActivityType.trim() : '수행평가'); }
            // tempDueDate 비교를 위해 현재 DB의 원본 dueDate를 조회
            let originalDueDate = dueDate;
            let originalClassTime = classTime;
            
            if (originalDueDate === undefined || originalClassTime === undefined) {
                try {
                    const row = await env.DB.prepare("SELECT dueDate, classTime FROM performance_assessments WHERE id = ?").bind(id).first();
                    if (row) {
                        if (originalDueDate === undefined) originalDueDate = row.dueDate;
                        if (originalClassTime === undefined) originalClassTime = row.classTime;
                    }
                } catch (e) { console.error("Failed to fetch original dates:", e); }
            }

            // 사용자 연기 요청
            if (tempDueDate !== undefined) { 
                // 연기 목표가 원본 날짜와 같으면 연기 상태 해제
                if (tempDueDate === originalDueDate && tempClassTime === originalClassTime) {
                    updates.push("tempDueDate = NULL");
                    updates.push("tempClassTime = NULL");
                    updates.push("isAutoPredicted = 0"); // 수동/자동 상태 해제
                } else {
                    updates.push("tempDueDate = ?"); 
                    values.push(tempDueDate); 
                    if (isAutoPredicted !== undefined) {
                        updates.push("isAutoPredicted = ?");
                        values.push(isAutoPredicted);
                    }
                }
            } else if (dueDate !== undefined) {
                // 원본 날짜가 수정될 때는 기존의 임시 연기 날짜를 삭제함 (수동으로 제공되지 않은 경우)
                updates.push("tempDueDate = NULL");
                updates.push("tempClassTime = NULL");
                updates.push("isAutoPredicted = 0");
            }
            
            if (tempClassTime !== undefined && (tempDueDate !== originalDueDate || tempClassTime !== originalClassTime)) { 
                updates.push("tempClassTime = ?"); 
                values.push(tempClassTime); 
            }

            // lastModifiedIp 업데이트
            const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
            updates.push("lastModifiedIp = ?");
            values.push(ip);

            if (updates.length === 0) {
                return new Response(JSON.stringify({ success: true, message: "No changes detected" }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const query = `UPDATE performance_assessments SET ${updates.join(", ")} WHERE id = ?`;
            values.push(id);

            try {
                const result = await env.DB.prepare(query).bind(...values).run();
                try { const { applyAutoPredictions } = await import('../server/autoPredict'); const { results } = await env.DB.prepare("SELECT * FROM performance_assessments WHERE isDeleted = 0").all(); await applyAutoPredictions(results, env.DB); } catch(e) { console.error("[Assessment API/PATCH] Predict error:", e); }
                return new Response(JSON.stringify({ success: true, result }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (updateError: any) {
                const errorMsg = updateError.message || "";

                // Auto-Heal: Missing Column 'tempDueDate' / 'tempClassTime'
                if ((errorMsg.includes("no such column") || errorMsg.includes("no column")) && (errorMsg.includes("tempDueDate") || errorMsg.includes("tempClassTime"))) {
                    console.log("[Assessment API] 'temp' columns missing in PATCH. Attempting to add them.");
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempDueDate TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempClassTime INTEGER").run(); } catch (_) {}

                    const retryResult = await env.DB.prepare(query).bind(...values).run();
                    return new Response(JSON.stringify({ success: true, result: retryResult }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Auto-Heal: Missing Column 'lastModifiedIp'
                if ((errorMsg.includes("no such column") || errorMsg.includes("no column")) && errorMsg.includes("lastModifiedIp")) {
                    console.log("[Assessment API] 'lastModifiedIp' column missing in PATCH. Attempting to add it.");
                    try {
                        await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT").run();

                        // Retry Update
                        const retryResult = await env.DB.prepare(query).bind(...values).run();
                        return new Response(JSON.stringify({ success: true, result: retryResult }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    } catch (alterError) {
                        console.error("[Assessment API] Auto-heal failed:", alterError);
                        // Fallback: Update without IP
                        const fallbackUpdates = updates.filter(u => !u.includes("lastModifiedIp"));
                        const fallbackValues = values.slice(0, -2).concat(values.slice(-1)); // Remove IP from values (second to last), keep ID (last)
                        // Wait, values structure: [val1, val2, ..., IP, ID]
                        // We need to remove IP. IP is at index (values.length - 2).

                        // Safer way to verify fallback construction:
                        // Reconstruct query/values omitting IP
                        const fbUpdates: string[] = [];
                        const fbValues: any[] = [];

                        if (subject !== undefined) { fbUpdates.push("subject = ?"); fbValues.push(subject); }
                        if (title !== undefined) { fbUpdates.push("title = ?"); fbValues.push(title); }
                        if (description !== undefined) { fbUpdates.push("description = ?"); fbValues.push(description); }
                        if (dueDate !== undefined) { fbUpdates.push("dueDate = ?"); fbValues.push(dueDate); }
                        if (classTime !== undefined) { fbUpdates.push("classTime = ?"); fbValues.push(classTime); }
                        // Skip lastModifiedIp

                        if (fbUpdates.length === 0) {
                            return new Response(JSON.stringify({ success: true, message: "No changes detected (Fallback)" }), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        const fbQuery = `UPDATE performance_assessments SET ${fbUpdates.join(", ")} WHERE id = ?`;
                        fbValues.push(id);

                        const fallbackResult = await env.DB.prepare(fbQuery).bind(...fbValues).run();
                        return new Response(JSON.stringify({ success: true, result: fallbackResult, warning: "IP not saved due to schema error" }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }

                // Auto-Heal: Missing Column 'teacher' / 'classCode'
                if ((errorMsg.includes("no such column") || errorMsg.includes("no column")) && (errorMsg.includes("teacher") || errorMsg.includes("classCode"))) {
                    console.log("[Assessment API] 'teacher'/'classCode' columns missing in PATCH. Attempting to add them.");
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN teacher TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN classCode TEXT").run(); } catch (_) {}

                    const retryResult = await env.DB.prepare(query).bind(...values).run();
                    return new Response(JSON.stringify({ success: true, result: retryResult }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                throw updateError;
            }
        }

        // PUT: 완료 여부 토글 (Optional, if needed)
        // ...

        return new Response('Method not allowed', { status: 405 });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
