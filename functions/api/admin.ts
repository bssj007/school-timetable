import { adminPassword } from "../../server/adminPW";

export const onRequestPost = async (context: any) => {
    try {
        const { request } = context;
        const body = await request.json();
        const { password } = body;

        if (password === adminPassword) {
            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        else {
            return new Response(JSON.stringify({ success: false, message: "그라믄 안돼" }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
