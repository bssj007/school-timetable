import { adminPassword } from "../../../../server/adminPW";

/**
 * Executes a BRIDGE mapping.
 * Duplicates/Remaps Selective Config data, 
 * Student Profile selected subjects, 
 * and Performance Assessments based on 1:1 subject name mappings.
 */
export const onRequest = async (context: any) => {
    const { request, env } = context;

    const authHeader = request.headers.get('X-Admin-Password');
    if (authHeader !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const body = await request.json();
        const { bridgeId, options } = body;

        if (!bridgeId) {
            return new Response('Missing bridgeId', { status: 400 });
        }

        // 1. Fetch the Bridge config
        const bridgeEntry = await env.DB.prepare(
            "SELECT * FROM dataset_bridges WHERE id = ?"
        ).bind(bridgeId).first();

        if (!bridgeEntry) {
            return new Response('Bridge not found', { status: 404 });
        }

        const { fromDataset, toDataset, targetGrade, mappingData: mappingDataStr } = bridgeEntry;
        const mappingData = JSON.parse(mappingDataStr); // Expected format: { "Math": "Mathematics 1", "Eng": "English 2" }


        // Reverse mapping for converting string "from" to "to".
        // Example: mappingData is usually { source: target }
        // Let's assume the UI sends it as an object { [sourceSubject]: targetSubject }
        // or an Array of { from: string, to: string }. We'll support Array for clarity.

        let mappingDict: Record<string, string> = {};
        if (Array.isArray(mappingData)) {
            mappingData.forEach((row: any) => {
                if (row.from) {
                    mappingDict[row.from] = (!row.to || row.to === "_none_") ? "_none_" : row.to;
                }
            });
        } else if (typeof mappingData === 'object') {
            mappingDict = mappingData;
        }

        // The flags indicated by user
        const { migrateElectiveConfig, migrateStudentProfiles, migrateAssessments } = options || {};

        if (targetGrade === 1 && (migrateElectiveConfig || migrateStudentProfiles)) {
            return new Response(JSON.stringify({ error: "1학년은 선택과목 데이터 복제 및 프로필 과목 변경을 지원하지 않습니다." }), { status: 400 });
        }

        let totalElectiveConfigsCopied = 0;
        let totalStudentProfilesUpdated = 0;
        let totalAssessmentsUpdated = 0;

        // --- 1. Migrate Elective Configs ---
        if (migrateElectiveConfig) {
            // Read fromDataset ONLY for the targetGrade
            const { results: sourceConfigs } = await env.DB.prepare(
                "SELECT * FROM elective_config WHERE dataset = ? AND grade = ?"
            ).bind(fromDataset, targetGrade).all();

            // Delete old existing configs on toDataset for this targetGrade
            await env.DB.prepare("DELETE FROM elective_config WHERE dataset = ? AND grade = ?").bind(toDataset, targetGrade).run();

            const batchStatements = [];
            for (const config of sourceConfigs) {
                // Apply mapping to subject name. Default to original if not found in dict.
                const mappedSubject = mappingDict[config.subject] !== undefined ? mappingDict[config.subject] : config.subject;

                // If the mapping explicitly says "_none_", we skip duplicating this subject.
                if (mappedSubject === "_none_") continue;

                batchStatements.push(env.DB.prepare(
                    "INSERT INTO elective_config (grade, subject, originalTeacher, classCode, fullTeacherName, className, fullSubjectName, isMovingClass, isCombinedClass, dataset, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(
                    config.grade, mappedSubject, config.originalTeacher, config.classCode,
                    config.fullTeacherName, config.className, config.fullSubjectName,
                    config.isMovingClass, config.isCombinedClass, toDataset, new Date().toISOString()
                ));
            }

            if (batchStatements.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < batchStatements.length; i += chunkSize) {
                    const chunk = batchStatements.slice(i, i + chunkSize);
                    await env.DB.batch(chunk);
                }
                totalElectiveConfigsCopied = batchStatements.length;
            }
        }

        // --- 2. Migrate Student Profiles ---
        // Profile migrations should strictly apply to the targetGrade
        if (migrateStudentProfiles) {
            const { results: profiles } = await env.DB.prepare(
                "SELECT * FROM student_profiles WHERE grade = ?"
            ).bind(targetGrade).all();

            const batchStatements = [];
            for (const profile of profiles) {
                if (!profile.electives) continue;
                try {
                    const electivesObj = JSON.parse(profile.electives);
                    let changed = false;
                    const newElectives: string[] = [];

                    if (Array.isArray(electivesObj)) {
                        for (const subj of electivesObj) {
                            const mapped = mappingDict[subj] !== undefined ? mappingDict[subj] : subj;
                            if (mapped === "_none_") {
                                changed = true; // Subject dropped
                            } else {
                                newElectives.push(mapped);
                                if (mapped !== subj) changed = true;
                            }
                        }
                    } else if (typeof electivesObj === 'object') {
                        // Format: { "A": { subject, teacher, fullSubjectName }, "B": {...}, ... }
                        Object.keys(electivesObj).forEach(groupKey => {
                            const entry = electivesObj[groupKey];
                            if (!entry) return;

                            if (typeof entry === 'object' && entry.subject) {
                                // 현재 표준 형식: { subject, teacher, fullSubjectName }
                                const oldSubject = entry.subject;
                                const mapped = mappingDict[oldSubject] !== undefined ? mappingDict[oldSubject] : oldSubject;
                                if (mapped === "_none_") {
                                    delete electivesObj[groupKey];
                                    changed = true;
                                } else if (mapped !== oldSubject) {
                                    electivesObj[groupKey] = { ...entry, subject: mapped, fullSubjectName: undefined };
                                    changed = true;
                                }
                            } else if (typeof entry === 'string') {
                                // 레거시 문자열 형식
                                const mapped = mappingDict[entry] !== undefined ? mappingDict[entry] : entry;
                                if (mapped === "_none_") {
                                    delete electivesObj[groupKey];
                                    changed = true;
                                } else if (mapped !== entry) {
                                    electivesObj[groupKey] = mapped;
                                    changed = true;
                                }
                            }
                        });
                    }

                    if (changed) {
                        batchStatements.push(env.DB.prepare(
                            "UPDATE student_profiles SET electives = ?, updatedAt = ? WHERE id = ?"
                        ).bind(JSON.stringify(Array.isArray(electivesObj) ? newElectives : electivesObj), new Date().toISOString(), profile.id));
                    }
                } catch (e) {
                    console.error("Failed to parse electives for profile", profile.id, e);
                }
            }

            if (batchStatements.length > 0) {
                // Batch execution limit in D1 is typical 100 statements. If large, split array.
                // Doing chunks of 50.
                const chunkSize = 50;
                for (let i = 0; i < batchStatements.length; i += chunkSize) {
                    const chunk = batchStatements.slice(i, i + chunkSize);
                    await env.DB.batch(chunk);
                }
                totalStudentProfilesUpdated = batchStatements.length;
            }
        }

        // --- 3. Migrate Assessments ---
        if (migrateAssessments) {
            // Apply mappings only to assessments belonging to the targetGrade
            const { results: assessments } = await env.DB.prepare(
                "SELECT id, subject FROM performance_assessments WHERE grade = ?"
            ).bind(targetGrade).all();

            const batchStatements = [];
            for (const assessment of assessments) {
                if (mappingDict[assessment.subject] && mappingDict[assessment.subject] !== "_none_") {
                    batchStatements.push(env.DB.prepare(
                        "UPDATE performance_assessments SET subject = ? WHERE id = ?"
                    ).bind(mappingDict[assessment.subject], assessment.id));
                }
            }

            if (batchStatements.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < batchStatements.length; i += chunkSize) {
                    const chunk = batchStatements.slice(i, i + chunkSize);
                    await env.DB.batch(chunk);
                }
                totalAssessmentsUpdated = batchStatements.length;
            }
        }

        // --- 4. Migrate Group Overrides ---
        // elective_group_overrides는 global settings에 저장됨 (dataset 무관)
        // "포함" 선택 시: 현재 grade의 override를 clear하지 않고 그대로 유지하는 것이 기본
        // 단, 새 학기로 이월 시 기존 override를 초기화하거나 유지하는 선택을 제공
        let overridesMigrated = false;
        if (options?.migrateGroupOverrides && targetGrade !== 1) {
            try {
                const settingsRow = await env.DB.prepare(
                    "SELECT value FROM system_settings WHERE key = 'elective_group_overrides'"
                ).first();

                const currentOverrides = settingsRow?.value
                    ? JSON.parse(settingsRow.value as string)
                    : { "2": {}, "3": {} };

                const gradeKey = targetGrade.toString();

                // 현재 grade의 override가 비어있으면 빈 객체로 초기화(새학기 시작)
                // 기존 override를 그대로 두는 것이 "포함" 의미 → 이미 있으면 유지
                if (!currentOverrides[gradeKey]) {
                    currentOverrides[gradeKey] = {};
                }
                // 이미 grade override가 있으면 유지 (마이그레이션 = 보존)

                await env.DB.prepare(
                    "INSERT INTO system_settings (key, value) VALUES ('elective_group_overrides', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
                ).bind(JSON.stringify(currentOverrides)).run();

                overridesMigrated = true;
            } catch (e) {
                console.error("Override migration failed:", e);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            results: {
                totalElectiveConfigsCopied,
                totalStudentProfilesUpdated,
                totalAssessmentsUpdated,
                overridesMigrated
            }
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (e: any) {
        console.error("Execute Bridge Error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
