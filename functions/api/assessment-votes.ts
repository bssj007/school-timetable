
/**
 * Cloudflare Pages Function - 수행평가 투표 API (assessment_votes)
 * GET: 투표 집계 / 내 투표 조회 (bulk)
 * POST: 투표 등록/변경 (UPSERT)
 * DELETE: 투표 취소
 */

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS assessment_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessmentId INTEGER NOT NULL,
    grade INTEGER NOT NULL,
    classNum INTEGER NOT NULL,
    studentNumber INTEGER NOT NULL,
    vote TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    UNIQUE(assessmentId, grade, classNum, studentNumber)
)`;

async function ensureTable(db: any) {
    try {
        await db.prepare(CREATE_TABLE_SQL).run();
    } catch (e: any) {
        console.error("[AssessmentVotes] ensureTable error:", e);
    }
}

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const url = new URL(request.url);

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        // ─── GET ───────────────────────────────────────────
        if (request.method === 'GET') {
            const assessmentIds = url.searchParams.get('assessmentIds'); // comma-separated
            const grade = url.searchParams.get('grade');
            const classNum = url.searchParams.get('classNum');
            const studentNumber = url.searchParams.get('studentNumber');

            if (!assessmentIds) {
                return new Response(JSON.stringify({ error: 'Missing assessmentIds' }), { status: 400 });
            }

            const ids = assessmentIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            if (ids.length === 0) {
                return new Response(JSON.stringify({ votes: {}, myVotes: {} }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const placeholders = ids.map(() => '?').join(',');

            try {
                // 1. Aggregate counts per assessmentId
                const { results: aggRows } = await env.DB.prepare(
                    `SELECT assessmentId, vote, COUNT(*) as count FROM assessment_votes WHERE assessmentId IN (${placeholders}) GROUP BY assessmentId, vote`
                ).bind(...ids).all();

                const votes: Record<string, { helpful: number; distrust: number }> = {};
                for (const row of (aggRows || [])) {
                    const aid = String(row.assessmentId);
                    if (!votes[aid]) votes[aid] = { helpful: 0, distrust: 0 };
                    if (row.vote === 'helpful') votes[aid].helpful = row.count as number;
                    if (row.vote === 'distrust') votes[aid].distrust = row.count as number;
                }

                // 2. My votes (if student info provided)
                let myVotes: Record<string, string> = {};
                if (grade && classNum && studentNumber) {
                    const { results: myRows } = await env.DB.prepare(
                        `SELECT assessmentId, vote FROM assessment_votes WHERE assessmentId IN (${placeholders}) AND grade = ? AND classNum = ? AND studentNumber = ?`
                    ).bind(...ids, grade, classNum, studentNumber).all();

                    for (const row of (myRows || [])) {
                        myVotes[String(row.assessmentId)] = row.vote as string;
                    }
                }

                return new Response(JSON.stringify({ votes, myVotes }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    await ensureTable(env.DB);
                    return new Response(JSON.stringify({ votes: {}, myVotes: {} }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                throw e;
            }
        }

        // ─── POST (UPSERT) ────────────────────────────────
        if (request.method === 'POST') {
            const body = await request.json();
            const { assessmentId, grade, classNum, studentNumber, vote } = body;

            if (!assessmentId || !grade || !classNum || !studentNumber || !vote) {
                return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
            }

            if (vote !== 'helpful' && vote !== 'distrust') {
                return new Response(JSON.stringify({ error: 'Invalid vote value' }), { status: 400 });
            }

            try {
                await env.DB.prepare(
                    `INSERT INTO assessment_votes (assessmentId, grade, classNum, studentNumber, vote)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(assessmentId, grade, classNum, studentNumber)
                     DO UPDATE SET vote = excluded.vote`
                ).bind(assessmentId, grade, classNum, studentNumber, vote).run();

                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    await ensureTable(env.DB);
                    // Retry
                    await env.DB.prepare(
                        `INSERT INTO assessment_votes (assessmentId, grade, classNum, studentNumber, vote)
                         VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(assessmentId, grade, classNum, studentNumber)
                         DO UPDATE SET vote = excluded.vote`
                    ).bind(assessmentId, grade, classNum, studentNumber, vote).run();

                    return new Response(JSON.stringify({ success: true }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                throw e;
            }
        }

        // ─── DELETE ────────────────────────────────────────
        if (request.method === 'DELETE') {
            const assessmentId = url.searchParams.get('assessmentId');
            const grade = url.searchParams.get('grade');
            const classNum = url.searchParams.get('classNum');
            const studentNumber = url.searchParams.get('studentNumber');

            if (!assessmentId || !grade || !classNum || !studentNumber) {
                return new Response(JSON.stringify({ error: 'Missing required params' }), { status: 400 });
            }

            try {
                await env.DB.prepare(
                    `DELETE FROM assessment_votes WHERE assessmentId = ? AND grade = ? AND classNum = ? AND studentNumber = ?`
                ).bind(assessmentId, grade, classNum, studentNumber).run();
            } catch (e: any) {
                if (e.message && e.message.includes("no such table")) {
                    await ensureTable(env.DB);
                    // Table didn't exist, so nothing to delete
                }
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('Method not allowed', { status: 405 });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
