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

        // wrap-around 탐색은 다음 주 시간표를 사용해야 함 → 다음 주 컨텍스트도 예약
        const nextMonday = new Date(monday);
        nextMonday.setDate(monday.getDate() + 7);
        const nextWeekKey = `${nextMonday.getFullYear()}-${String(nextMonday.getMonth() + 1).padStart(2, '0')}-${String(nextMonday.getDate()).padStart(2, '0')}`;
        const nextKey = `NEXT_${ds}_${a.grade}_${weekKey}`; // 이 주의 '다음 주' 컨텍스트
        if (!contextMap.has(nextKey)) {
            contextMap.set(nextKey, { grade: a.grade, dataset: ds, targetDate: nextWeekKey, timetable: [], electives: [] });
        }

    }

    // 1. One-time Global Data Loading
    const { getTimetable } = await import('../api/comcigan' as any);
    
    let cachedRawDataString: string | undefined = undefined;
    try {
        const rawDataRow = await db.prepare("SELECT response_json FROM timetable_cache WHERE cache_key = 'raw_data'").first();
        if (rawDataRow && rawDataRow.response_json) {
            cachedRawDataString = rawDataRow.response_json as string;
        }
    } catch (e) { }

    // 2. Pre-fetch common elective configs
    // We only need electives for the grades that are present in the contextMap
    const neededGrades = Array.from(new Set(Array.from(contextMap.values()).map((ctx: any) => ctx.grade)));
    const electivesByGrade: Record<number, any[]> = {};
    
    await Promise.all(neededGrades.map(async (grade) => {
        try {
            const { results: electives } = await db.prepare("SELECT * FROM elective_config WHERE grade = ?").bind(grade).all();
            electivesByGrade[grade as number] = electives || [];
        } catch (e) {
            electivesByGrade[grade as number] = [];
            console.error(`[applyAutoPredictions] Elective fetch error for grade ${grade}`, e);
        }
    }));

    // 3. Parallel Context Data Fetching (getTimetable is now very fast thanks to cachedRawDataString)
    await Promise.all(Array.from(contextMap.values()).map(async (ctx: any) => {
        try {
            // Assign pre-fetched electives
            ctx.electives = electivesByGrade[ctx.grade] || [];

            const dsParam = ctx.dataset === 'COMCIGAN' ? null : ctx.dataset;
            // Pass ctx.targetDate so the engine resolves the correct timetable structure for that specific week
            const response = await getTimetable(ctx.grade, 'all', db, dsParam, 'unknown', ctx.targetDate, cachedRawDataString, false);
            
            if (response.status === 200) {
                 const json = await response.json() as any;
                 ctx.timetable = json.data || [];
            }
        } catch (e) {
            console.error(`[applyAutoPredictions] Context fetch error for ${ctx.targetDate}`, e); 
        }
    }));

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

        // wrap-around 탐색용 다음 주 시간표 (없으면 현재 주로 폴백)
        const nextCtx = contextMap.get(`NEXT_${ds}_${assessment.grade}_${weekKey}`) || ctx;

        // Evaluate orphan status strictly against the MANUAL target.
        // If the shift was auto-predicted, we must ignore it and re-evaluate the original manually-set date
        // to see if it is still an orphan under the latest timetable data.
        const targetDateStr = (assessment.tempDueDate && !assessment.isAutoPredicted) ? assessment.tempDueDate : assessment.dueDate;
        const targetTime = (assessment.tempClassTime && !assessment.isAutoPredicted) ? assessment.tempClassTime : assessment.classTime;
        const targetDateObj = new Date(targetDateStr);
        const aDay = targetDateObj.getDay();

        const baseAssSubject = assessment.subject.replace(/\s*\(.*$/, '').trim();


        // 이동수업(classNum=0): teacher로 1차 필터 후 과목 탐색 → 일반 수업: 해당 반만
        const originalW = new Date(assessment.dueDate).getDay() - 1;
        const originalTime = assessment.classTime;

        // 역추적: 원본 요일/교시에서 이 과목을 듣던 반(Class) 목록 (이동수업 그룹 매칭용)
        const originalClassesWithSubject = new Set<number>();
        if (assessment.classNum === 0 && originalW >= 0 && originalW <= 4 && originalTime) {
            const extractClasses = (timetable: any[]) => {
                const slots = timetable.filter((t: any) => t.weekday === originalW && t.classTime === originalTime);
                let found = false;
                for (const t of slots) {
                    if ((t.subject || '').replace(/\s*\(.*$/, '').trim() === baseAssSubject) {
                        originalClassesWithSubject.add(t.class);
                        found = true;
                    }
                }
                return found;
            };

            const foundInCtx = extractClasses(ctx.timetable);
            // 만약 이번 주(원본) 시간표가 고아/행사 등으로 덮어씌워져 해당 과목을 찾지 못했다면 다음 주 시간표를 참조
            if (!foundInCtx && nextCtx && nextCtx.timetable) {
                extractClasses(nextCtx.timetable);
            }
        }

        // tbl 파라미터로 현재 주 또는 다음 주 시간표를 선택할 수 있음
        const buildGetSlots = (tbl: any[]) => (w: number) => {
            if (assessment.classNum !== 0) {
                return tbl.filter((t: any) => {
                    if (t.weekday !== w) return false;
                    // 1. 본인 반이거나 반 정보가 없는 공통 슬롯
                    if (!t.class || t.class.toString() === assessment.classNum.toString()) return true;
                    
                    // 2. 다른 반 데이터라도 이동수업 특성상 동일 과목이 나오면 해당 블록으로 간주하여 포함시킴 (대시보드 갭필링 대체)
                    const tSubj = (t.subject || '').replace(/\s*\(.*$/, '').trim();
                    if (tSubj === baseAssSubject) return true;
                    
                    // 3. 선택과목 별칭 교차 확인
                    const specificConfig = ctx.electives.find((cfg: any) => cfg.subject === t.subject && cfg.originalTeacher === t.teacher);
                    if (specificConfig && specificConfig.fullSubjectName === baseAssSubject) return true;
                    
                    return false;
                });
            }
            // 이동수업: teacher로 엄격 필터
            // assessment.teacher + elective_config fullTeacherName/originalTeacher 모두 비교
            if (assessment.teacher) {
                // targetTeachers를 쉼표 등으로 분리하여 다중 선생님 대응
                const targetTeachers = assessment.teacher.split(/[,、]+/).map((t: string) => t.replace(/\*.*$/, '').trim());

                // elective_config에서 이 과목의 모든 선생님 이름 수집
                const electiveConfigs = ctx.electives.filter((c: any) =>
                    c.subject === baseAssSubject || c.fullSubjectName === baseAssSubject
                );
                const knownTeacherNames = new Set<string>(targetTeachers);
                for (const ec of electiveConfigs) {
                    if (ec.fullTeacherName) {
                        // "박상민, 정효진" 같이 복수 선생님인 경우 분리
                        for (const n of String(ec.fullTeacherName).split(/[,、]+/)) {
                            const nm = n.replace(/\*.*$/, '').trim();
                            if (nm) knownTeacherNames.add(nm);
                        }
                    }
                    if (ec.originalTeacher) {
                        const nm = String(ec.originalTeacher).replace(/\*.*$/, '').trim();
                        if (nm) knownTeacherNames.add(nm);
                    }
                }

                return tbl.filter((t: any) => {
                    if (t.weekday !== w) return false;
                    const slotTeacher = (t.teacher || '').replace(/\*.*$/, '').trim();
                    const teacherMatch = [...knownTeacherNames].some(name =>
                        slotTeacher === name || slotTeacher.startsWith(name) || name.startsWith(slotTeacher)
                    );
                    if (!teacherMatch) return false;
                    
                    // 이동수업 블록(그룹) 일치 여부 검증
                    if (originalClassesWithSubject.size > 0 && !originalClassesWithSubject.has(t.class)) {
                        return false;
                    }
                    return true;
                });
            }
            // teacher 정보 없음: 과목명으로만 탐색 (공강 제외)
            return tbl.filter((t: any) => {
                if (t.weekday !== w) return false;
                if ((t.subject || '').replace(/\s*\(.*$/, '').trim() !== baseAssSubject) return false;
                
                // 이동수업 블록(그룹) 일치 여부 검증
                // 원본 교시가 존재하고 이 과목을 듣던 반 목록이 확보된 경우,
                // 후보 슬롯의 반(class)이 원래 그룹에 포함되어 있지 않다면 다른 그룹의 수업으로 간주하여 무시함.
                if (originalClassesWithSubject.size > 0 && !originalClassesWithSubject.has(t.class)) {
                    return false;
                }
                return true;
            });
        };
        const checkSubjectMatch = (slot: any, tbl: any[]) => {
            // 메인 대시보드와 동일한 취소선(공강) 처리된 이동수업 슬롯 제외 로직 복구
            if (assessment.classNum === 0) {
                const blockSlots = tbl.filter((t: any) => t.weekday === slot.weekday && t.classTime === slot.classTime);
                const FREE_KEYWORDS = ["빈교실", "공강", "Empty", "Free"];
                const hasFreePeriodSlot = blockSlots.some((t: any) => FREE_KEYWORDS.some(k => (t.subject || '').trim().includes(k)));
                
                if (hasFreePeriodSlot) {
                    const exactMatch = blockSlots.find((t: any) => (t.subject || '').trim() === baseAssSubject);
                    if (!exactMatch) {
                        return false; // 정확한 문자열 일치 과목이 없으면 대시보드에서 취소선(공강) 처리되므로 매칭에서 제외
                    }
                }
            }

            // 1. 과목명 매칭 확인
            let isSubjectMatch = false;
            const specificConfig = ctx.electives.find((cfg: any) => cfg.subject === slot.subject && cfg.originalTeacher === slot.teacher);
            
            if (slot.subject === baseAssSubject) {
                isSubjectMatch = true;
            } else if (specificConfig && specificConfig.fullSubjectName === baseAssSubject) {
                isSubjectMatch = true;
            } else {
                const genericConfig = ctx.electives.find((cfg: any) => (cfg.subject.trim() === baseAssSubject || cfg.fullSubjectName?.trim() === baseAssSubject));
                if (genericConfig && genericConfig.classCode && specificConfig && specificConfig.classCode) {
                    const codesA = genericConfig.classCode.split(',').map((s: string) => s.replace(/그룹/g, '').trim()).filter(Boolean);
                    const codesB = specificConfig.classCode.split(',').map((s: string) => s.replace(/그룹/g, '').trim()).filter(Boolean);
                    if (codesA.length > 0 && codesA.some((c: string) => codesB.includes(c))) {
                        isSubjectMatch = true;
                    }
                }
            }

            if (!isSubjectMatch) return false;

            // 2. 선생님 매칭 확인 (평가에 선생님이 지정된 경우)
            if (assessment.teacher) {
                let isTeacherMatch = false;
                const targetTeachers = assessment.teacher.split(/[,、]+/).map((t: string) => t.replace(/\*.*$/, '').trim());
                
                // 설정에 fullName이 있으면 우선적으로 비교 ("originalName외 fullName이 있을시 fullName로 비교")
                if (specificConfig && specificConfig.fullTeacherName) {
                    const fullNames = specificConfig.fullTeacherName.split(/[,、]+/).map((n: string) => n.replace(/\*.*$/, '').trim());
                    for (const targetTeacher of targetTeachers) {
                        if (fullNames.some((name: string) => targetTeacher === name || targetTeacher.startsWith(name) || name.startsWith(targetTeacher))) {
                            isTeacherMatch = true;
                            break;
                        }
                    }
                }
                
                // fullName과 매칭되지 않았거나 없는 경우 originalName(slot.teacher)으로 비교
                if (!isTeacherMatch && slot.teacher) {
                    const originalName = slot.teacher.replace(/\*.*$/, '').trim();
                    for (const targetTeacher of targetTeachers) {
                        if (targetTeacher === originalName || targetTeacher.startsWith(originalName) || originalName.startsWith(targetTeacher)) {
                            isTeacherMatch = true;
                            break;
                        }
                    }
                }
                
                if (!isTeacherMatch) return false;

                // 3. classCode 교차 검증 (classCode가 지정된 평가인 경우)
                if (assessment.classCode && specificConfig && specificConfig.classCode) {
                    const assessCodes = assessment.classCode.split(',').map((s: string) => s.replace(/그룹/g, '').trim());
                    const slotCodes = specificConfig.classCode.split(',').map((s: string) => s.replace(/그룹/g, '').trim());
                    if (!assessCodes.some((c: string) => slotCodes.includes(c))) {
                        return false;
                    }
                }
            }

            return true;
        };


        // 고아 판별: 현재 주 시간표, wrap-around 탐색: 다음 주 시간표
        const getSlots = buildGetSlots(ctx.timetable);
        const getNextSlots = buildGetSlots(nextCtx.timetable);

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
                    if (checkSubjectMatch(slot, ctx.timetable)) {
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
                    if (w === currentW && t.classTime <= targetTime) continue; // Must be strictly AFTER the original time on the same day
                    if (checkSubjectMatch(t, ctx.timetable)) {
                        foundNext = true;
                        const matchDate = new Date(targetDateObj);
                        matchDate.setDate(targetDateObj.getDate() + (w - currentW));
                        const formattedDate = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, '0')}-${String(matchDate.getDate()).padStart(2, '0')}`;
                        nextSlot = { weekday: w, classTime: t.classTime, date: formattedDate };
                        break;
                    }
                }
            }
            
            // 2. Wrap-around: 다음 주 실제 시간표(getNextSlots)로 검증 후 배정
            for (let w = 0; w <= currentW && !foundNext; w++) {
                const daySlots = getNextSlots(w).sort((x: any, y: any) => x.classTime - y.classTime);
                for (const t of daySlots) {
                    if (checkSubjectMatch(t, nextCtx.timetable)) {
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
        }

        return assessment;
    }));
}
