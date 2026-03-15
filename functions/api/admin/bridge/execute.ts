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

        if (fromDataset === toDataset) {
            return new Response(JSON.stringify({ error: "출발역과 도착역은 같을 수 없습니다. (Source protection)" }), { status: 400 });
        }

        const mappingData = JSON.parse(mappingDataStr); // Expected format: { "Math": "Mathematics 1", "Eng": "English 2" }


        // Reverse mapping for converting string "from" to "to".
        // Example: mappingData is usually { source: target }
        // Let's assume the UI sends it as an object { [sourceSubject]: targetSubject }
        // or an Array of { from: string, to: string }. We'll support Array for clarity.

        let mappingDict: Record<string, string> = {};
        // Also build a subject-only lookup (stripping "(teacher)") for student profile lookups
        let subjectOnlyMappingDict: Record<string, string> = {};

        const extractSubjectFromBridgeKey = (key: string): string => {
            const parenIdx = key.indexOf(' (');
            return parenIdx !== -1 ? key.slice(0, parenIdx).trim() : key.trim();
        };

        if (Array.isArray(mappingData)) {
            mappingData.forEach((row: any) => {
                if (row.from) {
                    const fullKey = row.from;
                    const mappedTo = (!row.to || row.to === "_none_") ? "_none_" : row.to;
                    mappingDict[fullKey] = mappedTo;
                    // Also map by subject name only (stripped of teacher)
                    const subjOnly = extractSubjectFromBridgeKey(fullKey);
                    // Only set if not yet set by a more specific key
                    if (!subjectOnlyMappingDict[subjOnly]) {
                        subjectOnlyMappingDict[subjOnly] = mappedTo;
                    }
                }
            });
        } else if (typeof mappingData === 'object') {
            mappingDict = mappingData;
        }

        // Helper map removed as per user request for strict mappings.

        // The flags indicated by user
        const { migrateElectiveConfig, migrateStudentProfiles, migrateAssessments, copyFullName = true } = options || {};

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

            // Fetch target teacher information to map source teachers to target dataset teachers
            // Key: "subject|sourceTeacher" → targetTeacher (for precise matching)
            // Also keep "subject" → [teachers] for fallback
            let targetSubjectTeacherMap: Record<string, string> = {}; // "subject|teacher" → targetTeacher
            let targetSubjectTeachers: Record<string, string[]> = {}; // subject → [teachers]
            try {
                const origin = new URL(request.url).origin;
                const fetchUrl = `${origin}/api/admin/comcigan-subjects?grade=${targetGrade}&dataset=${toDataset}`;
                
                const subjRes = await fetch(fetchUrl, {
                    headers: { "X-Admin-Password": adminPassword }
                });
                
                if (subjRes.ok) {
                    const subjData = await subjRes.json() as any[];
                    subjData.forEach(item => {
                        if (item.subject) {
                            const teacher = item.teacher || "";
                            // Map by subject+teacher pair
                            targetSubjectTeacherMap[`${item.subject}|${teacher}`] = teacher;
                            // Also collect all teachers per subject
                            if (!targetSubjectTeachers[item.subject]) targetSubjectTeachers[item.subject] = [];
                            if (!targetSubjectTeachers[item.subject].includes(teacher)) {
                                targetSubjectTeachers[item.subject].push(teacher);
                            }
                        }
                    });
                } else {
                    console.warn(`Failed to fetch target subjects for resolving teacher mappings. Status: ${subjRes.status}`);
                }
            } catch (err) {
                console.error("Error looking up target dataset subjects during migration:", err);
            }

            // Delete old existing configs on toDataset for this targetGrade
            await env.DB.prepare("DELETE FROM elective_config WHERE dataset = ? AND grade = ?").bind(toDataset, targetGrade).run();

            const batchStatements = [];
            for (const config of sourceConfigs) {
                const key = config.originalTeacher ? `${config.subject} (${config.originalTeacher})` : config.subject;
                let mappedVal = mappingDict[key];

                if (mappedVal === undefined) {
                    mappedVal = mappingDict[config.subject]; // Try without teacher if that's how it was mapped
                }

                if (mappedVal === undefined) {
                    mappedVal = config.subject;
                }

                if (mappedVal === "_none_") continue;

                const mappedSubject = mappedVal.replace(/ \([^)]+\)$/, '');
                const mappedTeacherMatch = mappedVal.match(/ \(([^)]+)\)$/);
                const mappedTeacher = mappedTeacherMatch ? mappedTeacherMatch[1] : null;

                let newTeacher = config.originalTeacher;
                let newFullTeacherName = config.fullTeacherName;

                if (mappedTeacher) {
                    // Mapping explicitly specifies target teacher
                    newTeacher = mappedTeacher;
                } else {
                    // No explicit teacher in mapping — try to find the matching teacher in target dataset
                    // First: try exact subject+sourceTeacher match (same teacher exists in target)
                    const exactKey = `${mappedSubject}|${config.originalTeacher || ""}`;
                    if (targetSubjectTeacherMap[exactKey] !== undefined) {
                        newTeacher = targetSubjectTeacherMap[exactKey];
                    } else if (targetSubjectTeachers[mappedSubject]?.length === 1) {
                        // Only one teacher for this subject in target — use it
                        newTeacher = targetSubjectTeachers[mappedSubject][0];
                    }
                    // If multiple teachers and no exact match, keep original teacher name
                }

                // Transfer fullTeacherName based on copyFullName flag
                if (copyFullName) {
                    newFullTeacherName = config.fullTeacherName || config.originalTeacher;
                } else {
                    newFullTeacherName = "";
                }

                batchStatements.push(env.DB.prepare(
                    "INSERT INTO elective_config (grade, subject, originalTeacher, classCode, fullTeacherName, className, fullSubjectName, isMovingClass, isCombinedClass, dataset, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(
                    config.grade, mappedSubject, newTeacher, config.classCode,
                    newFullTeacherName, config.className, config.fullSubjectName,
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
        if (migrateStudentProfiles) {
            // ── Helper: parse dataset/electives columns into arrays ──
            const parseArrayCol = (raw: any): any[] => {
                if (!raw) return [''];
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [raw];
                } catch {
                    return [raw];
                }
            };

            const parseElectivesCol = (raw: any): any[] => {
                if (!raw) return [null];
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    return [null];
                }
            };

            // ── Read ALL student profiles for this grade ──
            const { results: allProfiles } = await env.DB.prepare(
                "SELECT * FROM student_profiles WHERE grade = ?"
            ).bind(targetGrade).all();

            let updatedCount = 0;

            for (const profile of allProfiles) {
                const datasets = parseArrayCol(profile.dataset);
                const electivesArr = parseElectivesCol(profile.electives);

                // Find the fromDataset's electives in this student's arrays
                let fromIdx = datasets.indexOf(fromDataset);
                // Fallback: try legacy empty dataset
                if (fromIdx === -1 && fromDataset !== '') {
                    fromIdx = datasets.indexOf('');
                    if (fromIdx === -1) {
                        const nullIdx = datasets.findIndex((d: any) => d === null || d === undefined);
                        if (nullIdx !== -1) fromIdx = nullIdx;
                    }
                }

                if (fromIdx === -1 || !electivesArr[fromIdx]) continue;

                // Get source electives and apply mapping
                let sourceElectives = electivesArr[fromIdx];
                let mappedElectives = sourceElectives;

                if (sourceElectives && typeof sourceElectives === 'object') {
                    try {
                        const electivesObj = typeof sourceElectives === 'string' ? JSON.parse(sourceElectives) : { ...sourceElectives };
                        let changed = false;
                        const newElectivesList: string[] = [];

                        if (Array.isArray(electivesObj)) {
                            for (const subj of electivesObj) {
                                const rawMapped =
                                    mappingDict[subj] !== undefined ? mappingDict[subj] :
                                    subjectOnlyMappingDict[subj] !== undefined ? subjectOnlyMappingDict[subj] :
                                    subj;
                                if (rawMapped === "_none_") {
                                    changed = true;
                                } else {
                                    const mapped = rawMapped.replace(/ \([^)]+\)$/, '');
                                    newElectivesList.push(mapped);
                                    if (mapped !== subj) changed = true;
                                }
                            }
                            mappedElectives = changed ? newElectivesList : electivesObj;
                        } else if (typeof electivesObj === 'object') {
                            const cloned = { ...electivesObj };
                            Object.keys(cloned).forEach(groupKey => {
                                const entry = cloned[groupKey];
                                if (!entry) return;

                                if (typeof entry === 'object' && entry.subject) {
                                    const oldSubject = entry.subject;
                                    const oldKey = entry.teacher ? `${oldSubject} (${entry.teacher})` : oldSubject;
                                    const mappedVal: string =
                                        mappingDict[oldKey] !== undefined ? mappingDict[oldKey] :
                                        mappingDict[oldSubject] !== undefined ? mappingDict[oldSubject] :
                                        subjectOnlyMappingDict[oldSubject] !== undefined ? subjectOnlyMappingDict[oldSubject] :
                                        oldSubject;

                                    if (mappedVal === "_none_") {
                                        delete cloned[groupKey];
                                        changed = true;
                                    } else if (mappedVal !== oldSubject && mappedVal !== oldKey) {
                                        const mappedSubject = mappedVal.replace(/ \([^)]+\)$/, '');
                                        const mappedTeacherMatch = mappedVal.match(/ \(([^)]+)\)$/);
                                        const mappedTeacher = mappedTeacherMatch ? mappedTeacherMatch[1] : entry.teacher;
                                        cloned[groupKey] = { ...entry, subject: mappedSubject, teacher: mappedTeacher, fullSubjectName: undefined };
                                        changed = true;
                                    }
                                } else if (typeof entry === 'string') {
                                    const rawMapped =
                                        mappingDict[entry] !== undefined ? mappingDict[entry] :
                                        subjectOnlyMappingDict[entry] !== undefined ? subjectOnlyMappingDict[entry] :
                                        entry;
                                    if (rawMapped === "_none_") {
                                        delete cloned[groupKey];
                                        changed = true;
                                    } else {
                                        const mapped = rawMapped.replace(/ \([^)]+\)$/, '');
                                        if (mapped !== entry) { cloned[groupKey] = mapped; changed = true; }
                                    }
                                }
                            });
                            mappedElectives = changed ? cloned : electivesObj;
                        }
                    } catch (e) {
                        console.error("Failed to parse/map electives for profile", profile.id, e);
                    }
                }

                // ── Merge mapped electives into the toDataset slot ──
                const toIdx = datasets.indexOf(toDataset);
                if (toIdx !== -1) {
                    electivesArr[toIdx] = mappedElectives;
                } else {
                    datasets.push(toDataset);
                    electivesArr.push(mappedElectives);
                }

                // Serialize: single entry → plain format (backwards compatible)
                let finalElectives: string;
                let finalDataset: string;
                if (datasets.length === 1) {
                    finalElectives = JSON.stringify(electivesArr[0]);
                    finalDataset = datasets[0];
                } else {
                    finalElectives = JSON.stringify(electivesArr);
                    finalDataset = JSON.stringify(datasets);
                }

                await env.DB.prepare(
                    "UPDATE student_profiles SET electives = ?, dataset = ?, updatedAt = ? WHERE id = ?"
                ).bind(finalElectives, finalDataset, new Date().toISOString(), profile.id).run();

                updatedCount++;
            }

            totalStudentProfilesUpdated = updatedCount;
        }


        // --- 3. Migrate Assessments ---
        if (migrateAssessments) {
            // Delete old existing assessments on toDataset for this targetGrade
            await env.DB.prepare("DELETE FROM performance_assessments WHERE dataset = ? AND grade = ?").bind(toDataset, targetGrade).run();

            // Fetch assessments from the fromDataset
            const { results: assessments } = await env.DB.prepare(
                "SELECT * FROM performance_assessments WHERE grade = ? AND dataset = ? AND isDeleted = 0"
            ).bind(targetGrade, fromDataset).all();

            const batchStatements = [];
            for (const assessment of assessments) {
                let mappedVal = mappingDict[assessment.subject];
                
                if (mappedVal === undefined) {
                    mappedVal = assessment.subject; // Keep original if no explicit mapping
                }

                if (mappedVal !== "_none_") {
                    const mappedSubject = mappedVal.replace(/ \([^)]+\)$/, '');
                    batchStatements.push(env.DB.prepare(
                        "INSERT INTO performance_assessments (subject, title, description, dueDate, grade, classNum, classTime, isDone, dataset, lastModifiedIp, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                    ).bind(
                        mappedSubject, assessment.title, assessment.description, assessment.dueDate, assessment.grade, assessment.classNum, assessment.classTime, assessment.isDone, toDataset, assessment.lastModifiedIp, assessment.createdAt
                    ));
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
