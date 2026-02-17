
import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // 1. Auth Check (Critical)
    const password = request.headers.get("X-Admin-Password");
    if (password !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), { status: 500 });
    }

    if (request.method === 'DELETE') {
        const url = new URL(request.url);
        const tableName = url.searchParams.get('table');
        const id = url.searchParams.get('id');

        if (!tableName) {
            return new Response(JSON.stringify({ error: "Table name is required" }), { status: 400 });
        }

        // White-list tables to prevent SQL injection or deletion of system tables
        const ALLOWED_TABLES = ['access_logs', 'student_profiles', 'ip_profiles', 'blocked_users', 'assessments', 'subjects', 'timetables'];
        if (tableName !== 'ALL' && !ALLOWED_TABLES.includes(tableName)) {
            return new Response(JSON.stringify({ error: "Invalid table name" }), { status: 400 });
        }

        try {
            if (tableName === 'ALL') {
                // Truncate ALL Allowed Tables
                const tablesToTruncate = ALLOWED_TABLES.filter(t => t !== 'ALL');

                // Construct Batch
                const batchStatements = [
                    env.DB.prepare("PRAGMA foreign_keys = OFF")
                ];

                for (const t of tablesToTruncate) {
                    batchStatements.push(env.DB.prepare(`DELETE FROM ${t}`));
                    // Reset Sequence
                    if (t !== 'ip_profiles' && t !== 'student_profiles') {
                        batchStatements.push(env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = '${t}'`));
                    }
                }

                batchStatements.push(env.DB.prepare("PRAGMA foreign_keys = ON"));

                await env.DB.batch(batchStatements);

                return new Response(JSON.stringify({ success: true, message: `Truncated all tables` }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (id) {
                // Delete Specific Row
                // Note: ip_profiles uses 'ip' as PK, others use 'id'.
                let pkColumn = 'id';
                if (tableName === 'ip_profiles') pkColumn = 'ip';

                await env.DB.prepare(`DELETE FROM ${tableName} WHERE ${pkColumn} = ?`).bind(id).run();
                return new Response(JSON.stringify({ success: true, message: `Deleted row ${id} from ${tableName}` }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                // Truncate Table
                // We use batch to temporarily disable foreign keys for this operation
                await env.DB.batch([
                    env.DB.prepare("PRAGMA foreign_keys = OFF"),
                    env.DB.prepare(`DELETE FROM ${tableName}`),
                    env.DB.prepare("PRAGMA foreign_keys = ON")
                ]);

                // Reset Auto-Increment if applicable
                if (tableName !== 'ip_profiles' && tableName !== 'student_profiles') {
                    try {
                        await env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).bind(tableName).run();
                    } catch (e) {
                        // Ignore if sqlite_sequence doesn't exist or other error
                    }
                }

                return new Response(JSON.stringify({ success: true, message: `Truncated ${tableName}` }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        } catch (err: any) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const body = await request.json();
        const action = body.action;

        // 2. Action Dispatch
        if (action === "list_tables") {
            // SQLite specific query to list tables (and views)
            // We select ALL tables including internal ones (which might be useful for debugging)
            const { results } = await env.DB.prepare(
                "SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') ORDER BY name;"
            ).all();
            const tables = results.map((r: any) => r.name);
            return new Response(JSON.stringify({ tables }), { headers: { "Content-Type": "application/json" } });
        }

        if (action === "query") {
            const sql = body.sql;
            if (!sql) return new Response(JSON.stringify({ error: "No SQL provided" }), { status: 400 });

            // Safety Check: strictly prevent DROP TABLE for safety? 
            // The user asked for "Easy Edit", so we must allow UPDATE/DELETE/INSERT.
            // We will trust the Admin Authentication.

            const result = await env.DB.prepare(sql).all();

            return new Response(JSON.stringify({
                results: result.results,
                meta: result.meta,
                success: true
            }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
    }
}
