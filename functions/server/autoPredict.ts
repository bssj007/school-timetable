export async function applyAutoPredictions(assessments: any[], db: any): Promise<any[]> {
    if (!assessments || assessments.length === 0) return assessments;

    // We need to fetch timetable & electives for all involved datasets and grades
    const contextMap = new Map(); 
    
    // Group required queries
    for (const a of assessments) {
        if (a.isDone || a.isDeleted || a.classNum === 0) continue;
        let ds = a.dataset || '';
        if (ds !== 'MANUAL_PLAN' && ds !== 'SEMESTER_PLAN') ds = 'COMCIGAN';
        const key = `${ds}_${a.grade}`;
        if (!contextMap.has(key)) {
            contextMap.set(key, { grade: a.grade, dataset: ds, timetable: [], electives: [] });
        }
    }

    // Fetch context data
    for (const ctx of contextMap.values()) {
        try {
            // Electives
            const { results: electives } = await db.prepare("SELECT * FROM elective_config WHERE grade = ?").bind(ctx.grade).all();
            ctx.electives = electives || [];

            // Timetable fetching via Unified API
            const { getTimetable } = await import('../api/comcigan' as any);
            let cachedRawDataString: string | undefined = undefined;
            try {
                const rawDataRow = await db.prepare("SELECT response_json FROM timetable_cache WHERE cache_key = 'raw_data'").first();
                if (rawDataRow && rawDataRow.response_json) {
                    cachedRawDataString = rawDataRow.response_json as string;
                }
            } catch (e) { }

            const dsParam = ctx.dataset === 'COMCIGAN' ? null : ctx.dataset;
            const response = await getTimetable(ctx.grade, 'all', db, dsParam, 'unknown', null, cachedRawDataString, false);
            
            if (response.status === 200) {
                 const json = await response.json() as any;
                 ctx.timetable = json.data || [];
            }
        } catch (e) {
            console.error('[applyAutoPredictions] Context fetch error', e); 
        }
    }

    // Evaluate orphans and collect Promises (since we added DB await)
    return Promise.all(assessments.map(async assessment => {
        if (assessment.isDone || assessment.isDeleted || assessment.classNum === 0) return assessment;

        let ds = assessment.dataset || '';
        if (ds !== 'MANUAL_PLAN' && ds !== 'SEMESTER_PLAN') ds = 'COMCIGAN';
        const ctx = contextMap.get(`${ds}_${assessment.grade}`);
        if (!ctx || !ctx.timetable.length) return assessment;

        const targetDateStr = assessment.tempDueDate || assessment.dueDate;
        const targetTime = assessment.tempClassTime || assessment.classTime;
        const targetDateObj = new Date(targetDateStr);
        const aDay = targetDateObj.getDay();

        const checkSubjectMatch = (slot: any) => {
            if (slot.subject === assessment.subject) return true;
            // Elective alias fallback
            const specificConfig = ctx.electives.find((cfg: any) => cfg.subject === slot.subject && cfg.originalTeacher === slot.teacher);
            if (specificConfig && specificConfig.fullSubjectName === assessment.subject) return true;
            const genericConfig = ctx.electives.find((cfg: any) => (cfg.subject.trim() === assessment.subject.trim() || cfg.fullSubjectName?.trim() === assessment.subject.trim()));
            if (genericConfig && genericConfig.classCode && specificConfig && specificConfig.classCode) {
                const codesA = genericConfig.classCode.split(',').map((s: string) => s.trim());
                const codesB = specificConfig.classCode.split(',').map((s: string) => s.trim());
                if (codesA.some((c: string) => codesB.includes(c))) return true;
            }
            return false;
        };

        let isOrphan = false;
        let currentW = -1;

        if (aDay === 0 || aDay === 6) {
            isOrphan = true; // Weekends
        } else {
            currentW = aDay - 1;
            const slots = ctx.timetable.filter((t: any) => t.class === assessment.classNum && t.weekday === currentW);
            let matchingSlots = slots;
            if (targetTime) matchingSlots = slots.filter((t: any) => t.classTime === targetTime);
            
            let foundMatch = false;
            if (matchingSlots.length > 0) {
                for (const slot of matchingSlots) {
                    if (checkSubjectMatch(slot)) {
                        foundMatch = true;
                        break;
                    }
                }
            }
            if (!foundMatch) isOrphan = true;
        }

        assessment.isOrphan = isOrphan;

        // Auto predict if orphan and NO tempDueDate
        if (isOrphan && !assessment.tempDueDate && currentW !== -1) {
            let nextSlot = null;
            let foundNext = false;

            // 1. Search from the pivot day to Friday
            for (let w = currentW; w < 5 && !foundNext; w++) {
                const daySlots = ctx.timetable.filter((t: any) => t.class === assessment.classNum && t.weekday === w).sort((x: any, y: any) => x.classTime - y.classTime);
                for (const t of daySlots) {
                    if (w === currentW && t.classTime <= targetTime) continue; // Must be strictly AFTER the original time on the same day
                    if (checkSubjectMatch(t)) {
                        foundNext = true;
                        const matchDate = new Date(targetDateObj);
                        matchDate.setDate(targetDateObj.getDate() + (w - currentW));
                        const formattedDate = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, '0')}-${String(matchDate.getDate()).padStart(2, '0')}`;
                        nextSlot = { weekday: w, classTime: t.classTime, date: formattedDate };
                        break;
                    }
                }
            }
            
            // 2. Wrap-around: Search from next Monday to the day before pivot
            for (let w = 0; w <= currentW && !foundNext; w++) {
                const daySlots = ctx.timetable.filter((t: any) => t.class === assessment.classNum && t.weekday === w).sort((x: any, y: any) => x.classTime - y.classTime);
                for (const t of daySlots) {
                    if (checkSubjectMatch(t)) {
                        foundNext = true;
                        const matchDate = new Date(targetDateObj);
                        // Jump to Monday of next week, then add w days
                        const daysToNextMonday = (8 - aDay) % 7 || 7;
                        matchDate.setDate(targetDateObj.getDate() + daysToNextMonday + w);
                        const formattedDate = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, '0')}-${String(matchDate.getDate()).padStart(2, '0')}`;
                        nextSlot = { weekday: w, classTime: t.classTime, date: formattedDate };
                        break;
                    }
                }
            }

            if (foundNext && nextSlot) {
                if (assessment.tempDueDate !== nextSlot.date || assessment.tempClassTime !== nextSlot.classTime || !assessment.isAutoPredicted) {
                    assessment.tempDueDate = nextSlot.date;
                    assessment.tempClassTime = nextSlot.classTime;
                    assessment.isAutoPredicted = 1;
                    
                    // Persist to DB
                    try {
                        const q = "UPDATE performance_assessments SET tempDueDate = ?, tempClassTime = ?, isAutoPredicted = 1 WHERE id = ?";
                        await db.prepare(q).bind(nextSlot.date, nextSlot.classTime, assessment.id).run();
                    } catch (e: any) {
                        if (e.message && e.message.includes("no such column") && e.message.includes("isAutoPredicted")) {
                            console.log("[autoPredict] Adding isAutoPredicted column to DB");
                            try {
                                await db.prepare("ALTER TABLE performance_assessments ADD COLUMN isAutoPredicted INTEGER DEFAULT 0").run();
                                await db.prepare("UPDATE performance_assessments SET tempDueDate = ?, tempClassTime = ?, isAutoPredicted = 1 WHERE id = ?")
                                        .bind(nextSlot.date, nextSlot.classTime, assessment.id).run();
                            } catch (alterErr) {
                                console.error("[autoPredict] Failed to add column:", alterErr);
                            }
                        } else {
                            console.error("[autoPredict] Failed to update DB:", e);
                        }
                    }
                }
            }
        } else if (!isOrphan && assessment.isAutoPredicted) {
            assessment.tempDueDate = null;
            assessment.tempClassTime = null;
            assessment.isAutoPredicted = 0;
            // Rollback in DB
            try {
                const q = "UPDATE performance_assessments SET tempDueDate = NULL, tempClassTime = NULL, isAutoPredicted = 0 WHERE id = ?";
                await db.prepare(q).bind(assessment.id).run();
            } catch (e: any) {
                console.error("[autoPredict] Failed to rollback in DB:", e);
            }
        }

        return assessment;
    }));
}
