
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
        const mode = url.searchParams.get('mode'); // 'truncate' (default) or 'drop'

        if (!tableName) {
            return new Response(JSON.stringify({ error: "Table name is required" }), { status: 400 });
        }

        // White-list restriction removed to allow deleting/truncating any table
        // const ALLOWED_TABLES = ...

        try {
            // Check if sqlite_sequence exists (to safely reset auto-increments)
            const sequenceTableExists = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'").first();

            if (tableName === 'ALL') {
                // 1. Get ALL current tables
                const { results: allTables } = await env.DB.prepare(
                    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                ).all();

                let tablesToDrop = allTables.map((r: any) => r.name);

                // Sort: Dependent Tables (Children) FIRST, Parent Tables LAST
                // This prevents FK errors if PRAGMA foreign_keys = OFF fails in D1 batch
                const FIRST_DROP = ['ip_profiles', 'cookie_profiles', 'performance_assessments', 'access_logs', 'blocked_users', 'timetables'];
                const LAST_DROP = ['student_profiles', 'subjects'];

                tablesToDrop.sort((a: string, b: string) => {
                    const aFirst = FIRST_DROP.includes(a);
                    const bFirst = FIRST_DROP.includes(b);
                    const aLast = LAST_DROP.includes(a);
                    const bLast = LAST_DROP.includes(b);

                    if (aFirst && !bFirst) return -1;
                    if (!aFirst && bFirst) return 1;
                    if (aLast && !bLast) return 1;
                    if (!aLast && bLast) return -1;
                    return 0;
                });

                // Construct Batch
                const batchStatements = [
                    env.DB.prepare("PRAGMA foreign_keys = OFF")
                ];

                // 1. Drop Tables
                for (const t of tablesToDrop) {
                    batchStatements.push(env.DB.prepare(`DROP TABLE IF EXISTS "${t}"`));
                    // Also clear sequence
                    if (sequenceTableExists) {
                        batchStatements.push(env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = '${t}'`));
                    }
                }

                // 2. Re-hydrate Schemas (Create Tables) -> REMOVED per user request
                // The system is designed to be "Zero-Config" / "Anti-Fragile".
                // Each API endpoint (middleware, assessment, etc.) is responsible for creating its own tables if missing.

                batchStatements.push(env.DB.prepare("PRAGMA foreign_keys = ON"));

                await env.DB.batch(batchStatements);

                return new Response(JSON.stringify({ success: true, message: `Dropped all tables. System will auto-recreate them as needed.` }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (id) {
                // Delete Specific Row
                // Note: ip_profiles uses 'ip' as PK, others use 'id'.
                let pkColumn = 'id';
                if (tableName === 'ip_profiles') pkColumn = 'ip';
                if (tableName === 'student_profiles') pkColumn = 'studentNumber';

                await env.DB.prepare(`DELETE FROM ${tableName} WHERE ${pkColumn} = ?`).bind(id).run();
                return new Response(JSON.stringify({ success: true, message: `Deleted row ${id} from ${tableName}` }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else if (mode === 'drop') {
                // DROP TABLE
                await env.DB.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
                return new Response(JSON.stringify({ success: true, message: `Dropped table ${tableName}` }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                // Truncate Table (Default)
                // We use batch to temporarily disable foreign keys for this operation
                await env.DB.batch([
                    env.DB.prepare("PRAGMA foreign_keys = OFF"),
                    env.DB.prepare(`DELETE FROM ${tableName}`),
                    env.DB.prepare("PRAGMA foreign_keys = ON")
                ]);

                // Reset Auto-Increment if applicable
                if (sequenceTableExists && tableName !== 'ip_profiles' && tableName !== 'student_profiles') {
                    try {
                        await env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).bind(tableName).run();
                    } catch (e) {
                        // Ignore
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
