// client/src/lib/teacherSearch.ts
import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizeTeacherName } from "./teacherUtils";

export interface TeacherOption {
    idx: number;
    rawName: string;
    displayName: string;
    subjects: string[];
    label: string; // 동명이인일 경우 과목 병기: "김영희 (국어)"
}

export interface TeacherTimetableData {
    success: boolean;
    teachers: string[];
    subjects: string[];
    timetable?: any[];
    baseTimetable?: any[];
}

/**
 * 교사 시간표, 과목 매핑, 선택과목 설정 데이터를 바탕으로
 * 동명이인(namesake)을 구분하고 과목이 병기된 교사 옵션 목록을 생성하는 순수 함수
 */
export function buildTeacherOptions(
    timetableData?: TeacherTimetableData | null,
    settings?: any,
    electiveConfigsG2?: any[] | null,
    electiveConfigsG3?: any[] | null
): TeacherOption[] {
    if (!timetableData?.teachers || timetableData.teachers.length <= 1) {
        return [];
    }

    // 1. 무시할 키워드 (기본값: 빈교, 공강, 학년, 채, 창)
    const rawVal = settings?.teacher_ignore_keywords;
    const ignoreKeywords: string[] = rawVal === undefined 
        ? ['빈교', '공강', '학년', '채', '창'] 
        : (rawVal ? rawVal.split(',').map((k: string) => k.trim()).filter(Boolean) : []);

    // 2. 선택과목 설정에서 원본교사명 → 풀네임 매핑 생성
    const teacherMap = new Map<string, string>();
    const allConfigs = [...(electiveConfigsG2 || []), ...(electiveConfigsG3 || [])];
    allConfigs.forEach((c: any) => {
        if (c.originalTeacher && c.fullTeacherName) {
            const rawNames = c.originalTeacher.split(',').map((t: string) => t.trim()).filter(Boolean);
            const fullNames = c.fullTeacherName.split(',').map((t: string) => t.trim()).filter(Boolean);
            rawNames.forEach((raw: string, idx: number) => {
                const full = fullNames[idx] || fullNames[0];
                if (raw && full) {
                    teacherMap.set(raw, full);
                }
            });
        }
    });

    // 3. 교사별 담당 과목 추출 (시간표 데이터 기준)
    const teacherSubjectsMap = new Map<number, string[]>();
    const schedules = timetableData.baseTimetable || timetableData.timetable;
    if (schedules && timetableData.subjects) {
        schedules.forEach((schedule: any, tId: number) => {
            if (!schedule) return;
            const subjects = new Set<string>();
            for (let d = 1; d <= 5; d++) {
                const daySchedule = schedule[d];
                if (!daySchedule) continue;
                for (let p = 1; p < daySchedule.length; p++) {
                    const val = daySchedule[p];
                    if (!val) continue;
                    const numVal = typeof val === 'number' ? val : parseInt(String(val).replace(/>/g, ''), 10);
                    if (!numVal || isNaN(numVal) || numVal === 0) continue;

                    const subjectId = Math.floor(numVal / 1000);
                    const subjectName = timetableData.subjects[subjectId];
                    if (subjectName) {
                        subjects.add(subjectName);
                    }
                }
            }
            teacherSubjectsMap.set(tId, Array.from(subjects));
        });
    }

    // 4. 표시 이름 결정 함수
    const getDisplayName = (rawName: string, idx: number): string => {
        const subjects = teacherSubjectsMap.get(idx) || [];

        // 4-1. 담당 과목까지 일치하는 선택과목 설정 우선 매칭
        for (const c of allConfigs) {
            if (c.originalTeacher && c.fullTeacherName && c.subject) {
                const rawNames = c.originalTeacher.split(',').map((t: string) => t.trim()).filter(Boolean);
                const indexInConfig = rawNames.indexOf(rawName);
                if (indexInConfig !== -1) {
                    const configSubject = c.subject.trim();
                    const hasSubjectMatch = subjects.some(s => s.trim() === configSubject || s.includes(configSubject) || configSubject.includes(s));
                    if (hasSubjectMatch) {
                        const fullNames = c.fullTeacherName.split(',').map((t: string) => t.trim()).filter(Boolean);
                        const full = fullNames[indexInConfig] || fullNames[0];
                        if (full) return full;
                    }
                }
            }
        }

        // 4-2. 단순 원본 이름 매칭 폴백
        for (const c of allConfigs) {
            if (c.originalTeacher && c.fullTeacherName) {
                const rawNames = c.originalTeacher.split(',').map((t: string) => t.trim()).filter(Boolean);
                const indexInConfig = rawNames.indexOf(rawName);
                if (indexInConfig !== -1) {
                    const fullNames = c.fullTeacherName.split(',').map((t: string) => t.trim()).filter(Boolean);
                    const full = fullNames[indexInConfig] || fullNames[0];
                    if (full) return full;
                }
            }
        }

        return teacherMap.get(rawName) || rawName;
    };

    // 5. 기본 옵션 목록 빌드
    const rawOptions: { idx: number; rawName: string; displayName: string; subjects: string[] }[] = [];
    timetableData.teachers.forEach((name, idx) => {
        if (idx === 0) return; // 0번 인덱스 '*' 제외
        const shouldIgnore = ignoreKeywords.some((kw: string) => name.includes(kw));
        if (shouldIgnore) return;

        const displayName = getDisplayName(name, idx);
        const subjects = teacherSubjectsMap.get(idx) || [];

        rawOptions.push({
            idx,
            rawName: name,
            displayName,
            subjects
        });
    });

    // 6. 동명이인(동일한 displayName을 가진 교사) 감지 및 과목 병기 라벨 생성
    const displayNameCounts = new Map<string, number>();
    rawOptions.forEach(opt => {
        displayNameCounts.set(opt.displayName, (displayNameCounts.get(opt.displayName) || 0) + 1);
    });

    return rawOptions.map(opt => {
        const count = displayNameCounts.get(opt.displayName) || 0;
        let label = opt.displayName;
        // 동명이인이거나 rawName에 구분자(*)가 있는 경우 과목 정보 병기
        if ((count > 1 || opt.rawName.includes('*')) && opt.subjects.length > 0) {
            label = `${opt.displayName} (${opt.subjects.join(', ')})`;
        } else if (count > 1) {
            label = `${opt.displayName} (선생님 #${opt.idx})`;
        }

        return {
            ...opt,
            label
        };
    });
}

