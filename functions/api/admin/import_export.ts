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

    try {
        if (request.method === "GET") {
            // EXPORT: Dump all tables to JSON
            const { results: allTables } = await env.DB.prepare(
                "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
            ).all();

            const tableNames = allTables.map((r: any) => r.name);
            const exportData: Record<string, any[]> = {};

            // Fetch all rows for each table
            for (const table of tableNames) {
                const { results } = await env.DB.prepare(`SELECT * FROM "${table}"`).all();
                exportData[table] = results;
            }

            return new Response(JSON.stringify({ success: true, data: exportData }), {
                headers: {
                    "Content-Type": "application/json",
                    "Content-Disposition": `attachment; filename="backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json"`,
                },
            });
        }

        if (request.method === "POST") {
            // IMPORT: Restore JSON data into tables
            const body = await request.json();
            const importData = body.data;

            if (!importData || typeof importData !== "object") {
                return new Response(JSON.stringify({ error: "Invalid import format" }), { status: 400 });
            }

            const tables = Object.keys(importData);
            if (tables.length === 0) {
                return new Response(JSON.stringify({ error: "No tables found in data" }), { status: 400 });
            }

            // Temporarily turn off foreign keys to allow mass deletion and insertion without ordering conflicts
            const batchStatements = [];
            batchStatements.push(env.DB.prepare("PRAGMA defer_foreign_keys = ON"));

            // Get valid tables to ensure we don't try to insert into non-existent or system tables
            const { results: validTablesRes } = await env.DB.prepare(
                "SELECT name FROM sqlite_schema WHERE type='table'"
            ).all();
            const validTables = validTablesRes.map((r: any) => r.name);

            // 1. Truncate tables that we are importing
            for (const table of tables) {
                if (validTables.includes(table)) {
                    batchStatements.push(env.DB.prepare(`DELETE FROM "${table}"`));
                    // Note: We might also want to reset sqlite_sequence if necessary, but mass replacing handles IDs directly.
                }
            }

            // 2. Prepare Insert Statements
            for (const table of tables) {
                if (!validTables.includes(table)) continue;

                const rows = importData[table];
                if (!Array.isArray(rows) || rows.length === 0) continue;

                const columns = Object.keys(rows[0]);
                const placeholders = columns.map(() => '?').join(', ');
                const insertSql = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

                for (const row of rows) {
                    const values = columns.map(c => row[c]);
                    batchStatements.push(env.DB.prepare(insertSql).bind(...values));
                }
            }

            // Execute batch restore
            try {
                await env.DB.batch(batchStatements);
                return new Response(JSON.stringify({ success: true, message: `Successfully restored data for ${tables.length} tables.` }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (batchError: any) {
                console.error("Batch Restore Failed:", batchError);
                return new Response(JSON.stringify({
                    error: `Restore Failed: ${batchError.message}. The database may be in an inconsistent state. Please reset and try again if necessary.`
                }), { status: 500 });
            }
        }

        return new Response("Method not allowed", { status: 405 });

    } catch (e: any) {
        console.error("Import/Export Error:", e);
        return new Response(JSON.stringify({ error: e.message || "Unknown error occurred" }), { status: 500 });
    }
}
