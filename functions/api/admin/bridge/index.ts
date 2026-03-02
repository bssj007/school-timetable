import { adminPassword } from "../../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const method = request.method;

    // Auth Check
    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    // Ensure table exists
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS dataset_bridges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                fromDataset TEXT NOT NULL,
                toDataset TEXT NOT NULL,
                mappingData TEXT NOT NULL,
                createdAt TEXT DEFAULT (datetime('now')),
                updatedAt TEXT DEFAULT (datetime('now'))
            )
        `).run();
    } catch (e) {
        console.error("Table creation/migration failed:", e);
    }

    const url = new URL(request.url);

    if (method === 'GET') {
        try {
            const { results } = await env.DB.prepare(
                "SELECT * FROM dataset_bridges ORDER BY id DESC"
            ).all();

            return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    if (method === 'POST') {
        try {
            const body = await request.json();
            const { action } = body;

            // Optional "execute" action separated into a different file or handled here
            // Currently keeping CRUD here, moving EXEUCTION to a separate endpoint for clarity, 
            // OR handling it here if action === 'execute'

            const { id, name, fromDataset, toDataset, mappingData } = body;

            if (!name || !fromDataset || !toDataset || !mappingData) {
                return new Response('Missing required fields', { status: 400 });
            }

            if (id) {
                // Update
                await env.DB.prepare(
                    "UPDATE dataset_bridges SET name = ?, fromDataset = ?, toDataset = ?, mappingData = ?, updatedAt = ? WHERE id = ?"
                ).bind(name, fromDataset, toDataset, JSON.stringify(mappingData), new Date().toISOString(), id).run();
            } else {
                // Create
                await env.DB.prepare(
                    "INSERT INTO dataset_bridges (name, fromDataset, toDataset, mappingData, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)"
                ).bind(name, fromDataset, toDataset, JSON.stringify(mappingData), new Date().toISOString(), new Date().toISOString()).run();
            }

            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    if (method === 'DELETE') {
        try {
            const id = url.searchParams.get('id');

            if (id) {
                await env.DB.prepare("DELETE FROM dataset_bridges WHERE id = ?").bind(id).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
            return new Response('ID is required', { status: 400 });
        } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
    }

    return new Response('Method not allowed', { status: 405 });
};
