
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
                // 1. Get ALL current tables with their Schema to find Foreign Keys
                // Filter out sqlite_*, _cf_*, d1_*, and any other internal system tables (like _cf_KV which causes SQLITE_AUTH)
                const { results: allTables } = await env.DB.prepare(
                    "SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
                ).all();

                if (allTables.length === 0) {
                    return new Response(JSON.stringify({
                        success: true,
                        message: `Database is already empty.`,
                        details: []
                    }), { headers: { 'Content-Type': 'application/json' } });
                }

                // 2. Build Dependency Graph
                // Graph: Parent -> [Children] (To find who depends on whom? No, for DROP we want Child First)
                // Let's model: Table -> [DependsOn]
                // If A references B, A depends on B. A must be dropped BEFORE B.
                // So Order: A, then B.

                const tableNames = allTables.map((r: any) => r.name);
                const dependencies: Record<string, string[]> = {};

                // Initialize
                tableNames.forEach(t => dependencies[t] = []);

                allTables.forEach((row: any) => {
                    const table = row.name;
                    const sql = row.sql || "";

                    // Regex to find REFERENCES target(id)
                    // Matches: REFERENCES parent_table ( or REFERENCES "parent_table" (
                    // Simple regex: /REFERENCES\s+["']?(\w+)["']?/gi
                    const regex = /REFERENCES\s+["']?(\w+)["']?/gi;
                    let match;
                    while ((match = regex.exec(sql)) !== null) {
                        const parent = match[1];
                        if (tableNames.includes(parent) && parent !== table) {
                            // Table depends on Parent
                            dependencies[table].push(parent);
                        }
                    }
                });

                // 3. Topological Sort (Kahn's Algorithm? Or specific "Leaf First" extraction)
                // We want to drop "Leafs" (tables that others depend on? No, tables that HAVE dependencies first?)
                // NO.
                // A has FK to B. A is Child. B is Parent.
                // Cannot Drop B if A exists.
                // MUST Drop A first.
                // So: Drop tables that depend on others?
                // Wait.
                // If A depends on B. Drop A. Then Drop B.
                // This means A should be strictly "Lower" in the topological order.

                // Let's invert:
                // Parent -> Children list.
                // Indegree = Number of tables REFFERING to me?
                // If Indegree is 0 (No one refers to me), I can be dropped.
                // Wait, if A refers to B. A prevents B from dropping.
                // So B has "Indegree 1" (from A). B cannot be dropped.
                // A refers to B. Does A prevent anyone? No. A can be dropped.
                // So "Indegree" = "Count of tables referencing ME".

                const refCounts: Record<string, number> = {};
                const refersToMe: Record<string, string[]> = {}; // Key: Parent, Value: [Children]

                tableNames.forEach(t => {
                    refCounts[t] = 0;
                    refersToMe[t] = [];
                });

                // Populate Graph
                // dependencies[A] = [B] (A refers to B)
                Object.entries(dependencies).forEach(([child, parents]) => {
                    parents.forEach(parent => {
                        refCounts[parent] = (refCounts[parent] || 0) + 1;
                        refersToMe[parent].push(child);
                    });
                });

                // Queue of Droppable Tables (Refcount 0)
                const dropQueue: string[] = [];
                tableNames.forEach(t => {
                    if (refCounts[t] === 0) {
                        dropQueue.push(t);
                    }
                });

                const sortedDropOrder: string[] = [];

                // Process Queue
                while (dropQueue.length > 0) {
                    const table = dropQueue.shift()!;
                    sortedDropOrder.push(table);

                    // Since 'table' is dropped, it no longer blocks its parents?
                    // NO.
                    // 'table' (Child) is dropped.
                    // Who did 'table' refer to? `dependencies[table]`.
                    // For each Parent P in dependencies[table]:
                    //    P's RefCount decrements (one less child blocking it).
                    //    If P's RefCount becomes 0, P is droppable.

                    const parents = dependencies[table] || [];
                    parents.forEach(parent => {
                        refCounts[parent]--;
                        if (refCounts[parent] === 0) {
                            dropQueue.push(parent);
                        }
                    });
                }

                // Check for cycles (Simpler: Just add any remaining tables that were not sorted)
                // If cycle exists, they won't be in sortedDropOrder.
                const remaining = tableNames.filter(t => !sortedDropOrder.includes(t));
                if (remaining.length > 0) {
                    // Cycle detected or logic error. Just append remaining (Brute force will handle or they will fail)
                    console.warn("Cycle checking failed for:", remaining);
                    sortedDropOrder.push(...remaining);
                }

                // 4. Execute Batch Drop
                // Same strategy: Defer FKs + Batch Drop
                const batchStatements = [];
                const executedSteps: string[] = [];

                batchStatements.push(env.DB.prepare("PRAGMA defer_foreign_keys = ON"));

                for (const t of sortedDropOrder) {
                    batchStatements.push(env.DB.prepare(`DROP TABLE IF EXISTS "${t}"`));
                    executedSteps.push(`Dropped ${t}`);

                    if (sequenceTableExists) {
                        try {
                            batchStatements.push(env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = '${t}'`));
                        } catch (ignore) { }
                    }
                }

                try {
                    await env.DB.batch(batchStatements);
                } catch (batchError: any) {
                    console.error("Batch Drop Failed:", batchError);
                    return new Response(JSON.stringify({
                        error: `Batch Reset Failed: ${batchError.message}`,
                        details: executedSteps
                    }), { status: 500 });
                }

                return new Response(JSON.stringify({
                    success: true,
                    message: `Dropped ${sortedDropOrder.length} tables (Topo-Sort Mode).`,
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
                if (tableName === 'student_profiles') pkColumn = 'id';

                if (tableName === 'student_profiles') {
                    // Prevent Foreign Key constraint errors by clearing references first
                    try {
                        await env.DB.prepare(`UPDATE ip_profiles SET student_profile_id = NULL WHERE student_profile_id = ?`).bind(id).run();
                    } catch (e) { /* ignore if ip_profiles doesn't exist */ }
                    try {
                        await env.DB.prepare(`UPDATE cookie_profiles SET student_profile_id = NULL WHERE student_profile_id = ?`).bind(id).run();
                    } catch (e) { /* ignore */ }
                }

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