/**
 * 선생님 페이지와 100% 동일한 교사 검색 필터링 알고리즘
 * 이름, 표시이름, 라벨, 담당과목 모두에 대해 대소문자 무시 부분 일치 검색
 */
export function filterTeacherOptions(
    options: TeacherOption[],
    searchQuery: string,
    isDevAccountEnabled: boolean = false
): TeacherOption[] {
    const q = searchQuery.trim();
    if (!q) {
        return options.filter(opt => opt.rawName !== "김교사");
    }

    const qLower = q.toLowerCase();
    const normalMatches = options.filter(opt => {
        if (opt.rawName === "김교사") return false;
        const matchName = 
            opt.displayName.toLowerCase().includes(qLower) || 
            opt.rawName.toLowerCase().includes(qLower) || 
            opt.label.toLowerCase().includes(qLower);
        const matchSubject = opt.subjects.some(s => s.toLowerCase().includes(qLower));
        return matchName || matchSubject;
    });

    // 개발자 가상 계정 지원
    if (isDevAccountEnabled && (q === "김교사" || q === "김교사 선생님")) {
        const devOpt: TeacherOption = {
            idx: 9999,
            rawName: "김교사",
            displayName: "김교사",
            subjects: [],
            label: "김교사 선생님"
        };
        return [devOpt, ...normalMatches];
    }

    return normalMatches;
}

/**
 * React Query를 이용해 선생님 시간표 및 교사 옵션 목록을 불러오는 공통 훅
 * (TeacherPage와 NotificationManager에서 동일 캐시 및 동일 알고리즘 공유)
 */
export function useTeacherOptions() {
    // 1. 교사 시간표 데이터
    const timetableQuery = useQuery<TeacherTimetableData>({
        queryKey: ['teacher-timetable-shared'],
        queryFn: async () => {
            const res = await fetch('/api/comcigan?type=teacher_timetable');
            if (!res.ok) throw new Error("선생님 시간표 조회 실패");
            return res.json();
        },
        staleTime: 60 * 1000
    });

    // 2. 사이트 공개 설정 (무시 키워드, 가상 계정 등)
    const settingsQuery = useQuery({
        queryKey: ['publicSettings'],
        queryFn: async () => {
            const res = await fetch('/api/settings/public');
            if (!res.ok) return {};
            return res.json();
        },
        staleTime: 60 * 1000
    });

    // 3. 2학년 선택과목 프리셋
    const electiveG2Query = useQuery({
        queryKey: ['electiveConfigs-teacher', '2'],
        queryFn: async () => {
            const res = await fetch('/api/electives?grade=2');
            if (!res.ok) return [];
            return res.json();
        },
        staleTime: 60 * 1000
    });

    // 4. 3학년 선택과목 프리셋
    const electiveG3Query = useQuery({
        queryKey: ['electiveConfigs-teacher', '3'],
        queryFn: async () => {
            const res = await fetch('/api/electives?grade=3');
            if (!res.ok) return [];
            return res.json();
        },
        staleTime: 60 * 1000
    });

    const teacherOptions = useMemo(() => {
        return buildTeacherOptions(
            timetableQuery.data,
            settingsQuery.data,
            electiveG2Query.data,
            electiveG3Query.data
        );
    }, [timetableQuery.data, settingsQuery.data, electiveG2Query.data, electiveG3Query.data]);

    return {
        teacherOptions,
        isLoading: timetableQuery.isLoading || settingsQuery.isLoading,
        error: timetableQuery.error || settingsQuery.error,
        settings: settingsQuery.data,
        refetch: () => {
            timetableQuery.refetch();
            settingsQuery.refetch();
        }
    };
}
