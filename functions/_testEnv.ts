export interface EnvBindingInfo {
    isTestServer: boolean;
    serverName: string;
    isTestDb: boolean;
    dbName: string;
    isMismatch: boolean;
}

export async function resolveEnvBindingInfo(env: any, url: URL): Promise<EnvBindingInfo> {
    const hostname = url.hostname.toLowerCase();
    const isTestHostname = hostname.includes('testserver') || hostname.includes('preview') || hostname.includes('test') || hostname === 'localhost' || hostname === '127.0.0.1';

    // 1. Resolve Server Name & isTestServer
    let serverName = env?.SERVER_NAME ? String(env.SERVER_NAME).trim() : '';
    if (!serverName) {
        serverName = isTestHostname ? 'school-timetable-testserver' : 'school-timetable';
    }
    const isTestServer = Boolean(serverName.toLowerCase().includes('test') || isTestHostname);

    // 2. Resolve DB Name & isTestDb
    let dbName = '';
    // Check system_settings in the connected D1 database first
    if (env?.DB) {
        try {
            await env.DB.prepare("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT)").run();
            const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'db_name'").first();
            if (row && row.value) {
                dbName = String(row.value).trim();
            }
        } catch (_) {}
    }

    // Check env.DB_NAME from environment variables if not set in DB
    if (!dbName && env?.DB_NAME) {
        dbName = String(env.DB_NAME).trim();
        if (env?.DB && dbName) {
            try {
                await env.DB.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('db_name', ?)").bind(dbName).run();
            } catch (_) {}
        }
    }

    // Default fallback if uninitialized
    if (!dbName) {
        dbName = isTestServer ? 'school-timetable-testserver-db' : 'school-timetable-db';
    }

    const isTestDb = Boolean(dbName.toLowerCase().includes('test'));
    const isMismatch = isTestServer !== isTestDb;

    return {
        isTestServer,
        serverName,
        isTestDb,
        dbName,
        isMismatch,
    };
}
