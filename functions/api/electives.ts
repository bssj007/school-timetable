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

// ── Helper: Extract electives for a specific dataset from a profile row ──
function getElectivesForDataset(profile: any, dataset: string): any {
    if (!profile) return null;
    const rawDataset = profile.dataset;
    const rawElectives = profile.electives;

    // Parse dataset column
    let datasets: string[];
    try {
        const parsed = JSON.parse(rawDataset);
        datasets = Array.isArray(parsed) ? parsed : [rawDataset || ''];
    } catch {
        datasets = [rawDataset || ''];
    }

    // Parse electives column
    let electivesArr: any[];
    try {
        const parsed = JSON.parse(rawElectives);
        electivesArr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        electivesArr = [rawElectives];
    }

    const idx = datasets.indexOf(dataset);
    if (idx === -1) return null;
    return electivesArr[idx] ?? null;
}

// ── Helper: Set electives for a specific dataset within a profile row ──
function setElectivesForDataset(profile: any, dataset: string, newElectives: any): { electives: string, datasetCol: string } {
    const rawDataset = profile?.dataset;
    const rawElectivesStr = profile?.electives;

    // Parse dataset column
    let datasets: string[];
    try {
        const parsed = JSON.parse(rawDataset);
        datasets = Array.isArray(parsed) ? parsed : [rawDataset || ''];
    } catch {
        datasets = [rawDataset || ''];
    }

    // Parse electives column
    let electivesArr: any[];
    try {
        const parsed = JSON.parse(rawElectivesStr);
        electivesArr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        electivesArr = [null];
    }

    const idx = datasets.indexOf(dataset);
    if (idx !== -1) {
        // Update existing
        electivesArr[idx] = newElectives;
    } else {
        // Append new
        datasets.push(dataset);
        electivesArr.push(newElectives);
    }

    // If only 1 entry, store as plain (backwards compatible)
    if (datasets.length === 1) {
        return {
            electives: JSON.stringify(electivesArr[0]),
            datasetCol: datasets[0]
        };
    }

    return {
        electives: JSON.stringify(electivesArr),
        datasetCol: JSON.stringify(datasets)
    };
}

// ── Helper: Remove electives for a specific dataset within a profile row ──
function removeElectivesForDataset(profile: any, dataset: string): { electives: string, datasetCol: string } | null {
    const rawDataset = profile?.dataset;
    const rawElectivesStr = profile?.electives;

    let datasets: string[];
    try {
        const parsed = JSON.parse(rawDataset);
        datasets = Array.isArray(parsed) ? parsed : [rawDataset || ''];
    } catch {
        datasets = [rawDataset || ''];
    }

    let electivesArr: any[];
    try {
        const parsed = JSON.parse(rawElectivesStr);
        electivesArr = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        electivesArr = [null];
    }

    const idx = datasets.indexOf(dataset);
    if (idx === -1) return null; // Nothing to remove

    datasets.splice(idx, 1);
    electivesArr.splice(idx, 1);

    if (datasets.length === 0) return null; // All removed → delete the row

    if (datasets.length === 1) {
        return {
            electives: JSON.stringify(electivesArr[0]),
            datasetCol: datasets[0]
        };
    }

    return {
        electives: JSON.stringify(electivesArr),
        datasetCol: JSON.stringify(datasets)
    };
}


