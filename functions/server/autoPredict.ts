export async function applyAutoPredictions(assessments: any[], db: any): Promise<any[]> {
    if (!assessments || assessments.length === 0) return assessments;

    // We need to fetch timetable & electives for all involved datasets and grades
    const contextMap = new Map(); 
    
    // Group required queries by Grade, Dataset, and the Target Week
    for (const a of assessments) {
        if (a.isDone || a.isDeleted) continue;
        let ds = a.dataset || '';
        if (ds !== 'MANUAL_PLAN' && ds !== 'SEMESTER_PLAN') ds = 'COMCIGAN';
        
        // Find Monday of the assessment due date to act as the week identifier
        const dObj = new Date(a.dueDate);
        const day = dObj.getDay();
        const diff = dObj.getDate() - day + (day === 0 ? -6 : 1); // Adjust when Sunday
        const monday = new Date(dObj.setDate(diff));
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
        
        const key = `${ds}_${a.grade}_${weekKey}`;
        if (!contextMap.has(key)) {
            contextMap.set(key, { grade: a.grade, dataset: ds, targetDate: weekKey, timetable: [], electives: [] });
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
            // Pass ctx.targetDate so the engine resolves the correct timetable structure for that specific week
            const response = await getTimetable(ctx.grade, 'all', db, dsParam, 'unknown', ctx.targetDate, cachedRawDataString, false);
            
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
        if (assessment.isDone || assessment.isDeleted) return assessment;

        let ds = assessment.dataset || '';
        if (ds !== 'MANUAL_PLAN' && ds !== 'SEMESTER_PLAN') ds = 'COMCIGAN';
        
        const dObj = new Date(assessment.dueDate);
        const day = dObj.getDay();
        const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(dObj.setDate(diff));
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
        
        const ctx = contextMap.get(`${ds}_${assessment.grade}_${weekKey}`);
        if (!ctx || !ctx.timetable.length) return assessment;

        // Evaluate orphan status strictly against the MANUAL target.
        // If the shift was auto-predicted, we must ignore it and re-evaluate the original manually-set date
        // to see if it is still an orphan under the latest timetable data.
        const targetDateStr = (assessment.tempDueDate && !assessment.isAutoPredicted) ? assessment.tempDueDate : assessment.dueDate;
        const targetTime = (assessment.tempClassTime && !assessment.isAutoPredicted) ? assessment.tempClassTime : assessment.classTime;
        const targetDateObj = new Date(targetDateStr);
        const aDay = targetDateObj.getDay();

        const baseAssSubject = assessment.subject.replace(/\s*\(.*$/, '').trim();

        const checkSubjectMatch = (slot: any) => {
            if (assessment.teacher && assessment.classCode) {
                // If we recorded exact classCode and teacher, verify them against the current slot's elective configuration
                const specificConfig = ctx.electives.find((cfg: any) => cfg.subject === slot.subject && cfg.originalTeacher === slot.teacher);
                if (specificConfig && specificConfig.classCode) {
                    const codes = specificConfig.classCode.split(',').map((s: string) => s.trim());
                    if (codes.includes(assessment.classCode) && (assessment.teacher === slot.teacher || specificConfig.fullTeacherName?.includes(assessment.teacher))) {
                        return true;
                    }
                }
            } else if (assessment.teacher && !assessment.classCode) {
                // For non-electives, if we have an explicit teacher, it should match the slot teacher
                if (slot.subject === baseAssSubject && slot.teacher === assessment.teacher) return true;
            }

            if (slot.subject === baseAssSubject) return true;
            
            // Elective alias fallback
            const specificConfig = ctx.electives.find((cfg: any) => cfg.subject === slot.subject && cfg.originalTeacher === slot.teacher);
            if (specificConfig && specificConfig.fullSubjectName === baseAssSubject) return true;
            const genericConfig = ctx.electives.find((cfg: any) => (cfg.subject.trim() === baseAssSubject || cfg.fullSubjectName?.trim() === baseAssSubject));
            if (genericConfig && genericConfig.classCode && specificConfig && specificConfig.classCode) {
                const codesA = genericConfig.classCode.split(',').map((s: string) => s.trim());
                const codesB = specificConfig.classCode.split(',').map((s: string) => s.trim());
                if (codesA.some((c: string) => codesB.includes(c))) return true;
            }
            return false;
        };

        // 공강/빈교실 판별 함수 (연기 탐색 대상에서 제외)
        const FREE_KEYWORDS = ["빈교실", "공강", "Empty", "Free", "창체", "자습", "동아리", "점심시간"];
        const isFreePeriod = (subject: string) => FREE_KEYWORDS.some(k => (subject || '').includes(k));

        // 이동수업(classNum=0): 학년 전체 시간표에서 과목 탐색, 일반 수업: 해당 반만
        const getSlots = (w: number) => assessment.classNum !== 0
            ? ctx.timetable.filter((t: any) => t.class === assessment.classNum && t.weekday === w)
            : ctx.timetable.filter((t: any) => t.weekday === w);

        let isOrphan = false;
        let currentW = -1;

        if (aDay === 0 || aDay === 6) {
            isOrphan = true; // Weekends
        } else {
            currentW = aDay - 1;
            const slots = getSlots(currentW);
            let matchingSlots = slots;
            if (targetTime) matchingSlots = slots.filter((t: any) => t.classTime === targetTime);
            
            let foundMatch = false;
            if (matchingSlots.length > 0) {
                for (const slot of matchingSlots) {
                    if (isFreePeriod(slot.subject || '')) continue; // 공강은 매칭 제외
                    if (checkSubjectMatch(slot)) {
                        foundMatch = true;
                        break;
                    }
                }
            }
            if (!foundMatch) isOrphan = true;
        }

        assessment.isOrphan = isOrphan;

        // Auto predict if orphan and NO manual tempDueDate
        // If it was already auto-predicted, we still run the search to ensure it hasn't shifted further
        if (isOrphan && (!assessment.tempDueDate || assessment.isAutoPredicted) && currentW !== -1) {
            let nextSlot = null;
            let foundNext = false;

            // 1. Search from the pivot day to Friday
            for (let w = currentW; w < 5 && !foundNext; w++) {
                const daySlots = getSlots(w).sort((x: any, y: any) => x.classTime - y.classTime);
                for (const t of daySlots) {
                    if (isFreePeriod(t.subject || '')) continue; // 공강 슬롯 제외
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
                const daySlots = getSlots(w).sort((x: any, y: any) => x.classTime - y.classTime);
                for (const t of daySlots) {
                    if (isFreePeriod(t.subject || '')) continue; // 공강 슬롯 제외
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
