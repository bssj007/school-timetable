
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

                let remainingTables = allTables.map((r: any) => r.name);
                const executedSteps: string[] = [];

                // Brute-force Retry Loop to handle Dependency Graph automatically
                // Children will drop successfully first. Parents will fail initially, then succeed in next pass.
                let pass = 1;
                const MAX_PASSES = 10; // Prevent infinite loop

                while (remainingTables.length > 0 && pass <= MAX_PASSES) {
                    const nextRemaining: string[] = [];
                    let droppedInThisPass = 0;

                    for (const t of remainingTables) {
                        try {
                            // Attempt Drop
                            // Using batch to ensure PRAGMA foreign_keys = OFF is applied tightly (best effort)
                            await env.DB.batch([
                                env.DB.prepare("PRAGMA foreign_keys = OFF"),
                                env.DB.prepare(`DROP TABLE IF EXISTS "${t}"`)
                            ]);

                            executedSteps.push(`Pass ${pass}: Dropped ${t}`);
                            droppedInThisPass++;

                            // Clean sequence if successful
                            if (sequenceTableExists) {
                                try {
                                    await env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = '${t}'`).run();
                                } catch (ignore) { }
                            }

                        } catch (e: any) {
                            // If it's a constraint error, we'll try again next pass
                            // If it's another error, we might be stuck, but we'll retry anyway
                            console.warn(`Pass ${pass}: Check/Drop failed for ${t}`, e);
                            nextRemaining.push(t);
                        }
                    }

                    if (droppedInThisPass === 0 && nextRemaining.length > 0) {
                        // Deadlock or Persistent Error
                        executedSteps.push(`CRITICAL: Stuck on tables: ${nextRemaining.join(', ')}`);
                        // Force break to allow reporting
                        break;
                    }

                    remainingTables = nextRemaining;
                    pass++;
                }

                if (remainingTables.length > 0) {
                    return new Response(JSON.stringify({
                        success: false,
                        message: `Reset incomplete. Could not drop: ${remainingTables.join(', ')}`,
                        details: executedSteps
                    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
                }

                // Try to turn FK back ON
                try {
                    await env.DB.prepare("PRAGMA foreign_keys = ON").run();
                } catch (e) { }

                return new Response(JSON.stringify({
                    success: true,
                    message: `Dropped all tables (Required ${pass - 1} passes).`,
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
