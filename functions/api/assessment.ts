
/**
 * Cloudflare Pages Function - 수행평가 관리 API (with D1)
 * Supports Class-Specific Data
 */

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
            const dataset = url.searchParams.get('dataset') || '';
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
                          lastModifiedIp TEXT,
                          isDeleted INTEGER DEFAULT 0,
                          votes TEXT DEFAULT '[]',
                          tempDueDate TEXT,
                          tempClassTime INTEGER
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

        // POST: 추가
        if (request.method === 'POST') {
            const body = await request.json();
            const { subject, title, dueDate, description, grade, classNum, classTime } = body;

            if (!subject || !title || !dueDate || !grade || !classNum) {
                return new Response("Missing required fields", { status: 400 });
            }

            console.log('[Assessment API] Creating:', { subject, title, dueDate, grade, classNum, classTime });

            // Check if the subject is an elective (isMovingClass = 1)
            let actualClassNum = classNum;
            try {
                const electiveConfig = await env.DB.prepare(
                    "SELECT isMovingClass FROM elective_config WHERE grade = ? AND subject = ?"
                ).bind(grade, subject).first();

                if (electiveConfig && electiveConfig.isMovingClass === 1) {
                    actualClassNum = 0; // 0 indicates it applies to all classes in the grade
                    console.log(`[Assessment API] Subject ${subject} is a moving class. Setting classNum to 0.`);
                }
            } catch (e) {
                console.error("[Assessment API] Error checking elective config:", e);
                // Fail gracefully, keep actualClassNum as the specific class
            }

            // 중복 체크: 같은 날짜, 같은 교시에 이미 수행평가가 있는지 확인
            const dataset = body.dataset || '';

            // 중복 체크
            if (classTime) {
                const existing = await env.DB.prepare(
                    "SELECT id FROM performance_assessments WHERE grade = ? AND classNum = ? AND dueDate = ? AND classTime = ? AND dataset = ? AND isDeleted = 0"
                ).bind(grade, actualClassNum, dueDate, classTime, dataset).first();

                if (existing) {
                    return new Response(JSON.stringify({ error: "이미 해당 교시에 수행평가가 등록되어 있습니다." }), {
                        status: 409, // Conflict
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }

            const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

            try {
                // Try inserting with lastModifiedIp and dataset (New Schema)
                const result = await env.DB.prepare(
                    `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, dataset, lastModifiedIp)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
                ).bind(subject, title, description || '', dueDate, grade, actualClassNum, classTime || null, dataset, ip).run();

                return new Response(JSON.stringify({ success: true, result }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (insertError: any) {
                const errorMsg = insertError.message || "";

                if (errorMsg.includes("no such table")) {
                    // Table missing -> Create and Retry
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
                          lastModifiedIp TEXT,
                          isDeleted INTEGER DEFAULT 0,
                          votes TEXT DEFAULT '[]',
                          tempDueDate TEXT,
                          tempClassTime INTEGER
                        )
                    `).run();
                    // Add isDeleted column if missing (migration for older tables)
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0").run(); } catch (_) {}
                    // Add dataset column if missing (migration for older tables)
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN dataset TEXT DEFAULT ''").run(); } catch (_) {}
                    // Add temp columns if missing
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempDueDate TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempClassTime INTEGER").run(); } catch (_) {}

                    // Retry
                    const result = await env.DB.prepare(
                        `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, dataset, lastModifiedIp)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
                    ).bind(subject, title, description || '', dueDate, grade, actualClassNum, classTime || null, dataset, ip).run();

                    return new Response(JSON.stringify({ success: true, result }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                console.error("[Assessment API] Insert with IP/dataset failed, attempting fallback:", insertError.message);

                // Fallback: Insert without lastModifiedIp and/or dataset (Old Schema)
                // Check if 'dataset' column is missing
                if (errorMsg.includes("no such column") && errorMsg.includes("dataset")) {
                    console.log("[Assessment API] 'dataset' column missing in POST. Attempting to add it.");
                    await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN dataset TEXT DEFAULT ''").run();
                    // Retry with dataset, but potentially without lastModifiedIp if that was the original issue
                    const result = await env.DB.prepare(
                        `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, dataset, lastModifiedIp)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
                    ).bind(subject, title, description || '', dueDate, grade, actualClassNum, classTime || null, dataset, ip).run();
                    return new Response(JSON.stringify({ success: true, result, warning: "Dataset column added and retried" }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                // Check if 'lastModifiedIp' column is missing
                if (errorMsg.includes("no such column") && errorMsg.includes("lastModifiedIp")) {
                    console.log("[Assessment API] 'lastModifiedIp' column missing in POST. Attempting to add it.");
                    await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN lastModifiedIp TEXT").run();
                    // Retry with lastModifiedIp, but potentially without dataset if that was the original issue
                    const result = await env.DB.prepare(
                        `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, dataset, lastModifiedIp)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
                    ).bind(subject, title, description || '', dueDate, grade, actualClassNum, classTime || null, dataset, ip).run();
                    return new Response(JSON.stringify({ success: true, result, warning: "lastModifiedIp column added and retried" }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Final fallback if both are missing or other error
                const result = await env.DB.prepare(
                    `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
                ).bind(subject, title, description || '', dueDate, grade, actualClassNum, classTime || null).run();

                return new Response(JSON.stringify({ success: true, result, warning: "IP not saved due to schema mismatch" }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // DELETE: 삭제 (보안상 좋지 않지만 일단 ID로 삭제)
        if (request.method === 'DELETE') {
            const id = url.searchParams.get('id');
            if (!id) return new Response('Missing ID', { status: 400 });

            try {
                await env.DB.prepare(
                    "UPDATE performance_assessments SET isDeleted = 1 WHERE id = ?"
                ).bind(id).run();
            } catch (err: any) {
                if (err.message && err.message.includes("no such column") && err.message.includes("isDeleted")) {
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

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // PATCH: 수정
        if (request.method === 'PATCH') {
            const body = await request.json();
            const { id, subject, title, description, dueDate, round, classTime, tempDueDate, tempClassTime } = body;

            if (!id) return new Response('Missing ID', { status: 400 });

            // 동적 쿼리 생성
            const updates: string[] = [];
            const values: any[] = [];

            if (subject !== undefined) { updates.push("subject = ?"); values.push(subject); }
            if (title !== undefined) { updates.push("title = ?"); values.push(title); }
            if (description !== undefined) { updates.push("description = ?"); values.push(description); }
            if (dueDate !== undefined) { updates.push("dueDate = ?"); values.push(dueDate); }
            if (classTime !== undefined) { updates.push("classTime = ?"); values.push(classTime); }
            
            if (tempDueDate !== undefined) { 
                updates.push("tempDueDate = ?"); 
                values.push(tempDueDate); 
            } else if (dueDate !== undefined) {
                // 원본 날짜가 수정될 때는 기존의 임시 연기 날짜를 삭제함 (수동으로 제공되지 않은 경우)
                updates.push("tempDueDate = NULL");
                updates.push("tempClassTime = NULL");
            }
            
            if (tempClassTime !== undefined) { 
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
                return new Response(JSON.stringify({ success: true, result }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (updateError: any) {
                const errorMsg = updateError.message || "";

                // Auto-Heal: Missing Column 'tempDueDate' / 'tempClassTime'
                if (errorMsg.includes("no such column") && (errorMsg.includes("tempDueDate") || errorMsg.includes("tempClassTime"))) {
                    console.log("[Assessment API] 'temp' columns missing in PATCH. Attempting to add them.");
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempDueDate TEXT").run(); } catch (_) {}
                    try { await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN tempClassTime INTEGER").run(); } catch (_) {}

                    const retryResult = await env.DB.prepare(query).bind(...values).run();
                    return new Response(JSON.stringify({ success: true, result: retryResult }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // Auto-Heal: Missing Column 'lastModifiedIp'
                if (errorMsg.includes("no such column") && errorMsg.includes("lastModifiedIp")) {
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
