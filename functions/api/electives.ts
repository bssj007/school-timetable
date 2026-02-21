import { ensureAllTables, dropAllTables } from "../db_schema";

interface Env {
    DB: D1Database;
}

// Cloudflare Pages Functions types
interface EventContext<Env, P extends string, Data> {
    request: Request;
    functionPath: string;
    waitUntil: (promise: Promise<any>) => void;
    passThroughOnException: () => void;
    next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
    env: Env;
    params: Params<P>;
    data: Data;
}
type Params<P extends string = string> = Record<P, string | string[]>;
type PagesFunction<Env = unknown, P extends string = string, Data extends Record<string, unknown> = Record<string, unknown>> = (context: EventContext<Env, P, Data>) => Response | Promise<Response>;


export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    try {
        // Proactively ensure all tables exist (optimistic check)
        await ensureAllTables(env.DB);

        // 1. Fetch Student Profile
        if (type === "student") {
            const grade = url.searchParams.get("grade");
            const classNum = url.searchParams.get("classNum");
            const studentNumber = url.searchParams.get("studentNumber");

            if (!grade || !classNum || !studentNumber) {
                return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
            }

            try {
                const profile = await env.DB.prepare(
                    "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(grade, classNum, studentNumber).first();
                return new Response(JSON.stringify(profile || null), { headers: { "Content-Type": "application/json" } });
            } catch (e: any) {
                // Handle missing column (schema mismatch only, table is already ensured)
                if (e.message && e.message.includes("no column named")) {
                    console.log("Schema mismatch detected (" + e.message + "). Recreating tables...");
                    await dropAllTables(env.DB);
                    await ensureAllTables(env.DB);

                    // Retry
                    const profile = await env.DB.prepare(
                        "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                    ).bind(grade, classNum, studentNumber).first();
                    return new Response(JSON.stringify(profile || null), { headers: { "Content-Type": "application/json" } });
                }
                throw e;
            }
        }

        // 2. Fetch Elective Config (Available Subjects)
        const grade = url.searchParams.get("grade");
        if (!grade) {
            return new Response(JSON.stringify({ error: "Grade is required" }), { status: 400 });
        }

        const configs = await env.DB.prepare(
            "SELECT * FROM elective_config WHERE grade = ? ORDER BY classCode, subject"
        ).bind(grade).all();
        return new Response(JSON.stringify(configs.results), { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    try {
        // Proactively ensure tables
        await ensureAllTables(env.DB);

        const body = await request.json() as any;
        console.log("Received save request:", body);
        const { grade, classNum, studentNumber, electives } = body;

        if (!grade || !classNum || !studentNumber || !electives) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        // Upsert student_profiles
        const query = `
        INSERT INTO student_profiles (grade, classNum, studentNumber, electives, updatedAt)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(grade, classNum, studentNumber) 
        DO UPDATE SET electives = excluded.electives, updatedAt = excluded.updatedAt
        `;

        try {
            await env.DB.prepare(query).bind(grade, classNum, studentNumber, JSON.stringify(electives)).run();
        } catch (dbErr: any) {
            // Handle schema mismatch (column missing)
            if (dbErr.message && dbErr.message.includes("no column named")) {
                console.log("Schema mismatch detected during save (" + dbErr.message + "). Recreating tables...");
                await dropAllTables(env.DB);
                await ensureAllTables(env.DB);

                // Retry
                await env.DB.prepare(query).bind(grade, classNum, studentNumber, JSON.stringify(electives)).run();
            } else {
                throw dbErr;
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        console.error("Handler Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Unknown error" }), { status: 500 });
    }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const url = new URL(request.url);

    try {
        const grade = url.searchParams.get("grade");
        const classNum = url.searchParams.get("classNum");
        const studentNumber = url.searchParams.get("studentNumber");

        if (!grade || !classNum || !studentNumber) {
            return new Response(JSON.stringify({ error: "Missing parameters for deletion" }), { status: 400 });
        }

        // Delete the student profile
        const query = `
        DELETE FROM student_profiles 
        WHERE grade = ? AND classNum = ? AND studentNumber = ?
        `;

        await env.DB.prepare(query).bind(grade, classNum, studentNumber).run();

        return new Response(JSON.stringify({ success: true, message: "Electives reset successfully" }), { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        console.error("Delete Handler Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Unknown error during reset" }), { status: 500 });
    }
};
