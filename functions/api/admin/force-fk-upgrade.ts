import { adminPassword } from "../../../server/adminPW";
import { ensureAllTables } from "../../db_schema";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    const auth = request.headers.get("X-Admin-Password");
    if (auth !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: true, message: "Database not configured" }), { status: 500 });
    }

    try {
        await ensureAllTables(env.DB);
        return new Response(JSON.stringify({ success: true, message: "Schema upgraded successfully." }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: true, message: e.message }), { status: 500 });
    }
};
