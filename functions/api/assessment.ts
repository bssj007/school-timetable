
/**
 * Cloudflare Pages Function - 수행평가 관리 API (with D1)
 * Supports Class-Specific Data
 */

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);

    // DB 바인딩 확인
    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        // GET: 목록 조회 (학년/반 필터링 필수)
        if (request.method === 'GET') {
            const grade = url.searchParams.get('grade') || '1';
            const classNum = url.searchParams.get('classNum') || '1';

            const { results } = await env.DB.prepare(
                "SELECT * FROM performance_assessments WHERE grade = ? AND classNum = ? ORDER BY dueDate ASC, id DESC"
            ).bind(grade, classNum).all();

            return new Response(JSON.stringify(results), {
                headers: { 'Content-Type': 'application/json' }
            });
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

            const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

            const result = await env.DB.prepare(
                `INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, lastModifiedIp) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
            ).bind(subject, title, description || '', dueDate, grade, classNum, classTime || null, ip).run();

            return new Response(JSON.stringify({ success: true, result }), {
                headers: { 'Content-Type': 'application/json' }
            });
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

        // PUT: 완료 여부 토글 (Optional, if needed)
        // ...

        return new Response('Method not allowed', { status: 405 });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
