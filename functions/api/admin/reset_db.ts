
import { adminPassword } from "../../../server/adminPW";

export const onRequestPost = async (context: any) => {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { confirmation } = body;
        const TARGET_PHRASE = "햇빛이 선명하게 나뭇잎을 핥고 있었다";

        if (confirmation !== TARGET_PHRASE) {
            return new Response(JSON.stringify({ error: "Invalid confirmation phrase" }), { status: 401 });
        }

        // 1. Auth Check (Added)
        const password = request.headers.get("X-Admin-Password");
        if (password !== adminPassword) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        if (!env.DB) {
            return new Response(JSON.stringify({ error: "Database not configured" }), { status: 500 });
        }

        // 2. Drop Tables (Robust Topological Sort)

        // 2.1 Get ALL tables
        const { results: allTables } = await env.DB.prepare(
            "SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
        ).all();

        if (allTables.length > 0) {
            // 2.2 Build Dependency Graph
            const tableNames = allTables.map((r: any) => r.name);
            const dependencies: Record<string, string[]> = {};
            tableNames.forEach(t => dependencies[t] = []);

            allTables.forEach((row: any) => {
                const table = row.name;
                const sql = row.sql || "";
                const regex = /REFERENCES\s+["']?(\w+)["']?/gi;
                let match;
                while ((match = regex.exec(sql)) !== null) {
                    const parent = match[1];
                    if (tableNames.includes(parent) && parent !== table) {
                        dependencies[table].push(parent);
                    }
                }
            });

            // 2.3 Topological Sort
            const refCounts: Record<string, number> = {};
            const refersToMe: Record<string, string[]> = {};
            tableNames.forEach(t => { refCounts[t] = 0; refersToMe[t] = []; });
            Object.entries(dependencies).forEach(([child, parents]) => {
                parents.forEach(parent => {
                    refCounts[parent] = (refCounts[parent] || 0) + 1;
                    refersToMe[parent].push(child);
                });
            });

            const dropQueue = tableNames.filter(t => refCounts[t] === 0);
            const sortedDropOrder: string[] = [];
            while (dropQueue.length > 0) {
                const table = dropQueue.shift()!;
                sortedDropOrder.push(table);
                const parents = dependencies[table] || [];
                parents.forEach(parent => {
                    refCounts[parent]--;
                    if (refCounts[parent] === 0) dropQueue.push(parent);
                });
            }
            const remaining = tableNames.filter(t => !sortedDropOrder.includes(t));
            if (remaining.length > 0) sortedDropOrder.push(...remaining); // Cycle fallback

            // 2.4 Execute Batch Drop
            const batchStatements = [];
            batchStatements.push(env.DB.prepare("PRAGMA defer_foreign_keys = ON"));
            for (const t of sortedDropOrder) {
                batchStatements.push(env.DB.prepare(`DROP TABLE IF EXISTS "${t}"`));
                // Try clearing sequence too
                try {
                    // Check sequence table existence is hard inside batch logic without overhead, 
                    // but we can blindly try executing it in a separate statement or just ignore.
                    // The database.ts had a check. Let's just create the statement, if it fails it fails.
                    // Wait, batch fails if one statement fails.
                    // Safe component:
                    // We can't check 'sqlite_sequence' inside the batch construction easily without query.
                    // We will skip sequence clearing here for simplicity/safety OR check before loop.
                } catch (e) { }
            }

            // Check sequence table once
            try {
                const seqExists = await env.DB.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='sqlite_sequence'").first();
                if (seqExists) {
                    for (const t of sortedDropOrder) {
                        batchStatements.push(env.DB.prepare(`DELETE FROM sqlite_sequence WHERE name = '${t}'`));
                    }
                }
            } catch (e) { }

            await env.DB.batch(batchStatements);
        }

        return new Response(JSON.stringify({
            success: true,
            message: "Database reset complete.",
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
