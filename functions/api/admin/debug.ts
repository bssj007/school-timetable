export const onRequest = async (context: any) => {
    const { env } = context;
    const result = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'manual_semester_plan'").first();
    return new Response(result ? result.value : "not found", { headers: { "Content-Type": "application/json" } });
};
