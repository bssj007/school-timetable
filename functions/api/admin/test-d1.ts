interface Env {
    DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const env = context.env;
        const body = await context.request.json() as any;
        const targetGrade = body.targetGrade || 2;
        const toDataset = body.toDataset || "1학기_시간표";

        let step = "init";
        
        try {
            step = "fetching profiles to delete";
            const { results } = await env.DB.prepare(
                "SELECT id FROM student_profiles WHERE grade = ? AND dataset = ?"
            ).bind(targetGrade, toDataset).all();

            const ids = results ? results.map((r: any) => r.id) : [];

            step = `nullifying ${ids.length} FKs`;
            if (ids.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < ids.length; i += chunkSize) {
                    const chunk = ids.slice(i, i + chunkSize);
                    const placeholders = chunk.map(() => '?').join(',');
                    await env.DB.prepare(`UPDATE ip_profiles SET student_profile_id = NULL WHERE student_profile_id IN (${placeholders})`).bind(...chunk).run();
                    await env.DB.prepare(`UPDATE cookie_profiles SET student_profile_id = NULL WHERE student_profile_id IN (${placeholders})`).bind(...chunk).run();
                }
            }

            step = "deleting student_profiles";
            await env.DB.prepare(
                "DELETE FROM student_profiles WHERE grade = ? AND dataset = ?"
            ).bind(targetGrade, toDataset).run();

            return new Response(JSON.stringify({ success: true, message: `Successfully deleted ${ids.length} profiles` }));

        } catch (e: any) {
            return new Response(JSON.stringify({ error: true, step, message: e.message }), { status: 500 });
        }
    } catch (e: any) {
        return new Response(e.message, { status: 500 });
    }
}
