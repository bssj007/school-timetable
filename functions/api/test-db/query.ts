import { resolveEnvBindingInfo } from "../../_testEnv";
import { verifyAdminPassword } from "../../../server/adminPW";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Admin-Password",
};

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            ...corsHeaders,
        },
    });
}

function isDbNameTampering(sqlStr: string): boolean {
    const s = (sqlStr || "").toLowerCase();
    return s.includes("system_settings") && s.includes("db_name") && (s.includes("update") || s.includes("delete") || s.includes("insert") || s.includes("drop") || s.includes("replace"));
}

export const onRequestOptions = async () => {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
};

export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
        return onRequestOptions();
    }

    if (!env.DB) {
        return jsonResponse({ error: "Database configuration missing" }, 500);
    }

    const url = new URL(request.url);

    // 1. Strict Multi-layered Environment Guard: Test Server + Test DB only
    const envInfo = await resolveEnvBindingInfo(env, url);

    // Defense-in-depth Check A: Standard resolveEnvBindingInfo flags
    const isTestValid = envInfo.isTestServer && envInfo.isTestDb && !envInfo.isMismatch;

    // Defense-in-depth Check B: Explicit Main DB name & Server name blacklist (Zero-Tolerance)
    // Check both resolved names AND direct env variables
    const dbNameLower = (envInfo.dbName || "").toLowerCase();
    const serverNameLower = (envInfo.serverName || "").toLowerCase();
    const envDbNameLower = String(env?.DB_NAME || "").toLowerCase();
    const envServerNameLower = String(env?.SERVER_NAME || "").toLowerCase();

    const isMainDbDetected = 
        dbNameLower === 'school-timetable-db' || 
        !dbNameLower.includes('test') ||
        envDbNameLower === 'school-timetable-db' ||
        (envDbNameLower.length > 0 && !envDbNameLower.includes('test'));

    const isMainServerDetected = 
        serverNameLower === 'school-timetable' && !serverNameLower.includes('test') ||
        envServerNameLower === 'school-timetable' && !envServerNameLower.includes('test');

    if (!isTestValid || isMainDbDetected || isMainServerDetected) {
        return jsonResponse({
            error: "Forbidden: Test DB Agent Query API is strictly restricted to verified Test Server + Test DB environments. Production/Live DB access is permanently prohibited.",
            env_info: envInfo,
        }, 403);
    }

    // 2. Check Switch Status in system_settings
    let isBypassActive = false;
    try {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT)").run();
        const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'test_db_agent_query_enabled'").first();
        if (row && (row.value === 'true' || row.value === '1')) {
            isBypassActive = true;
        }
    } catch (e: any) {
        console.warn("[TestDB Query] Failed to read test_db_agent_query_enabled setting:", e.message);
    }

    // If bypass is not active, check if valid Admin Password is provided
    if (!isBypassActive) {
        const adminPw = request.headers.get("X-Admin-Password") || url.searchParams.get("admin_password");
        if (!verifyAdminPassword(adminPw, env)) {
            return jsonResponse({
                error: "Unauthorized: Agent Query Access is currently disabled. Please enable it with the switch in Admin > Data Import/Export (데이터 출입).",
                status: "disabled",
            }, 401);
        }
    }

    // 3. Handle GET Requests
    if (request.method === "GET") {
        const sqlParam = url.searchParams.get("sql") || url.searchParams.get("q");

        // If no SQL parameter is provided, return status info and API guide
        if (!sqlParam) {
            return jsonResponse({
                success: true,
                status: "active",
                bypassed: isBypassActive,
                server: envInfo.serverName,
                database: envInfo.dbName,
                message: "Test DB Agent Query API is active and ready for queries.",
                usage: {
                    GET: `${url.origin}/api/test-db/query?sql=SELECT+name+FROM+sqlite_schema+WHERE+type='table'`,
                    POST: {
                        endpoint: `${url.origin}/api/test-db/query`,
                        headers: { "Content-Type": "application/json" },
                        examples: [
                            { description: "Single query", body: { sql: "SELECT * FROM system_settings LIMIT 10" } },
                            { description: "Parameterized query", body: { sql: "SELECT * FROM system_settings WHERE key = ?", params: ["site_title"] } },
                            { description: "List all tables", body: { action: "list_tables" } },
                            { description: "Multi-statement script", body: { exec: "CREATE TABLE IF NOT EXISTS test (id INT); INSERT INTO test VALUES (1);" } }
                        ]
                    }
                }
            });
        }

        if (isDbNameTampering(sqlParam)) {
            return jsonResponse({ error: "Forbidden: Modifying db_name system identifier is strictly prohibited to preserve environment isolation." }, 403);
        }

        try {
            const queryResult = await env.DB.prepare(sqlParam).all();
            return jsonResponse({
                success: true,
                results: queryResult.results,
                meta: queryResult.meta,
            });
        } catch (err: any) {
            return jsonResponse({
                success: false,
                error: err.message || "Query execution failed",
                sql: sqlParam,
            }, 400);
        }
    }

    // 4. Handle POST Requests
    if (request.method === "POST") {
        let body: any = {};
        try {
            body = await request.json();
        } catch (_) {
            return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        // Action: list_tables
        if (body.action === "list_tables") {
            try {
                const tablesResult = await env.DB.prepare(
                    "SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name;"
                ).all();
                const tables = tablesResult.results.map((r: any) => r.name);
                return jsonResponse({
                    success: true,
                    tables,
                    count: tables.length,
                });
            } catch (err: any) {
                return jsonResponse({ success: false, error: err.message }, 500);
            }
        }

        // Action: multi-statement exec script
        if (body.exec && typeof body.exec === "string") {
            if (isDbNameTampering(body.exec)) {
                return jsonResponse({ error: "Forbidden: Modifying db_name system identifier is strictly prohibited to preserve environment isolation." }, 403);
            }
            try {
                await env.DB.exec(body.exec);
                return jsonResponse({
                    success: true,
                    message: "Executed successfully.",
                });
            } catch (err: any) {
                return jsonResponse({ success: false, error: err.message }, 400);
            }
        }

        // Action: batch queries
        if (Array.isArray(body.batch)) {
            const hasTampering = body.batch.some((item: any) => isDbNameTampering(typeof item === 'string' ? item : item?.sql || ''));
            if (hasTampering) {
                return jsonResponse({ error: "Forbidden: Modifying db_name system identifier is strictly prohibited to preserve environment isolation." }, 403);
            }
            try {
                const statements = body.batch.map((item: any) => {
                    if (typeof item === "string") {
                        return env.DB.prepare(item);
                    }
                    if (item && item.sql) {
                        const stmt = env.DB.prepare(item.sql);
                        return Array.isArray(item.params) ? stmt.bind(...item.params) : stmt;
                    }
                    throw new Error("Invalid batch item format");
                });
                const batchResults = await env.DB.batch(statements);
                return jsonResponse({
                    success: true,
                    results: batchResults.map((r: any) => ({
                        results: r.results,
                        meta: r.meta,
                    })),
                });
            } catch (err: any) {
                return jsonResponse({ success: false, error: err.message }, 400);
            }
        }

        // Standard SQL query
        const sql = body.sql || body.query;
        if (!sql || typeof sql !== "string") {
            return jsonResponse({ error: "Missing 'sql' field in request body" }, 400);
        }

        if (isDbNameTampering(sql)) {
            return jsonResponse({ error: "Forbidden: Modifying db_name system identifier is strictly prohibited to preserve environment isolation." }, 403);
        }

        try {
            let stmt = env.DB.prepare(sql);
            if (Array.isArray(body.params) && body.params.length > 0) {
                stmt = stmt.bind(...body.params);
            }
            const queryResult = await stmt.all();
            return jsonResponse({
                success: true,
                results: queryResult.results,
                meta: queryResult.meta,
            });
        } catch (err: any) {
            return jsonResponse({
                success: false,
                error: err.message || "Query execution failed",
                sql,
            }, 400);
        }
    }

    return jsonResponse({ error: "Method not allowed. Use GET or POST." }, 405);
};
