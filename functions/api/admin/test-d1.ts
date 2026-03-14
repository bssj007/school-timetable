// functions/api/admin/test-d1.ts
export const onRequest = async (context: any) => {
    const { env } = context;
    try {
        const pageCountResult: any = await env.DB.prepare("PRAGMA page_count").first();
        const pageSizeResult: any  = await env.DB.prepare("PRAGMA page_size").first();
        const dbstatResult: any = await env.DB.prepare("SELECT * FROM dbstat LIMIT 1").first().catch(() => ({error: "dbstat not found"}));
        
        return new Response(JSON.stringify({ 
            pageCountResult, 
            pageSizeResult,
            dbstatResult
        }), { headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
