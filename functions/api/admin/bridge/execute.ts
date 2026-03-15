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

            // Fetch target teacher information to prevent duplicate Subject-Teacher mismatches
            let targetSubjectsInfo: Record<string, string> = {};
            try {
                // Ensure request.url exists so we can derive origin. Since it's a Worker trigger, context.url or request.url is available.
                const origin = new URL(request.url).origin;
                const fetchUrl = `${origin}/api/admin/comcigan-subjects?grade=${targetGrade}&dataset=${toDataset}`;
                
                const subjRes = await fetch(fetchUrl, {
                    headers: { "X-Admin-Password": adminPassword }
                });
                
                if (subjRes.ok) {
                    const subjData = await subjRes.json() as any[];
                    subjData.forEach(item => {
                        if (item.subject) {
                            // Keep the first (or only) teacher found for this subject in the target dataset
                            targetSubjectsInfo[item.subject] = item.teacher || "";
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
                    newTeacher = mappedTeacher;
                } else if (targetSubjectsInfo[mappedSubject] !== undefined) {
                    newTeacher = targetSubjectsInfo[mappedSubject];
                }

                // User Request: Preserve the original teacher (which we correctly resolved above)
                // BUT always transfer the fullTeacherName from the source config. Fallback to originalTeacher if missing.
                if (copyFullName) {
                    newFullTeacherName = config.fullTeacherName || config.originalTeacher;
                } else {
                    newFullTeacherName = ""; // Or we could keep target's existing if we had it, but this is a fresh copy so "" is proper if disabled
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
        // Ensure student_profiles UNIQUE constraint includes dataset before migrating.
        // (Auto-upgrade so this works even if the admin hasn't manually run migrate_db)
        if (migrateStudentProfiles) {
            // ── Auto-upgrade schema if needed ──────────────────────────────
            try {
                const schemaRow = await env.DB.prepare(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='student_profiles'"
                ).first() as any;
                const schemaSql: string = schemaRow?.sql || "";
                const hasDatasetInUnique = schemaSql.includes("dataset") &&
                    (schemaSql.includes("UNIQUE(grade") || schemaSql.includes("UNIQUE (grade"));

                    // 1. Drop any lingering old tables to prevent rename collisions
                    try { await env.DB.prepare("DROP TABLE IF EXISTS cookie_profiles_old").run(); } catch (_) {}
                    try { await env.DB.prepare("DROP TABLE IF EXISTS ip_profiles_old").run(); } catch (_) {}
                    try { await env.DB.prepare("DROP TABLE IF EXISTS student_profiles_old").run(); } catch (_) {}

                    // 2. Rename existing tables to _old
                    await env.DB.prepare("ALTER TABLE ip_profiles RENAME TO ip_profiles_old").run();
                    await env.DB.prepare("ALTER TABLE cookie_profiles RENAME TO cookie_profiles_old").run();
                    await env.DB.prepare("ALTER TABLE student_profiles RENAME TO student_profiles_old").run();

                    // 3. Create new tables with the updated schema (Dataset in UNIQUE for student_profiles)
                    await env.DB.prepare(`
                        CREATE TABLE student_profiles (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            grade INTEGER NOT NULL,
                            classNum INTEGER NOT NULL,
                            studentNumber INTEGER,
                            electives TEXT,
                            dataset TEXT DEFAULT '',
                            instructionDismissed INTEGER DEFAULT 0,
                            updatedAt TEXT DEFAULT (datetime('now')),
                            UNIQUE(grade, classNum, studentNumber, dataset)
                        )
                    `).run();

                    await env.DB.prepare(`
                        CREATE TABLE ip_profiles (
                            ip TEXT PRIMARY KEY,
                            student_profile_id INTEGER,
                            kakaoId TEXT,
                            kakaoNickname TEXT,
                            lastAccess TEXT,
                            modificationCount INTEGER DEFAULT 0,
                            addCount INTEGER DEFAULT 0,
                            deleteCount INTEGER DEFAULT 0,
                            userAgent TEXT,
                            instructionDismissed INTEGER DEFAULT 0,
                            printCount INTEGER DEFAULT 0,
                            downloadCount INTEGER DEFAULT 0,
                            isStandalone INTEGER DEFAULT 0,
                            FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
                        )
                    `).run();

                    await env.DB.prepare(`
                        CREATE TABLE cookie_profiles (
                            client_id TEXT PRIMARY KEY,
                            student_profile_id INTEGER,
                            kakaoId TEXT,
                            kakaoNickname TEXT,
                            lastAccess TEXT,
                            modificationCount INTEGER DEFAULT 0,
                            addCount INTEGER DEFAULT 0,
                            deleteCount INTEGER DEFAULT 0,
                            userAgent TEXT,
                            instructionDismissed INTEGER DEFAULT 0,
                            ip TEXT,
                            grade INTEGER,
                            classNum INTEGER,
                            studentNumber INTEGER,
                            printCount INTEGER DEFAULT 0,
                            downloadCount INTEGER DEFAULT 0,
                            FOREIGN KEY (student_profile_id) REFERENCES student_profiles(id)
                        )
                    `).run();

                    // 4. Migrate data from _old to new tables
                    await env.DB.prepare(`
                        INSERT OR IGNORE INTO student_profiles (id, grade, classNum, studentNumber, electives, dataset, instructionDismissed, updatedAt)
                        SELECT id, grade, classNum, studentNumber, electives, COALESCE(dataset, ''), COALESCE(instructionDismissed, 0), COALESCE(updatedAt, datetime('now'))
                        FROM student_profiles_old
                    `).run();

                    await env.DB.prepare("INSERT OR IGNORE INTO ip_profiles SELECT * FROM ip_profiles_old").run();
                    await env.DB.prepare("INSERT OR IGNORE INTO cookie_profiles SELECT * FROM cookie_profiles_old").run();

                    // 5. Safely drop _old tables (drop children first to avoid FK errors)
                    await env.DB.prepare("DROP TABLE cookie_profiles_old").run();
                    await env.DB.prepare("DROP TABLE ip_profiles_old").run();
                    await env.DB.prepare("DROP TABLE student_profiles_old").run();

                    console.log("[BRIDGE execute] 3-Table Rebuild: Auto-upgraded student_profiles UNIQUE constraint to include dataset");
                }
            } catch (schemaErr) {
                console.error("[BRIDGE execute] Schema upgrade failed:", schemaErr);
                // Continue anyway — migration may still succeed if schema was already upgraded
            }

            // ── Null out FK refs for toDataset profiles (before deleting them) ─
            try {
                const { results: profilesToDelete } = await env.DB.prepare(
                    "SELECT id FROM student_profiles WHERE grade = ? AND dataset = ?"
                ).bind(targetGrade, toDataset).all();

                if (profilesToDelete && profilesToDelete.length > 0) {
                    const ids = profilesToDelete.map((p: any) => p.id);
                    const chunkSize = 50;
                    
                    for (let i = 0; i < ids.length; i += chunkSize) {
                        const chunk = ids.slice(i, i + chunkSize);
                        const placeholders = chunk.map(() => '?').join(',');
                        
                        try {
                            await env.DB.prepare(`UPDATE ip_profiles SET student_profile_id = NULL WHERE student_profile_id IN (${placeholders})`)
                                .bind(...chunk).run();
                        } catch (e) {
                            console.error("[BRIDGE execute] Failed to null ip_profiles FK:", e);
                        }
                        
                        try {
                            await env.DB.prepare(`UPDATE cookie_profiles SET student_profile_id = NULL WHERE student_profile_id IN (${placeholders})`)
                                .bind(...chunk).run();
                        } catch (e) {
                            console.error("[BRIDGE execute] Failed to null cookie_profiles FK:", e);
                        }
                    }
                }
            } catch (err) {
                console.error("[BRIDGE execute] Failed during FK nullification fetch:", err);
            }

            // ── Delete old toDataset profiles ──────────────────────────────
            await env.DB.prepare(
                "DELETE FROM student_profiles WHERE grade = ? AND dataset = ?"
            ).bind(targetGrade, toDataset).run();

            // ── Read source profiles ────────────────────────────────────────
            // Prefer fromDataset; fall back to dataset='' (legacy data without dataset)
            let { results: profiles } = await env.DB.prepare(
                "SELECT * FROM student_profiles WHERE grade = ? AND dataset = ?"
            ).bind(targetGrade, fromDataset).all();

            if (profiles.length === 0 && fromDataset !== '') {
                const { results: legacyProfiles } = await env.DB.prepare(
                    "SELECT * FROM student_profiles WHERE grade = ? AND (dataset = '' OR dataset IS NULL)"
                ).bind(targetGrade).all();
                profiles = legacyProfiles;
            }

            const batchStatements = [];
            for (const profile of profiles) {
                let newElectivesJson = profile.electives;

                if (profile.electives) {
                    try {
                        const electivesObj = JSON.parse(profile.electives);
                        let changed = false;
                        const newElectives: string[] = [];

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
                                    newElectives.push(mapped);
                                    if (mapped !== subj) changed = true;
                                }
                            }
                            newElectivesJson = changed ? JSON.stringify(newElectives) : profile.electives;
                        } else if (typeof electivesObj === 'object') {
                            Object.keys(electivesObj).forEach(groupKey => {
                                const entry = electivesObj[groupKey];
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
                                        delete electivesObj[groupKey];
                                        changed = true;
                                    } else if (mappedVal !== oldSubject && mappedVal !== oldKey) {
                                        const mappedSubject = mappedVal.replace(/ \([^)]+\)$/, '');
                                        const mappedTeacherMatch = mappedVal.match(/ \(([^)]+)\)$/);
                                        const mappedTeacher = mappedTeacherMatch ? mappedTeacherMatch[1] : entry.teacher;
                                        electivesObj[groupKey] = { ...entry, subject: mappedSubject, teacher: mappedTeacher, fullSubjectName: undefined };
                                        changed = true;
                                    }
                                } else if (typeof entry === 'string') {
                                    const rawMapped =
                                        mappingDict[entry] !== undefined ? mappingDict[entry] :
                                        subjectOnlyMappingDict[entry] !== undefined ? subjectOnlyMappingDict[entry] :
                                        entry;
                                    if (rawMapped === "_none_") {
                                        delete electivesObj[groupKey];
                                        changed = true;
                                    } else {
                                        const mapped = rawMapped.replace(/ \([^)]+\)$/, '');
                                        if (mapped !== entry) { electivesObj[groupKey] = mapped; changed = true; }
                                    }
                                }
                            });
                            newElectivesJson = changed ? JSON.stringify(electivesObj) : profile.electives;
                        }
                    } catch (e) {
                        console.error("Failed to parse/map electives for profile", profile.id, e);
                    }
                }

                // 3. INSERT mapped profile into toDataset
                batchStatements.push(env.DB.prepare(
                    "INSERT OR REPLACE INTO student_profiles (grade, classNum, studentNumber, electives, instructionDismissed, dataset, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
                ).bind(
                    profile.grade, profile.classNum, profile.studentNumber,
                    newElectivesJson, profile.instructionDismissed ?? 0,
                    toDataset, new Date().toISOString()
                ));
            }

            if (batchStatements.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < batchStatements.length; i += chunkSize) {
                    await env.DB.batch(batchStatements.slice(i, i + chunkSize));
                }
                totalStudentProfilesUpdated = batchStatements.length;
            }
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
