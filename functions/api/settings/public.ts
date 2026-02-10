
export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database configuration missing' }), { status: 500 });
    }

    try {
        const { value: hidePastValue } = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'hide_past_assessments'").first() || {};

        return new Response(JSON.stringify({
            hide_past_assessments: hidePastValue === 'true'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
