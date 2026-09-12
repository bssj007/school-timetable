import { verifyAdminPassword } from "../../server/adminPW";

export const onRequestPost = async (context: any) => {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { password } = body;

        if (verifyAdminPassword(password, env)) {
            const headers = new Headers({ 'Content-Type': 'application/json' });
            headers.append('Set-Cookie', `admin_password=${encodeURIComponent(password)}; Path=/; Max-Age=86400; SameSite=Lax`);
            return new Response(JSON.stringify({ success: true }), {
                headers
            });
        }
        else {
            const headers = new Headers({ 'Content-Type': 'application/json' });
            headers.append('Set-Cookie', `admin_password=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax`);
            return new Response(JSON.stringify({ success: false, message: "그라믄 안돼" }), {
                status: 401,
                headers
            });
        }
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
