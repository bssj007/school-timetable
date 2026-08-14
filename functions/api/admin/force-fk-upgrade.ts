import { ensureAllTables } from "../../../db_schema";

export const onRequestPost: PagesFunction<any> = async (context) => {
    try {
        const env = context.env;
        if (!env.DB) {
            return new Response(JSON.stringify({ error: true, message: "Database not configured" }), { status: 500 });
        }
        await ensureAllTables(env.DB);
        return new Response(JSON.stringify({ success: true, message: "Schema upgraded successfully." }));
    } catch (e: any) {
        return new Response(JSON.stringify({ error: true, message: e.message }), { status: 500 });
    }
};
