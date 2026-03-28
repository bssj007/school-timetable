import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // Password Check (Simple Auth Middleware for Admin Routes)
    // In a real production app, use JWT or Session Cookie.
    // Here we will rely on the client sending the password in a custom header "X-Admin-Password" 
    // or we can implement a proper login session.
    // For now, let's check the header for simplicity and security.
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        if (request.method === 'GET') {
            const url = new URL(request.url);
            const isTrash = url.searchParams.get('trash') === 'true';
            
            try {
                // Fetch assessments ordered by Grade, Class, DueDate, filtered by isDeleted
                const query = isTrash 
                    ? "SELECT * FROM performance_assessments WHERE isDeleted = 1 ORDER BY grade ASC, classNum ASC, dueDate ASC"
                    : "SELECT * FROM performance_assessments WHERE isDeleted = 0 ORDER BY grade ASC, classNum ASC, dueDate ASC";
                
                const { results } = await env.DB.prepare(query).all();

                let predictedResults = results;
                if (!isTrash) {
                    const { applyAutoPredictions } = await import('../../server/autoPredict');
                    predictedResults = await applyAutoPredictions(results, env.DB);
                }

                return new Response(JSON.stringify(predictedResults), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (err: any) {
                // If isDeleted doesn't exist yet, there is no trash
                if (err.message && err.message.includes("no such column") && err.message.includes("isDeleted")) {
                    console.log("[Admin API] 'isDeleted' column missing in GET. Attempting to add it.");
                    try {
                        await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0").run();
                    } catch (alterErr) {
                         console.error("Failed to add isDeleted column:", alterErr);
                    }
                    
                    if (isTrash) {
                        return new Response(JSON.stringify([]), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    } else {
                        // Fallback to fetch all
                        const { results } = await env.DB.prepare(
                            "SELECT * FROM performance_assessments ORDER BY grade ASC, classNum ASC, dueDate ASC"
                        ).all();
                        let predictedResults = results;
                        if (!isTrash) {
                            const { applyAutoPredictions } = await import('../../server/autoPredict');
                            predictedResults = await applyAutoPredictions(results, env.DB);
                        }
                        return new Response(JSON.stringify(predictedResults), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
                throw err;
            }
        }

        if (request.method === 'PATCH') {
            // Restore from Trash (Bulk)
            const body = await request.json();
            const { ids } = body; // Array of IDs

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return new Response("Invalid IDs", { status: 400 });
            }

            const placeholders = ids.map(() => '?').join(',');
            const query = `UPDATE performance_assessments SET isDeleted = 0 WHERE id IN (${placeholders})`;

            try {
                await env.DB.prepare(query).bind(...ids).run();
            } catch (err: any) {
                 if (err.message && err.message.includes("no such column") && err.message.includes("isDeleted")) {
                       await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0").run();
                       await env.DB.prepare(query).bind(...ids).run();
                 } else {
                     throw err;
                 }
            }

            try { const { applyAutoPredictions } = await import('../../server/autoPredict'); const { results } = await env.DB.prepare("SELECT * FROM performance_assessments WHERE isDeleted = 0").all(); await applyAutoPredictions(results, env.DB); } catch(e) { console.error("[Admin API/PATCH] Predict error:", e); }
            return new Response(JSON.stringify({ success: true, count: ids.length }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'DELETE') {
            const url = new URL(request.url);
            const isHard = url.searchParams.get('hard') === 'true';

            // Bulk Delete Request
            const body = await request.json();
            const { ids } = body; // Array of IDs

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return new Response("Invalid IDs", { status: 400 });
            }

            const placeholders = ids.map(() => '?').join(',');

            if (isHard) {
                // Construct SQL for bulk delete: DELETE FROM table WHERE id IN (?, ?, ?)
                const query = `DELETE FROM performance_assessments WHERE id IN (${placeholders})`;
                await env.DB.prepare(query).bind(...ids).run();
            } else {
                // Soft Delete: UPDATE table SET isDeleted = 1 WHERE id IN (?, ?, ?)
                const query = `UPDATE performance_assessments SET isDeleted = 1 WHERE id IN (${placeholders})`;
                try {
                    await env.DB.prepare(query).bind(...ids).run();
                } catch (err: any) {
                    if (err.message && err.message.includes("no such column") && err.message.includes("isDeleted")) {
                        console.log("[Admin API] 'isDeleted' column missing in Soft DELETE. Attempting to add it.");
                        await env.DB.prepare("ALTER TABLE performance_assessments ADD COLUMN isDeleted INTEGER DEFAULT 0").run();
                        await env.DB.prepare(query).bind(...ids).run();
                    } else {
                        throw err;
                    }
                }
            }

            try { const { applyAutoPredictions } = await import('../../server/autoPredict'); const { results } = await env.DB.prepare("SELECT * FROM performance_assessments WHERE isDeleted = 0").all(); await applyAutoPredictions(results, env.DB); } catch(e) { console.error("[Admin API/DELETE] Predict error:", e); }
            return new Response(JSON.stringify({ success: true, count: ids.length, type: isHard ? 'hard' : 'soft' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('Method not allowed', { status: 405 });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
