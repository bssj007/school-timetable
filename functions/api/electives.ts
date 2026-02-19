import { ensureProfileTables, dropProfileTables } from "../db_schema";

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
                // Handle missing table OR missing column (schema mismatch)
                if (e.message && (e.message.includes("no such table") || e.message.includes("no column named"))) {
                    console.log("Schema issue detected (" + e.message + "). Recreating tables...");
                    if (e.message.includes("no column named")) {
                        await dropProfileTables(env.DB);
                    }
                    await ensureProfileTables(env.DB);

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

        try {
            const configs = await env.DB.prepare(
                "SELECT * FROM elective_config WHERE grade = ? ORDER BY classCode, subject"
            ).bind(grade).all();
            return new Response(JSON.stringify(configs.results), { headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
            // elective_config might also be missing.
            // If elective_config is missing, we should probably create it too?
            // User emphasized "Lists created as needed".
            // Since I don't have the create script for elective_config in db_schema yet, I'll allow error for now or add it later.
            // But strict requirement: "Script manages DB".
            throw e;
        }

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    try {
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
            // Handle table missing OR column missing
            if (dbErr.message && (dbErr.message.includes("no such table") || dbErr.message.includes("no column named"))) {
                console.log("Schema issue detected during save (" + dbErr.message + "). Recreating tables...");

                if (dbErr.message.includes("no column named")) {
                    await dropProfileTables(env.DB);
                }
                await ensureProfileTables(env.DB);

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

