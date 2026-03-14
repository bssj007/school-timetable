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

        // 1. Fetch Student Profile (dataset-aware)
        if (type === "student") {
            const gradeStr = url.searchParams.get("grade");
            const classNumStr = url.searchParams.get("classNum");
            const studentNumberStr = url.searchParams.get("studentNumber");
            const dataset = url.searchParams.get("dataset") ?? '';

            if (!gradeStr || !classNumStr || !studentNumberStr) {
                return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
            }

            const grade = parseInt(gradeStr);
            const classNum = parseInt(classNumStr);
            const studentNumber = parseInt(studentNumberStr);

            try {
                const profile = await env.DB.prepare(
                    "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ? AND dataset = ?"
                ).bind(grade, classNum, studentNumber, dataset).first();
                return new Response(JSON.stringify(profile || null), { headers: { "Content-Type": "application/json" } });
            } catch (e: any) {
                if (e.message && e.message.includes("no column named")) {
                    try { await env.DB.prepare("ALTER TABLE student_profiles ADD COLUMN dataset TEXT DEFAULT ''").run(); } catch (_) {}
                    const profile = await env.DB.prepare(
                        "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ? AND dataset = ?"
                    ).bind(grade, classNum, studentNumber, dataset).first();
                    return new Response(JSON.stringify(profile || null), { headers: { "Content-Type": "application/json" } });
                }
                throw e;
            }
        }

        // 2. Fetch ALL student profiles for a grade (admin pre-entry, dataset-aware)
        if (type === "all-students") {
            const gradeStr = url.searchParams.get("grade");
            const dataset = url.searchParams.get("dataset") ?? '';
            if (!gradeStr) {
                return new Response(JSON.stringify({ error: "Grade is required" }), { status: 400 });
            }
            const grade = parseInt(gradeStr);
            const profiles = await env.DB.prepare(
                "SELECT * FROM student_profiles WHERE grade = ? AND dataset = ? ORDER BY classNum, studentNumber"
            ).bind(grade, dataset).all();
            return new Response(JSON.stringify(profiles.results || []), { headers: { "Content-Type": "application/json" } });
        }

        // 3. Fetch Elective Config (Available Subjects)
        const grade = url.searchParams.get("grade");
        const dataset = url.searchParams.get("dataset");
        if (!grade) {
            return new Response(JSON.stringify({ error: "Grade is required" }), { status: 400 });
        }
        if (!dataset) {
            return new Response(JSON.stringify({ error: "Dataset is required" }), { status: 400 });
        }

        const configs = await env.DB.prepare(
            "SELECT * FROM elective_config WHERE grade = ? AND dataset = ? ORDER BY classCode, subject"
        ).bind(grade, dataset).all();
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
        const { grade, classNum, studentNumber, electives, dataset = '' } = body;

        if (!grade || !classNum || !studentNumber || !electives) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        // 빈 선택과목 저장 방지: {} 로 기존 데이터를 덮어쓰는 것을 차단 (allowEmpty 플래그로 관리자 도구에서 명시적 클리어 허용)
        const electivesObj = typeof electives === 'string' ? JSON.parse(electives) : electives;
        if (!body.allowEmpty && (typeof electivesObj !== 'object' || Array.isArray(electivesObj) || Object.keys(electivesObj).length === 0)) {
            return new Response(JSON.stringify({ error: "electives must be a non-empty object" }), { status: 400 });
        }

        // Upsert student_profiles (dataset-aware — UNIQUE includes dataset after schema migration)
        const query = `
        INSERT INTO student_profiles (grade, classNum, studentNumber, electives, dataset, updatedAt)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(grade, classNum, studentNumber, dataset)
        DO UPDATE SET electives = excluded.electives, updatedAt = excluded.updatedAt
        `;

        try {
            await env.DB.prepare(query).bind(grade, classNum, studentNumber, JSON.stringify(electives), dataset).run();
        } catch (dbErr: any) {
            // Handle schema mismatch (column missing)
            if (dbErr.message && dbErr.message.includes("no column named")) {
                console.log("Schema mismatch detected during save (" + dbErr.message + "). Recreating tables...");

                // Add column via migration rather than drop all if possible
                try {
                    await env.DB.prepare("ALTER TABLE student_profiles ADD COLUMN dataset TEXT DEFAULT ''").run();
                    await env.DB.prepare(query).bind(grade, classNum, studentNumber, JSON.stringify(electives), dataset).run();
                } catch (alterErr) {
                    await dropAllTables(env.DB);
                    await ensureAllTables(env.DB);
                    await env.DB.prepare(query).bind(grade, classNum, studentNumber, JSON.stringify(electives), dataset).run();
                }
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
        const dataset = url.searchParams.get("dataset") ?? '';

        if (!grade || !classNum || !studentNumber) {
            return new Response(JSON.stringify({ error: "Missing parameters for deletion" }), { status: 400 });
        }

        // Delete the student profile for this specific dataset
        await env.DB.prepare(
            "DELETE FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ? AND dataset = ?"
        ).bind(grade, classNum, studentNumber, dataset).run();

        return new Response(JSON.stringify({ success: true, message: "Electives reset successfully" }), { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        console.error("Delete Handler Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Unknown error during reset" }), { status: 500 });
    }
};
