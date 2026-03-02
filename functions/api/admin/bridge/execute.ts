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

        const { fromDataset, toDataset, mappingData: mappingDataStr } = bridgeEntry;
        const mappingData = JSON.parse(mappingDataStr); // Expected format: { "Math": "Mathematics 1", "Eng": "English 2" }

        // Reverse mapping for converting string "from" to "to".
        // Example: mappingData is usually { source: target }
        // Let's assume the UI sends it as an object { [sourceSubject]: targetSubject }
        // or an Array of { from: string, to: string }. We'll support Array for clarity.

        let mappingDict: Record<string, string> = {};
        if (Array.isArray(mappingData)) {
            mappingData.forEach((row: any) => {
                if (row.from && row.to) {
                    mappingDict[row.from] = row.to;
                }
            });
        } else if (typeof mappingData === 'object') {
            mappingDict = mappingData;
        }

        // The flags indicated by user
        const { migrateElectiveConfig, migrateStudentProfiles, migrateAssessments } = options || {};

        let totalElectiveConfigsCopied = 0;
        let totalStudentProfilesUpdated = 0;
        let totalAssessmentsUpdated = 0;

        // --- 1. Migrate Elective Configs ---
        if (migrateElectiveConfig) {
            // Read fromDataset
            const { results: sourceConfigs } = await env.DB.prepare(
                "SELECT * FROM elective_config WHERE dataset = ?"
            ).bind(fromDataset).all();

            // Delete old existing configs on toDataset ? 
            // Better to clear out the target mapping to prevent duplicates for the same dataset.
            await env.DB.prepare("DELETE FROM elective_config WHERE dataset = ?").bind(toDataset).run();

            const batchStatements = [];
            for (const config of sourceConfigs) {
                // Apply mapping to subject name
                const mappedSubject = mappingDict[config.subject] || config.subject;

                batchStatements.push(env.DB.prepare(
                    "INSERT INTO elective_config (grade, subject, originalTeacher, classCode, fullTeacherName, className, fullSubjectName, isMovingClass, isCombinedClass, dataset, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(
                    config.grade, mappedSubject, config.originalTeacher, config.classCode,
                    config.fullTeacherName, config.className, config.fullSubjectName,
                    config.isMovingClass, config.isCombinedClass, toDataset, new Date().toISOString()
                ));
            }

            if (batchStatements.length > 0) {
                await env.DB.batch(batchStatements);
                totalElectiveConfigsCopied = batchStatements.length;
            }
        }

        // --- 2. Migrate Student Profiles ---
        // Student Profiles doesn't have a dataset column, they represent the "current" reality.
        // We will transform any existing subjects in their JSON strictly based on the mapping.
        if (migrateStudentProfiles) {
            const { results: profiles } = await env.DB.prepare("SELECT * FROM student_profiles").all();

            const batchStatements = [];
            for (const profile of profiles) {
                if (!profile.electives) continue;
                try {
                    const electivesObj = JSON.parse(profile.electives);
                    let changed = false;
                    const newElectives: string[] = [];

                    if (Array.isArray(electivesObj)) {
                        for (const subj of electivesObj) {
                            if (mappingDict[subj]) {
                                newElectives.push(mappingDict[subj]);
                                changed = true;
                            } else {
                                newElectives.push(subj);
                            }
                        }
                    } else if (typeof electivesObj === 'object') {
                        // Handle potential legacy formats if any
                        Object.keys(electivesObj).forEach(key => {
                            // Assuming format { "blockA": "Subject", "blockB": "Subject" } etc
                            if (mappingDict[electivesObj[key]]) {
                                electivesObj[key] = mappingDict[electivesObj[key]];
                                changed = true;
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
            const { results: assessments } = await env.DB.prepare("SELECT id, subject FROM performance_assessments").all();

            const batchStatements = [];
            for (const assessment of assessments) {
                if (mappingDict[assessment.subject]) {
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

        return new Response(JSON.stringify({
            success: true,
            results: {
                totalElectiveConfigsCopied,
                totalStudentProfilesUpdated,
                totalAssessmentsUpdated
            }
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (e: any) {
        console.error("Execute Bridge Error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
