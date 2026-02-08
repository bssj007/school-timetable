// Cloudflare Function to return user's IP address
export const onRequest: PagesFunction<Env> = async (context) => {
    const ip = context.request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    return new Response(JSON.stringify({ ip }), {
        headers: { 'Content-Type': 'application/json' }
    });
};