export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    try {
        // Proactively ensure all tables exist (optimistic check)
        await ensureAllTables(env.DB);

        // 1. Fetch Student Profile (dataset-aware via array extraction)
        if (type === "student") {
            const gradeStr = url.searchParams.get("grade");
            const classNumStr = url.searchParams.get("classNum");
            const studentNumberStr = url.searchParams.get("studentNumber");
            const originalDataset = url.searchParams.get("dataset") ?? '';
            const dataset = (originalDataset === 'MANUAL_PLAN' || originalDataset === 'SEMESTER_PLAN') ? originalDataset : 'COMCIGAN';

            if (!gradeStr || !classNumStr || !studentNumberStr) {
                return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
            }

            const grade = parseInt(gradeStr);
            const classNum = parseInt(classNumStr);
            const studentNumber = parseInt(studentNumberStr);

            try {
                const profile = await env.DB.prepare(
                    "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(grade, classNum, studentNumber).first();

                if (!profile) {
                    return new Response(JSON.stringify(null), { headers: { "Content-Type": "application/json" } });
                }

                // Extract electives for the requested dataset
                const electives = getElectivesForDataset(profile, dataset);
                const result = { ...profile, electives: electives ? JSON.stringify(electives) : null, dataset };
                return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
            } catch (e: any) {
                if (e.message && e.message.includes("no column named")) {
                    try { await env.DB.prepare("ALTER TABLE student_profiles ADD COLUMN dataset TEXT DEFAULT ''").run(); } catch (_) {}
                    const profile = await env.DB.prepare(
                        "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                    ).bind(grade, classNum, studentNumber).first();
                    if (!profile) {
                        return new Response(JSON.stringify(null), { headers: { "Content-Type": "application/json" } });
                    }
                    const electives = getElectivesForDataset(profile, dataset);
                    const result = { ...profile, electives: electives ? JSON.stringify(electives) : null, dataset };
                    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
                }
                throw e;
            }
        }

        // 2. Fetch ALL student profiles for a grade (admin pre-entry, dataset-aware)
        if (type === "all-students") {
            const gradeStr = url.searchParams.get("grade");
            const originalDataset = url.searchParams.get("dataset") ?? '';
            const dataset = (originalDataset === 'MANUAL_PLAN' || originalDataset === 'SEMESTER_PLAN') ? originalDataset : 'COMCIGAN';
            if (!gradeStr) {
                return new Response(JSON.stringify({ error: "Grade is required" }), { status: 400 });
            }
            const grade = parseInt(gradeStr);
            const { results: profiles } = await env.DB.prepare(
                "SELECT * FROM student_profiles WHERE grade = ? ORDER BY classNum, studentNumber"
            ).bind(grade).all();

            // Extract only the electives for the requested dataset from each profile
            const mapped = (profiles || []).map((p: any) => {
                const electives = getElectivesForDataset(p, dataset);
                return { ...p, electives: electives ? JSON.stringify(electives) : null, dataset };
            }).filter((p: any) => p.electives !== null); // Only return profiles that have data for this dataset

            return new Response(JSON.stringify(mapped), { headers: { "Content-Type": "application/json" } });
        }

        // 3. Fetch Elective Config (Available Subjects)
        const grade = url.searchParams.get("grade");
        const originalDataset = url.searchParams.get("dataset") ?? '';
        const dataset = (originalDataset === 'MANUAL_PLAN' || originalDataset === 'SEMESTER_PLAN') ? originalDataset : 'COMCIGAN';
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
        const { grade, classNum, studentNumber, electives, dataset: reqDataset = '' } = body;
        const dataset = (reqDataset === 'MANUAL_PLAN' || reqDataset === 'SEMESTER_PLAN') ? reqDataset : 'COMCIGAN';

        if (!grade || !classNum || !studentNumber || !electives) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        // 빈 선택과목 저장 방지
        const electivesObj = typeof electives === 'string' ? JSON.parse(electives) : electives;
        if (!body.allowEmpty && (typeof electivesObj !== 'object' || Array.isArray(electivesObj) || Object.keys(electivesObj).length === 0)) {
            return new Response(JSON.stringify({ error: "electives must be a non-empty object" }), { status: 400 });
        }

        // Read existing profile
        const existing = await env.DB.prepare(
            "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?"
        ).bind(grade, classNum, studentNumber).first();

        if (existing) {
            // Merge into existing row's arrays
            const { electives: mergedElectives, datasetCol } = setElectivesForDataset(existing, dataset, electivesObj);
            await env.DB.prepare(
                "UPDATE student_profiles SET electives = ?, dataset = ?, updatedAt = datetime('now') WHERE id = ?"
            ).bind(mergedElectives, datasetCol, existing.id).run();
        } else {
            // New row — store as plain (backwards compatible)
            await env.DB.prepare(
                "INSERT INTO student_profiles (grade, classNum, studentNumber, electives, dataset, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'))"
            ).bind(grade, classNum, studentNumber, JSON.stringify(electivesObj), dataset).run();
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
        const originalDataset = url.searchParams.get("dataset") ?? '';
        const dataset = (originalDataset === 'MANUAL_PLAN' || originalDataset === 'SEMESTER_PLAN') ? originalDataset : 'COMCIGAN';

        if (!grade || !classNum || !studentNumber) {
            return new Response(JSON.stringify({ error: "Missing parameters for deletion" }), { status: 400 });
        }

        // Read existing profile
        const existing = await env.DB.prepare(
            "SELECT * FROM student_profiles WHERE grade = ? AND classNum = ? AND studentNumber = ?"
        ).bind(grade, classNum, studentNumber).first();

        if (existing) {
            const result = removeElectivesForDataset(existing, dataset);
            if (result === null) {
                // No more datasets → delete the entire row
                await env.DB.prepare(
                    "DELETE FROM student_profiles WHERE id = ?"
                ).bind(existing.id).run();
            } else {
                // Update with remaining datasets
                await env.DB.prepare(
                    "UPDATE student_profiles SET electives = ?, dataset = ?, updatedAt = datetime('now') WHERE id = ?"
                ).bind(result.electives, result.datasetCol, existing.id).run();
            }
        }

        return new Response(JSON.stringify({ success: true, message: "Electives reset successfully" }), { headers: { "Content-Type": "application/json" } });

    } catch (error: any) {
        console.error("Delete Handler Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Unknown error during reset" }), { status: 500 });
    }
};
