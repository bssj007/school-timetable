export const onRequest = async (context: any) => {
    const { env } = context;
    if (!env.DB) return new Response("No DB", { status: 500 });

    try {
        const tables = ["access_logs", "ip_profiles", "student_profiles", "users", "blocked_users"];
        const stats: any = {};

        for (const table of tables) {
            try {
                const count = await env.DB.prepare(`SELECT COUNT(*) as c FROM ${table}`).first('c');
                const sample = await env.DB.prepare(`SELECT * FROM ${table} LIMIT 5`).all();
                const schema = await env.DB.prepare(`PRAGMA table_info(${table})`).all();

                stats[table] = {
                    count,
                    columns: schema.results.map((c: any) => c.name),
                    sample: sample.results
                };
            } catch (e: any) {
                stats[table] = { error: e.message };
            }
        }

        return new Response(JSON.stringify(stats, null, 2), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        return new Response(e.message, { status: 500 });
    }
}
