interface Env {
    DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const env = context.env;
        const { results } = await env.DB.prepare("SELECT cache_key, dataset_id, updated_at, length(response_json) as size FROM timetable_cache LIMIT 20").all();
        
        return new Response(JSON.stringify({ 
            success: true, 
            message: "Successfully queried test database",
            data: results
        }, null, 2), { 
            headers: { 
                "Content-Type": "application/json" 
            } 
        });
    } catch (e: any) {
        return new Response(e.message, { status: 500 });
    }
}
