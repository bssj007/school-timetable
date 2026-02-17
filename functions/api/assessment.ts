
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

            try {
                let query = "SELECT * FROM performance_assessments WHERE grade = ? AND classNum = ?";
                const params: any[] = [grade, classNum];

                // hide_past_assessments logic moved to frontend to preserve timetable view


                query += " ORDER BY dueDate ASC, id DESC";

                const { results } = await env.DB.prepare(query).bind(...params).all();

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
                          createdAt TEXT DEFAULT (datetime('now')),
                          lastModifiedIp TEXT
                        )
                    `).run();
                    return new Response(JSON.stringify([]), {
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

            // 중복 체크: 같은 날짜, 같은 교시에 이미 수행평가가 있는지 확인
            if (classTime) {
                const existing = await env.DB.prepare(
                    "SELECT id FROM performance_assessments WHERE grade = ? AND classNum = ? AND dueDate = ? AND classTime = ?"
                ).bind(grade, classNum, dueDate, classTime).first();

                if (existing) {
                    return new Response(JSON.stringify({ error: "이미 해당 교시에 수행평가가 등록되어 있습니다." }), {
                        status: 409, // Conflict
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }

            const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

            try {
                // Try inserting with lastModifiedIp (New Schema)
                const result = await env.DB.prepare(
                    `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, lastModifiedIp) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
                ).bind(subject, title, description || '', dueDate, grade, classNum, classTime || null, ip).run();

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
                          createdAt TEXT DEFAULT (datetime('now')),
                          lastModifiedIp TEXT
                        )
                    `).run();

                    // Retry
                    const result = await env.DB.prepare(
                        `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, lastModifiedIp) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
                    ).bind(subject, title, description || '', dueDate, grade, classNum, classTime || null, ip).run();

                    return new Response(JSON.stringify({ success: true, result }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                console.error("[Assessment API] Insert with IP failed, fallback to old schema:", insertError.message);

                // Fallback: Insert without lastModifiedIp (Old Schema)
                const result = await env.DB.prepare(
                    `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
                ).bind(subject, title, description || '', dueDate, grade, classNum, classTime || null).run();

                return new Response(JSON.stringify({ success: true, result, warning: "IP not saved due to schema mismatch" }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // DELETE: 삭제 (보안상 좋지 않지만 일단 ID로 삭제)
        if (request.method === 'DELETE') {
            const id = url.searchParams.get('id');
            if (!id) return new Response('Missing ID', { status: 400 });

            await env.DB.prepare(
                "DELETE FROM performance_assessments WHERE id = ?"
            ).bind(id).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // PATCH: 수정
        if (request.method === 'PATCH') {
            const body = await request.json();
            const { id, subject, title, description, dueDate, round, classTime } = body;

            if (!id) return new Response('Missing ID', { status: 400 });

            // 동적 쿼리 생성
            const updates: string[] = [];
            const values: any[] = [];

            if (subject !== undefined) { updates.push("subject = ?"); values.push(subject); }
            if (title !== undefined) { updates.push("title = ?"); values.push(title); }
            if (description !== undefined) { updates.push("description = ?"); values.push(description); }
            if (dueDate !== undefined) { updates.push("dueDate = ?"); values.push(dueDate); }
            if (classTime !== undefined) { updates.push("classTime = ?"); values.push(classTime); }

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
