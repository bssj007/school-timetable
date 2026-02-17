
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

                // STRICT SORTING: Children -> Parents
                // 1. Tables known to have Foreign Keys (MUST drop first)
                const TIER_1_CHILDREN = ['ip_profiles', 'cookie_profiles'];
                // 2. Tables that are Parents (MUST drop last)
                const TIER_3_PARENTS = ['student_profiles'];
                // 3. Everything else (TIER 2)

                tablesToDrop.sort((a: string, b: string) => {
                    const aTier = TIER_1_CHILDREN.includes(a) ? 1 : (TIER_3_PARENTS.includes(a) ? 3 : 2);
                    const bTier = TIER_1_CHILDREN.includes(b) ? 1 : (TIER_3_PARENTS.includes(b) ? 3 : 2);
                    return aTier - bTier;
                });

                // Execute PRAGMA separately to ensure it applies (best effort)
                try {
                    await env.DB.prepare("PRAGMA foreign_keys = OFF").run();
                } catch (e) {
                    console.warn("PRAGMA foreign_keys = OFF failed (might be ignored)", e);
                }

                // Construct Batch
                // Re-add PRAGMA inside batch just in case it's session-scoped per batch
                const batchStatements = [
                    env.DB.prepare("PRAGMA foreign_keys = OFF")
                ];

                // 1. Drop Tables in Order
                for (const t of tablesToDrop) {
                    batchStatements.push(env.DB.prepare(`DROP TABLE IF EXISTS "${t}"`));
                    // Also clear sequence
                    if (sequenceTableExists) {
                        batchStatements.push(env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = '${t}'`));
                    }
                }

                // 2. Re-hydrate Schemas -> REMOVED

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
