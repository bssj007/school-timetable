
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

        try {
            // Check if sqlite_sequence exists (to safely reset auto-increments)
            const sequenceTableExists = await env.DB.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='sqlite_sequence'").first();

            if (tableName === 'ALL') {
                // 1. Get ALL current tables
                // Filter out sqlite_*, _cf_*, d1_*, and any other internal system tables
                const { results: allTables } = await env.DB.prepare(
                    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
                ).all();

                let tablesToDrop = allTables.map((r: any) => r.name);

                // STRICT SORTING: Children -> Parents
                // 1. Tables known to have Foreign Keys (MUST drop first)
                const TIER_1_CHILDREN = ['ip_profiles', 'cookie_profiles', 'performance_assessments', 'access_logs'];
                // 2. Tables that are Parents (MUST drop last)
                const TIER_3_PARENTS = ['student_profiles', 'subjects'];
                // 3. Everything else (TIER 2)

                tablesToDrop.sort((a: string, b: string) => {
                    const aTier = TIER_1_CHILDREN.includes(a) ? 1 : (TIER_3_PARENTS.includes(a) ? 3 : 2);
                    const bTier = TIER_1_CHILDREN.includes(b) ? 1 : (TIER_3_PARENTS.includes(b) ? 3 : 2);
                    return aTier - bTier;
                });

                // SEQUENTIAL EXECUTION (No Batch) for strict ordering assurance
                const executedSteps = [];

                // Force FK OFF
                try {
                    await env.DB.prepare("PRAGMA foreign_keys = OFF").run();
                } catch (e) {
                    console.warn("Pragma OFF failed", e);
                }

                for (const t of tablesToDrop) {
                    try {
                        // Re-run Pragma before each drop just in case
                        await env.DB.prepare("PRAGMA foreign_keys = OFF").run();

                        await env.DB.prepare(`DROP TABLE IF EXISTS "${t}"`).run();
                        executedSteps.push(`Dropped ${t}`);

                        // Clean sequence
                        if (sequenceTableExists) {
                            try {
                                await env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = '${t}'`).run();
                            } catch (ignore) { }
                        }
                    } catch (dropError: any) {
                        console.error(`Failed to drop ${t}:`, dropError);
                        executedSteps.push(`FAILED ${t}: ${dropError.message}`);
                    }
                }

                // Try to turn FK back ON
                try {
                    await env.DB.prepare("PRAGMA foreign_keys = ON").run();
                } catch (e) { }

                return new Response(JSON.stringify({
                    success: true,
                    message: `Dropped all tables (Sequential Mode). System will auto-recreate them.`,
                    details: executedSteps
                }), {
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
