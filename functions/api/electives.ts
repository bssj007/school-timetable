/// <reference types="@cloudflare/workers-types" />
import { ensureAllTables } from "../db_schema";


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

        // 1. Fetch Student Profile — 식별자: name + grade + classNum + studentNumber (4개 전부 필수)
        if (type === "student") {
            const gradeStr = url.searchParams.get("grade");
            const classNumStr = url.searchParams.get("classNum");
            const studentNumberStr = url.searchParams.get("studentNumber");
            const studentName = url.searchParams.get("studentName")?.trim() ?? '';
            const originalDataset = url.searchParams.get("dataset") ?? '';
            const dataset = (originalDataset === 'MANUAL_PLAN' || originalDataset === 'SEMESTER_PLAN') ? originalDataset : 'COMCIGAN';

            if (!gradeStr || !classNumStr || !studentNumberStr || !studentName) {
                return new Response(JSON.stringify({ error: "Missing parameters: grade, classNum, studentNumber, studentName are all required" }), { status: 400 });
            }

            const grade = parseInt(gradeStr);
            const classNum = parseInt(classNumStr);
            const studentNumber = parseInt(studentNumberStr);

            const profile = await env.DB.prepare(
                "SELECT * FROM student_profiles WHERE name = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
            ).bind(studentName, grade, classNum, studentNumber).first();

            // ── 프리셋 자동 적용 (신규 사용자 / 선택과목 미설정) ─────────────────
            // 프로필 없거나 현재 dataset의 electives가 비어있는 경우에만 적용
            const hasExistingElectives = profile && !!getElectivesForDataset(profile, dataset);

            if (!hasExistingElectives) {
                // elective_presets에서 (grade, classNum, studentNumber) 조회
                const preset = await env.DB.prepare(
                    "SELECT * FROM elective_presets WHERE grade = ? AND classNum = ? AND studentNumber = ?"
                ).bind(grade, classNum, studentNumber).first().catch(() => null);

                if (preset && preset.electives) {
                    // 사전지정 존재 → student_profiles에 저장 (이후 사용자 데이터로 취급)
                    if (!profile) {
                        // 프로필 자체가 없으면 생성
                        await env.DB.prepare(`
                            INSERT INTO student_profiles (name, grade, classNum, studentNumber, electives, dataset, updatedAt)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                            ON CONFLICT(name, grade, classNum, studentNumber)
                            DO UPDATE SET electives = excluded.electives, dataset = excluded.dataset, updatedAt = datetime('now')
                        `).bind(studentName, grade, classNum, studentNumber, preset.electives, preset.dataset || dataset).run()
                          .catch((e: any) => console.error("[Preset] Insert failed:", e.message));
                    } else {
                        // 프로필은 있지만 electives 비어있음 → preset으로 채우기
                        const updated = setElectivesForDataset(profile, dataset, JSON.parse(preset.electives));
                        await env.DB.prepare(
                            "UPDATE student_profiles SET electives = ?, dataset = ?, updatedAt = datetime('now') WHERE name = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
                        ).bind(updated.electives, updated.datasetCol, studentName, grade, classNum, studentNumber).run()
                          .catch((e: any) => console.error("[Preset] Update failed:", e.message));
                    }

                    // 적용된 프리셋 데이터 반환
                    const presetElectives = JSON.parse(preset.electives);
                    console.log(`[Preset] Applied preset for ${grade}-${classNum}-${studentNumber} (student: ${studentName})`);
                    return new Response(JSON.stringify({
                        grade, classNum, studentNumber, name: studentName,
                        electives: preset.electives, dataset,
                        _presetApplied: true
                    }), { headers: { "Content-Type": "application/json" } });
                }

                // 프리셋도 없으면 기존대로 null
                if (!profile) {
                    return new Response(JSON.stringify(null), { headers: { "Content-Type": "application/json" } });
                }
            }

            const electives = getElectivesForDataset(profile, dataset);
            const result = { ...profile, electives: electives ? JSON.stringify(electives) : null, dataset };
            return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
        }

        // 2. Fetch ALL student profiles for a grade (admin pre-entry — 어드민 그리드는 현행 유지)
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

            const mapped = (profiles || []).map((p: any) => {
                const electives = getElectivesForDataset(p, dataset);
                return { ...p, electives: electives ? JSON.stringify(electives) : null, dataset };
            }).filter((p: any) => p.electives !== null);

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
        const { grade, classNum, studentNumber, studentName, electives, dataset: reqDataset = '' } = body;
        const dataset = (reqDataset === 'MANUAL_PLAN' || reqDataset === 'SEMESTER_PLAN') ? reqDataset : 'COMCIGAN';

        const name = typeof studentName === 'string' ? studentName.trim() : '';

        // 이름 + 학번 모두 필수
        if (!grade || !classNum || !studentNumber || !name) {
            return new Response(JSON.stringify({ error: "Missing required fields: grade, classNum, studentNumber, studentName are all required" }), { status: 400 });
        }
        if (!electives) {
            return new Response(JSON.stringify({ error: "Missing required fields: electives" }), { status: 400 });
        }

        // 빈 선택과목 저장 방지
        const electivesObj = typeof electives === 'string' ? JSON.parse(electives) : electives;
        if (!body.allowEmpty && (typeof electivesObj !== 'object' || Array.isArray(electivesObj) || Object.keys(electivesObj).length === 0)) {
            return new Response(JSON.stringify({ error: "electives must be a non-empty object" }), { status: 400 });
        }

        // 복합 식별자 (name, grade, classNum, studentNumber) 기준으로 조회
        const existing = await env.DB.prepare(
            "SELECT * FROM student_profiles WHERE name = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
        ).bind(name, grade, classNum, studentNumber).first();

        if (existing) {
            const { electives: mergedElectives, datasetCol } = setElectivesForDataset(existing, dataset, electivesObj);
            await env.DB.prepare(
                "UPDATE student_profiles SET electives = ?, dataset = ?, updatedAt = datetime('now') WHERE id = ?"
            ).bind(mergedElectives, datasetCol, existing.id).run();
        } else {
            await env.DB.prepare(`
                INSERT INTO student_profiles (name, grade, classNum, studentNumber, electives, dataset, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(name, grade, classNum, studentNumber) DO UPDATE SET
                    electives = excluded.electives,
                    dataset = excluded.dataset,
                    updatedAt = datetime('now')
            `).bind(name, grade, classNum, studentNumber, JSON.stringify(electivesObj), dataset).run();
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
        const studentName = url.searchParams.get("studentName")?.trim() ?? '';
        const originalDataset = url.searchParams.get("dataset") ?? '';
        const dataset = (originalDataset === 'MANUAL_PLAN' || originalDataset === 'SEMESTER_PLAN') ? originalDataset : 'COMCIGAN';

        // 이름 + 학번 모두 필수
        if (!grade || !classNum || !studentNumber || !studentName) {
            return new Response(JSON.stringify({ error: "Missing parameters: grade, classNum, studentNumber, studentName are all required" }), { status: 400 });
        }

        const existing = await env.DB.prepare(
            "SELECT * FROM student_profiles WHERE name = ? AND grade = ? AND classNum = ? AND studentNumber = ?"
        ).bind(studentName, parseInt(grade), parseInt(classNum), parseInt(studentNumber)).first();

        if (existing) {
            const result = removeElectivesForDataset(existing, dataset);
            if (result === null) {
                await env.DB.prepare(
                    "DELETE FROM student_profiles WHERE id = ?"
                ).bind(existing.id).run();
            } else {
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
