interface Env {
    DB: any;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const env = context.env;
        const row = await env.DB.prepare("SELECT response_json FROM timetable_cache WHERE cache_key = 'raw_data'").first();
        
        return new Response(row.response_json, { 
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            } 
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
