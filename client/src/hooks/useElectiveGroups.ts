import { useMemo } from 'react';

/**
 * 선택과목 그룹 / 강의실 이름 해석 공유 훅
 *
 * Dashboard.tsx 와 TeacherPage.tsx 가 동일한 로직을 사용하도록 단일 소스로 통합.
 *
 * @param grade         학년 문자열 (e.g. "2", "3") — "1"이면 빈 맵 반환
 * @param allClassesTimetable  해당 학년의 전체 반 시간표 슬롯 배열 (weekday: 0-4, classTime: 1-7)
 * @param electiveConfigs      /api/electives 로 조회한 선택과목 설정 배열
 * @param settings             /api/settings/public 응답 (elective_group_overrides 포함)
 */
export function useElectiveGroups(
  grade: string,
  allClassesTimetable: any[],
  electiveConfigs: any[],
  settings: any,
) {
  /**
   * computedGroups: { "weekday-period" → groupCode }
   *
   * 각 시간표 셀(요일-교시)에서 다수결로 결정된 이동수업 그룹 코드를 담습니다.
   * Dashboard.tsx의 computedGroups / TeacherPage.tsx의 computedGroupsG2·G3 와 동일한 로직.
   */
  const computedGroups = useMemo((): Record<string, string> => {
    if (grade !== '2' && grade !== '3') return {};
    if (!allClassesTimetable || allClassesTimetable.length === 0) return {};

    const cellGroups: Record<string, string> = {};

    if (electiveConfigs && electiveConfigs.length > 0) {
      const subjectTeacherToGroups = new Map<string, string[]>();
      const subjectToGroups = new Map<string, string[]>();

      electiveConfigs.forEach((c: any) => {
        const isFreePeriod = ['빈교실', '공강', 'Empty', 'Free'].some(k =>
          (c.subject || '').includes(k),
        );
        if ((c.isMovingClass !== 0 || isFreePeriod) && c.classCode) {
          const codes = c.classCode
            .split(',')
            .map((code: string) => code.trim())
            .filter(Boolean);
          const subj = c.subject.trim();

          // subject-only 폴백 맵
          const existing = subjectToGroups.get(subj) || [];
          subjectToGroups.set(subj, Array.from(new Set([...existing, ...codes])));

          // subject + teacher 엄밀 매칭 맵 (originalTeacher · fullTeacherName 모두)
          const teacherNames: string[] = [];
          if (c.originalTeacher)
            teacherNames.push(
              ...c.originalTeacher
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean),
            );
          if (c.fullTeacherName)
            teacherNames.push(
              ...c.fullTeacherName
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean),
            );

          Array.from(new Set(teacherNames)).forEach((tName: string) => {
            const key = `${subj}|${tName}`;
            const existingKey = subjectTeacherToGroups.get(key) || [];
            subjectTeacherToGroups.set(key, Array.from(new Set([...existingKey, ...codes])));
          });
        }
      });

      for (let w = 0; w < 5; w++) {
        for (let p = 1; p <= 7; p++) {
          const slots = allClassesTimetable.filter(
            (t: any) => t.weekday === w && t.classTime === p,
          );
          if (slots.length === 0) continue;

          const groupCounts: Record<string, number> = {};
          slots.forEach((slot: any) => {
            const key = `${slot.subject.trim()}|${slot.teacher.trim()}`;
            let groups = subjectTeacherToGroups.get(key);
            if (!groups || groups.length === 0) {
              groups = subjectToGroups.get(slot.subject.trim());
            }
            if (groups) {
              groups.forEach((g: string) => {
                groupCounts[g] = (groupCounts[g] || 0) + 1;
              });
            }
          });

          const entries = Object.entries(groupCounts);
          if (entries.length > 0) {
            entries.sort((a, b) => b[1] - a[1]);
            if (entries[0][1] >= 1) {
              cellGroups[`${w}-${p}`] = entries[0][0];
            }
          }
        }
      }
    }

    // 관리자 수동 오버라이드 (항상 electiveConfigs 유무와 무관하게 적용)
    if (settings?.elective_group_overrides?.[grade]) {
      const gradeOverrides = settings.elective_group_overrides[grade];
      for (const [cellKey, overrideValue] of Object.entries(gradeOverrides)) {
        if (overrideValue === 'NONE') {
          delete cellGroups[cellKey];
        } else if (typeof overrideValue === 'string') {
          cellGroups[cellKey] = overrideValue as string;
        }
      }
    }

    return cellGroups;
  }, [allClassesTimetable, electiveConfigs, grade, settings?.elective_group_overrides]);

  /**
   * resolveClassName — 강의실 이름 해석 유틸리티
   * Dashboard.tsx 의 configEntry.className 파싱 로직과 완전히 동일.
   */
  const resolveClassName = useMemo(() => {
    // (grade-subject-groupCode) → resolvedName 사전 맵
    const classNameMap = new Map<string, string>();
    // (grade-subject) → 대표 강의실명 (groupCode 없을 때 이동수업 폴백)
    const movingSubjectMap = new Map<string, string>();

    if (electiveConfigs && electiveConfigs.length > 0) {
      electiveConfigs.forEach((c: any) => {
        if (!c.subject || !c.classCode) return;
        const subj = (c.subject || '').trim();
        const isMoving = c.isMovingClass !== 0;
        const codes = c.classCode
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);

        // JSON className 파싱 (Dashboard.tsx 의 rawClassName 처리와 동일)
        let classNameObj: Record<string, string> = {};
        let plainClassName = '';
        if (c.className) {
          const trimmedCN = (c.className as string).trim();
          if (trimmedCN.startsWith('{')) {
            try {
              classNameObj = JSON.parse(trimmedCN) as Record<string, string>;
            } catch {
              plainClassName = trimmedCN;
            }
          } else {
            plainClassName = trimmedCN;
          }
        }

        codes.forEach((code: string) => {
          const resolvedName =
            classNameObj[code] || classNameObj['_global'] || plainClassName;
          if (resolvedName) {
            classNameMap.set(`${grade}-${subj}-${code}`, resolvedName);
          }
          if (isMoving && !movingSubjectMap.has(`${grade}-${subj}`)) {
            movingSubjectMap.set(`${grade}-${subj}`, resolvedName || code);
          }
        });
      });
    }

    return {
      /**
       * 셀 라벨 문자열 반환
       * - groupCode 있음 → `강의실명(그룹)` 또는 `(그룹)`
       * - groupCode 없고 이동수업 → `강의실명`
       * - 일반 수업 → `grade-classNum`
       */
      getCellLabel: (
        gradeNum: number,
        subjectName: string,
        groupCode: string,
        classNum: number,
      ): string => {
        const g = String(gradeNum);
        const subj = (subjectName || '').trim();

        if (groupCode) {
          const configName = classNameMap.get(`${g}-${subj}-${groupCode}`);
          return configName ? `${configName}(${groupCode})` : `(${groupCode})`;
        }

        // groupCode 없음 → 이동수업 여부 확인
        const fallbackName = movingSubjectMap.get(`${g}-${subj}`);
        if (fallbackName !== undefined) {
          return fallbackName;
        }

        // 일반 수업
        return `${gradeNum}-${classNum}`;
      },

      /** Dashboard.tsx 방식의 configEntry 직접 조회 */
      findConfig: (subject: string, groupCode: string): any | null => {
        if (!electiveConfigs) return null;
        return (
          electiveConfigs.find(
            (c: any) =>
              c.subject === subject &&
              c.classCode
                ?.split(',')
                .map((s: string) => s.trim())
                .includes(groupCode),
          ) || null
        );
      },
    };
  }, [electiveConfigs, grade]);

  return { computedGroups, resolveClassName };
}
