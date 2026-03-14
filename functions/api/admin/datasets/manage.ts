import { adminPassword as envAdminPassword } from "../../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;
    const adminPassword = request.headers.get('X-Admin-Password');

    if (adminPassword !== envAdminPassword) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (request.method === 'GET') {
        const url = new URL(request.url);
        const dataset = url.searchParams.get('dataset');

        if (dataset === null) {
            // Fetch all unique datasets
            try {
                // Get datasets from elective_subjects, student_profiles, and performance_assessments
                // Also overrides from system_settings JSON keys
                
                // 1. Elective Config (Elective Subjects)
                let esDatasets: string[] = [];
                try {
                    const esQuery = await env.DB.prepare("SELECT DISTINCT dataset FROM elective_config WHERE dataset IS NOT NULL").all();
                    esDatasets = (esQuery.results || []).map((r: any) => r.dataset);
                } catch (e) {}

                // 2. Student Profiles
                let spDatasets: string[] = [];
                try {
                    const spQuery = await env.DB.prepare("SELECT DISTINCT dataset FROM student_profiles WHERE dataset IS NOT NULL").all();
                    spDatasets = (spQuery.results || []).map((r: any) => r.dataset);
                } catch (e) {}

                // 3. Performance Assessments
                // In D1, the column might not exist if migration failed, wrap in try-catch
                let paDatasets: string[] = [];
                try {
                    const paQuery = await env.DB.prepare("SELECT DISTINCT dataset FROM performance_assessments WHERE dataset IS NOT NULL").all();
                    paDatasets = (paQuery.results || []).map((r: any) => r.dataset);
                } catch (e) {
                    // Column doesn't exist yet, disregard
                }

                // 4. Overrides
                let ovDatasets: string[] = [];
                try {
                    const ovQuery = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'elective_group_overrides'").first();
                    if (ovQuery && ovQuery.value) {
                        const parsed = JSON.parse(ovQuery.value as string);
                        ovDatasets = Object.keys(parsed).filter(k => k !== '2' && k !== '3'); // Filter out old global format keys if any
                        // If it's the new format, keys like '_auto_', 'MANUAL_PLAN' etc will be here.
                        // If it's old format, keys are '2', '3'. So if they are in the root, it means the old format is mixed.
                        if (parsed['2'] || parsed['3']) {
                            // ovDatasets.push('_auto_'); // Kept out as user requested to hide _auto_
                        }
                    }
                } catch (e) {}

                const allDatasets = Array.from(new Set([...esDatasets, ...spDatasets, ...paDatasets, ...ovDatasets, ""])).filter(d => d !== '_auto_');
                
                return new Response(JSON.stringify({ datasets: allDatasets }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error: any) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        } else {
            // Fetch counts for a specific dataset
            try {
                let electiveConfigs: Record<string, number> = { '2': 0, '3': 0 };
                let studentProfiles: Record<string, number> = { '2': 0, '3': 0 };
                let groupOverrides: Record<string, number> = { '2': 0, '3': 0 };
                let assessments: Record<string, number> = { '1': 0, '2': 0, '3': 0 };

                // 1. Elective Config Count
                try {
                    const esQuery = await env.DB.prepare("SELECT grade, COUNT(*) as count FROM elective_config WHERE dataset = ? GROUP BY grade").bind(dataset).all();
                    (esQuery.results || []).forEach((r: any) => {
                        if (r.grade) electiveConfigs[r.grade.toString()] = r.count;
                    });
                } catch (e) {}

                // 2. Student Profiles Count
                try {
                    const spQuery = await env.DB.prepare("SELECT grade, COUNT(*) as count FROM student_profiles WHERE dataset = ? GROUP BY grade").bind(dataset).all();
                    (spQuery.results || []).forEach((r: any) => {
                        if (r.grade) studentProfiles[r.grade.toString()] = r.count;
                    });
                } catch (e) {}

                // 3. Performance Assessments Count
                try {
                    const paQuery = await env.DB.prepare("SELECT grade, COUNT(*) as count FROM performance_assessments WHERE dataset = ? GROUP BY grade").bind(dataset).all();
                    (paQuery.results || []).forEach((r: any) => {
                        if (r.grade) assessments[r.grade.toString()] = r.count;
                    });
                } catch (e) {} // Column might not exist yet

                // 4. Group Overrides Count
                try {
                    const ovQuery = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'elective_group_overrides'").first();
                    if (ovQuery && ovQuery.value) {
                        const parsed = JSON.parse(ovQuery.value as string);
                        
                        // Handle legacy global format vs new dataset-aware format
                        const targetDatasetKey = (dataset === '' || dataset === '_auto_') ? '_auto_' : dataset;
                        let targetOverrides = parsed[targetDatasetKey];

                        // If asking for _auto_ but targetOverrides is undefined, try legacy root keys
                        if (!targetOverrides && targetDatasetKey === '_auto_') {
                             if (parsed['2'] || parsed['3']) {
                                targetOverrides = parsed; // Legacy is at root
                             }
                        }

                        if (targetOverrides) {
                            // count number of overridden cells per grade
                            if (targetOverrides['2']) groupOverrides['2'] = Object.keys(targetOverrides['2']).length;
                            if (targetOverrides['3']) groupOverrides['3'] = Object.keys(targetOverrides['3']).length;
                        }
                    }
                } catch (e) {}

                return new Response(JSON.stringify({ counts: { electiveConfigs, studentProfiles, groupOverrides, assessments } }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error: any) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
    } else if (request.method === 'DELETE') {
        try {
            const body = await request.json();
            const { dataset, categories } = body;

            if (dataset === undefined || typeof categories !== 'object') {
                return new Response(JSON.stringify({ error: 'Invalid payload' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const results: any = {};

            // Helper to build IN clause
            const buildInClause = (grades: number[]) => `IN (${grades.join(',')})`;

            // Delete Elective Subjects
            if (categories.electiveConfigs && categories.electiveConfigs.length > 0) {
                const grades = categories.electiveConfigs;
                const res = await env.DB.prepare(`DELETE FROM elective_config WHERE dataset = ? AND grade ${buildInClause(grades)}`).bind(dataset).run();
                results.electiveConfigs = res.success;
            }

            // Delete Student Profiles
            if (categories.studentProfiles && categories.studentProfiles.length > 0) {
                const grades = categories.studentProfiles;
                const res = await env.DB.prepare(`DELETE FROM student_profiles WHERE dataset = ? AND grade ${buildInClause(grades)}`).bind(dataset).run();
                results.studentProfiles = res.success;
            }

            // Delete Performance Assessments
            if (categories.assessments && categories.assessments.length > 0) {
                const grades = categories.assessments;
                try {
                    const res = await env.DB.prepare(`DELETE FROM performance_assessments WHERE dataset = ? AND grade ${buildInClause(grades)}`).bind(dataset).run();
                    results.assessments = res.success;
                } catch (e) {
                    results.assessments = false;
                }
            }

            // Delete Group Overrides
            if (categories.groupOverrides && categories.groupOverrides.length > 0) {
                 const grades = categories.groupOverrides;
                 const ovQuery = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'elective_group_overrides'").first();
                if (ovQuery && ovQuery.value) {
                    const parsed = JSON.parse(ovQuery.value as string);
                    const targetDatasetKey = (dataset === '' || dataset === '_auto_') ? '_auto_' : dataset;

                    if (!parsed[targetDatasetKey] && targetDatasetKey === '_auto_' && (parsed['2'] || parsed['3'])) {
                          // Clear legacy overrides
                          grades.forEach((g: number) => { parsed[g.toString()] = {}; });
                     } else {
                         if (parsed[targetDatasetKey]) {
                             grades.forEach((g: number) => { parsed[targetDatasetKey][g.toString()] = {}; });
                         }
                     }

                     const saveRes = await env.DB.prepare("UPDATE system_settings SET value = ? WHERE key = 'elective_group_overrides'")
                        .bind(JSON.stringify(parsed)).run();
                     results.groupOverrides = saveRes.success;
                } else {
                     results.groupOverrides = true; // Nothing to delete
                }
            }

            return new Response(JSON.stringify({ success: true, results }), {
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (error: any) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } else {
        return new Response('Method Not Allowed', { status: 405 });
    }
};
