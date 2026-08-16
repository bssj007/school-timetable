import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus, Calendar, Trash2, Edit, AlertCircle, Home, Search, X, ChevronsUpDown, Check, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

interface TeacherTimetableResponse {
  success: boolean;
  teachers: string[];
  subjects: string[];
  timetable: any[];
}

interface AssessmentItem {
  id: number;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  grade: number;
  classNum: number;
  classTime: number | null;
  dataset?: string;
  teacher?: string;
  classCode?: string;
  isTeacherCreated?: number;
}

// Helper: Download PC Desktop .url Shortcut
function downloadDesktopShortcut(title: string = "교사용_수행평가_등록시스템") {
  const url = window.location.href;
  const content = `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\n`;
  const blob = new Blob([content], { type: 'application/x-msshortcut' });
  const blobUrl = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${title}.url`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

// Helper: Get Monday of the week
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Helper: Format date to M/D
function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Helper: Get weekly dates
function getWeekDates(weekOffset: number): Date[] {
  const today = new Date();
  const monday = getMonday(today);
  monday.setDate(monday.getDate() + weekOffset * 7);

  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

// Helper: Date to YYYY-MM-DD
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Format date string YYYY-MM-DD to include day of week and optional period without year (e.g. 08-13 (목) 2교시)
function formatDateWithDay(dateStr: string, classTime?: string | number | null): string {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  let formatted = dateStr;
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m - 1, d);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = weekdays[dateObj.getDay()];
    formatted = `${parts[1]}-${parts[2]} (${dayOfWeek})`;
  }
  if (classTime) {
    formatted += ` ${classTime}교시`;
  }
  return formatted;
}

// Helper: classCode is stored as either simple "A" / "A,C" or JSON {"A":"2-3반","C":"2-3반"}
// Returns array of group code strings: ["A", "C"]
function parseClassCode(classCode: string | null | undefined): string[] {
  if (!classCode || !classCode.trim()) return [];
  const trimmed = classCode.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, string>;
      return Object.keys(obj).filter(Boolean);
    } catch {
      // fall through
    }
  }
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}

// Helper: Check if assessment subject matches one of teacher's taught subjects
function isSubjectMatch(assessmentSubject?: string, taughtSubjects?: string[]): boolean {
  if (!assessmentSubject || !taughtSubjects || taughtSubjects.length === 0) return true;
  const cleanAssSub = assessmentSubject.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
  
  return taughtSubjects.some(ts => {
    const cleanTs = ts.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
    return cleanAssSub.includes(cleanTs) || cleanTs.includes(cleanAssSub);
  });
}

// Helper: Check if assessment matches current teacher by name and taught subjects
function matchTeacherAndSubject(
  a: { teacher?: string; subject?: string },
  currentTeacherName: string,
  currentRawTeacherName: string,
  taughtSubjects: string[]
): boolean {
  if (!currentTeacherName) return true;
  
  const cleanCurrent = currentTeacherName.replace(/선생님$/, '').trim();
  const cleanRaw = (currentRawTeacherName || '').replace(/선생님$/, '').trim();

  // 1. If assessment has a teacher specified, enforce teacher match
  if (a.teacher && a.teacher.trim()) {
    const cleanA = a.teacher.replace(/선생님$/, '').trim();
    const isTeacherMatched = cleanA === cleanCurrent || (cleanRaw ? cleanA === cleanRaw : false);
    if (!isTeacherMatched) {
      return false; // Created by another teacher
    }
  }

  // 2. Enforce subject match against subjects taught by current teacher
  if (a.subject && taughtSubjects && taughtSubjects.length > 0) {
    if (!isSubjectMatch(a.subject, taughtSubjects)) {
      return false; // Subject is not taught by this teacher
    }
  }

  return true;
}

// Helper: Extract elective group (e.g. "A" from "Subject(A)" or "A그룹")
function extractClassCode(subject: string): string {
  const match = subject.match(/\((.*?)\)/);
  if (match) {
    return match[1].replace("그룹", "").trim();
  }
  return "";
}

// Helper: Compute dynamic group mapping per grade
function getComputedGroupsForGrade(
  grade: string,
  allClassesTimetable: any[],
  electiveConfigs: any[],
  settings: any
): Record<string, string> {
  if (grade !== "2" && grade !== "3") {
    return {};
  }
  if (!allClassesTimetable || allClassesTimetable.length === 0) {
    return {};
  }

  const cellGroups: Record<string, string> = {};

  if (electiveConfigs && electiveConfigs.length > 0) {
    const subjectTeacherToGroups = new Map<string, string[]>();
    const subjectToGroups = new Map<string, string[]>();

    electiveConfigs.forEach((c: any) => {
      const isFreePeriod = ["빈교실", "공강", "Empty", "Free"].some(k => (c.subject || "").includes(k));
      if ((c.isMovingClass !== 0 || isFreePeriod) && c.classCode) {
        const codes = c.classCode.split(',').map((code: string) => code.trim()).filter(Boolean);
        const subj = c.subject.trim();

        const existing = subjectToGroups.get(subj) || [];
        subjectToGroups.set(subj, Array.from(new Set([...existing, ...codes])));

        const teacherNames = [];
        if (c.originalTeacher) teacherNames.push(...c.originalTeacher.split(',').map((t: string) => t.trim()).filter(Boolean));
        if (c.fullTeacherName) teacherNames.push(...c.fullTeacherName.split(',').map((t: string) => t.trim()).filter(Boolean));

        const uniqueTeachers = Array.from(new Set(teacherNames));

        uniqueTeachers.forEach((tName: string) => {
          const key = `${subj}|${tName}`;
          const existingKey = subjectTeacherToGroups.get(key) || [];
          subjectTeacherToGroups.set(key, Array.from(new Set([...existingKey, ...codes])));
        });
      }
    });

    for (let w = 0; w < 5; w++) {
      for (let p = 1; p <= 7; p++) {
        const slots = allClassesTimetable.filter(t => t.weekday === w && t.classTime === p);
        if (slots.length === 0) continue;

        const groupCounts: Record<string, number> = {};
        slots.forEach(slot => {
          const key = `${slot.subject.trim()}|${slot.teacher.trim()}`;
          let groups = subjectTeacherToGroups.get(key);

          if (!groups || groups.length === 0) {
            groups = subjectToGroups.get(slot.subject.trim());
          }

          if (groups) {
            groups.forEach(g => {
              groupCounts[g] = (groupCounts[g] || 0) + 1;
            });
          }
        });

        const entries = Object.entries(groupCounts);
        if (entries.length > 0) {
          entries.sort((a, b) => b[1] - a[1]);
          const maxGroup = entries[0][0];
          const maxCount = entries[0][1];
          if (maxCount >= 1) {
            cellGroups[`${w}-${p}`] = maxGroup;
          }
        }
      }
    }
  }

  if (settings?.elective_group_overrides?.[grade]) {
    const gradeOverrides = settings.elective_group_overrides[grade];
    for (const [cellKey, overrideValue] of Object.entries(gradeOverrides)) {
      if (overrideValue === "NONE") {
        delete cellGroups[cellKey];
      } else if (typeof overrideValue === "string") {
        cellGroups[cellKey] = overrideValue;
      }
    }
  }
  return cellGroups;
}

// 그룹 코드 무지개 색상 (A=빨, B=주, C=노, D=초, E=파, F=남, G=보, 이후 순환)
const GROUP_COLORS: Record<string, string> = {
  A: '#ef4444', // 빨강
  B: '#f97316', // 주황
  C: '#ca8a04', // 노랑 (amber — 흰 배경 가시성)
  D: '#22c55e', // 초록
  E: '#3b82f6', // 파랑
  F: '#6366f1', // 남색 (indigo)
  G: '#a855f7', // 보라
};
const GROUP_COLOR_CYCLE = ['#ef4444','#f97316','#ca8a04','#22c55e','#3b82f6','#6366f1','#a855f7'];
function getGroupColor(group: string): string {
  if (GROUP_COLORS[group]) return GROUP_COLORS[group];
  // A=0, B=1 ... Z=25 기준으로 순환
  const idx = group.charCodeAt(0) - 65;
  return GROUP_COLOR_CYCLE[((idx % GROUP_COLOR_CYCLE.length) + GROUP_COLOR_CYCLE.length) % GROUP_COLOR_CYCLE.length];
}


export default function TeacherPage() {
  const queryClient = useQueryClient();
  
  // States
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(() => {
    return localStorage.getItem("teacher-page-selected-teacher") || "1";
  });
  const [openCombobox, setOpenCombobox] = useState(false);

  // ── 교사 페이지 인증: 선생님별 localStorage 기반 ──
  // isCurrentTeacherVerified: 현재 선택된 선생님에 대한 인증 여부
  const [isCurrentTeacherVerified, setIsCurrentTeacherVerified] = useState<boolean>(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);

  const [weekOffset, setWeekOffset] = useState<number>(() => {
    const today = new Date();
    const day = today.getDay();
    return (day === 0 || day === 6) ? 1 : 0;
  });
  
  const [selectedCell, setSelectedCell] = useState<{
    weekdayIndex: number;
    period: number;
    dateStr: string;
    grade: number;
    classNum: number;
    subjectName: string;
    cellGroup?: string;
  } | null>(null);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentItem | null>(null);

  const [formData, setFormData] = useState({
    assessmentDate: "",
    subject: "",
    content: "",
    classTime: "",
    round: "1",
    teacher: "",
    classCode: "",
  });

  // Keep teacher selection in localStorage
  useEffect(() => {
    localStorage.setItem("teacher-page-selected-teacher", selectedTeacherId);
  }, [selectedTeacherId]);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekRangeText = `${formatDate(weekDates[0])} ~ ${formatDate(weekDates[4])}`;
  const weekdays = ['월', '화', '수', '목', '금'];

  // Fetch Public Settings
  const { data: settings } = useQuery({
    queryKey: ['publicSettings-teacher'],
    queryFn: async () => {
      const res = await fetch('/api/settings/public');
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  // settings/selectedTeacherId 변경 시 현재 선생님 인증 상태 재확인
  // rawTeacherName은 tId에 의존하므로 selectedTeacherId로 키 생성
  const teacherAuthStorageKey = `teacher-auth-${selectedTeacherId}`;

  useEffect(() => {
    if (!settings) return;
    const expireDays = settings.teacher_auth_expire_days ?? 0;
    const stored = localStorage.getItem(teacherAuthStorageKey);
    if (!stored) { setIsCurrentTeacherVerified(false); return; }
    if (expireDays === 0) { setIsCurrentTeacherVerified(true); return; }
    const storedTime = parseInt(stored, 10);
    if (isNaN(storedTime)) {
      localStorage.removeItem(teacherAuthStorageKey);
      setIsCurrentTeacherVerified(false);
      return;
    }
    const expireMs = expireDays * 24 * 60 * 60 * 1000;
    if (Date.now() - storedTime < expireMs) {
      setIsCurrentTeacherVerified(true);
    } else {
      localStorage.removeItem(teacherAuthStorageKey);
      setIsCurrentTeacherVerified(false);
    }
  }, [settings, teacherAuthStorageKey]);

  // 선생님별 올바른 비밀번호 조회 (개별 설정 우선, 없으면 디폴트)
  const getCorrectPassword = (): string => {
    const defaultPw = settings?.teacher_default_password || '관리';
    if (settings?.teacher_passwords) {
      try {
        const pwMap: Record<string, string> =
          typeof settings.teacher_passwords === 'string'
            ? JSON.parse(settings.teacher_passwords)
            : settings.teacher_passwords;
        // rawTeacherName은 이 시점에서 아직 미정이므로 선생님 ID로 fallback
        // 실제 매칭은 rawTeacherName 기준
        const keyByRaw = Object.keys(pwMap).find(k => k === (timetableData?.teachers?.[parseInt(selectedTeacherId, 10)] || ''));
        if (keyByRaw) return pwMap[keyByRaw];
      } catch {}
    }
    return defaultPw;
  };

  const handleTeacherAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPw = getCorrectPassword();
    if (authPassword === correctPw) {
      // 다른 선생님의 인증 세션 모두 취소
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('teacher-auth-') && key !== teacherAuthStorageKey) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      localStorage.setItem(teacherAuthStorageKey, String(Date.now()));
      setIsCurrentTeacherVerified(true);
      setShowAuthDialog(false);
      setAuthError("");
      setAuthPassword("");
    } else {
      setAuthError("비밀번호가 올바르지 않습니다.");
    }
  };

  // 쓰기 액션 전 인증 체크 (미인증 시 다이얼로그 표시)
  const requireAuth = (): boolean => {
    if (!isCurrentTeacherVerified) {
      setShowAuthDialog(true);
      return false;
    }
    return true;
  };


  const targetDate = toDateString(weekDates[0]);

  // Fixed current-week date for assessment panel (always weekOffset=0)
  const currentWeekDate = useMemo(() => toDateString(getMonday(new Date())), []);

  // Fetch all class timetables for Grade 1, 2, and 3 to resolve datasets and elective groups
  const { data: grade1Timetable } = useQuery({
    queryKey: ['timetable-all', '1', targetDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=1&classNum=all&targetDate=${encodeURIComponent(targetDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5000,
    retry: true,
    retryDelay: 3000,
  });

  const { data: grade2Timetable } = useQuery({
    queryKey: ['timetable-all', '2', targetDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=2&classNum=all&targetDate=${encodeURIComponent(targetDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5000,
    retry: true,
    retryDelay: 3000,
  });

  const { data: grade3Timetable } = useQuery({
    queryKey: ['timetable-all', '3', targetDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=3&classNum=all&targetDate=${encodeURIComponent(targetDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5000,
    retry: true,
    retryDelay: 3000,
  });

  const g1DatasetType = useMemo(() => {
    const rawDatasetId = grade1Timetable?.originalDatasetId || grade1Timetable?.datasetId || '';
    return (rawDatasetId === 'MANUAL_PLAN' || rawDatasetId === 'SEMESTER_PLAN') ? rawDatasetId : 'COMCIGAN';
  }, [grade1Timetable]);

  const g2DatasetType = useMemo(() => {
    const rawDatasetId = grade2Timetable?.originalDatasetId || grade2Timetable?.datasetId || '';
    return (rawDatasetId === 'MANUAL_PLAN' || rawDatasetId === 'SEMESTER_PLAN') ? rawDatasetId : 'COMCIGAN';
  }, [grade2Timetable]);

  const g3DatasetType = useMemo(() => {
    const rawDatasetId = grade3Timetable?.originalDatasetId || grade3Timetable?.datasetId || '';
    return (rawDatasetId === 'MANUAL_PLAN' || rawDatasetId === 'SEMESTER_PLAN') ? rawDatasetId : 'COMCIGAN';
  }, [grade3Timetable]);

  // Fetch current-week timetables to resolve fixed panel datasets
  const { data: grade1TimetableNow } = useQuery({
    queryKey: ['timetable-all-now', '1', currentWeekDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=1&classNum=all&targetDate=${encodeURIComponent(currentWeekDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
  });
  const { data: grade2TimetableNow, isLoading: isGrade2NowLoading } = useQuery({
    queryKey: ['timetable-all-now', '2', currentWeekDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=2&classNum=all&targetDate=${encodeURIComponent(currentWeekDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: grade3TimetableNow, isLoading: isGrade3NowLoading } = useQuery({
    queryKey: ['timetable-all-now', '3', currentWeekDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=3&classNum=all&targetDate=${encodeURIComponent(currentWeekDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fixed panel dataset types (always current week, not affected by week navigation)
  const panelG1Dataset = useMemo(() => {
    const raw = grade1TimetableNow?.originalDatasetId || grade1TimetableNow?.datasetId || '';
    return (raw === 'MANUAL_PLAN' || raw === 'SEMESTER_PLAN') ? raw : 'COMCIGAN';
  }, [grade1TimetableNow]);
  const panelG2Dataset = useMemo(() => {
    const raw = grade2TimetableNow?.originalDatasetId || grade2TimetableNow?.datasetId || '';
    return (raw === 'MANUAL_PLAN' || raw === 'SEMESTER_PLAN') ? raw : 'COMCIGAN';
  }, [grade2TimetableNow]);
  const panelG3Dataset = useMemo(() => {
    const raw = grade3TimetableNow?.originalDatasetId || grade3TimetableNow?.datasetId || '';
    return (raw === 'MANUAL_PLAN' || raw === 'SEMESTER_PLAN') ? raw : 'COMCIGAN';
  }, [grade3TimetableNow]);

  // Fetch Elective Configurations for Grade 2 and 3
  // panelG2Dataset/panelG3Dataset는 현재 실제 주(weekOffset=0) 기준 — 주 탐색과 무관
  const { data: electiveConfigsG2, isLoading: isElectiveG2Loading } = useQuery({
    queryKey: ['electiveConfigs-teacher', '2', panelG2Dataset],
    queryFn: async () => {
      const res = await fetch(`/api/electives?grade=2&dataset=${panelG2Dataset}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!panelG2Dataset,
  });

  const { data: electiveConfigsG3, isLoading: isElectiveG3Loading } = useQuery({
    queryKey: ['electiveConfigs-teacher', '3', panelG3Dataset],
    queryFn: async () => {
      const res = await fetch(`/api/electives?grade=3&dataset=${panelG3Dataset}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!panelG3Dataset,
  });

  // 그룹 데이터 로딩 완료 여부 — 모든 의존 쿼리가 완료된 후에만 표를 렌더링해 그룹 코드 지연 방지
  const isGroupDataLoading = isGrade2NowLoading || isGrade3NowLoading || isElectiveG2Loading || isElectiveG3Loading;

  // Compute elective groups for Grade 2 and Grade 3
  // grade2TimetableNow/grade3TimetableNow는 항상 현재 실제 주 데이터 — 주 탐색과 무관
  const computedGroupsG2 = useMemo(() => {
    return getComputedGroupsForGrade('2', grade2TimetableNow?.data || [], electiveConfigsG2 || [], settings);
  }, [grade2TimetableNow?.data, electiveConfigsG2, settings]);

  const computedGroupsG3 = useMemo(() => {
    return getComputedGroupsForGrade('3', grade3TimetableNow?.data || [], electiveConfigsG3 || [], settings);
  }, [grade3TimetableNow?.data, electiveConfigsG3, settings]);

  // 1. Fetch Teacher Timetable
  const { data: timetableData, isLoading: isTimetableLoading, isError: isTimetableError } = useQuery<TeacherTimetableResponse>({
    queryKey: ['teacher-timetable'],
    queryFn: async () => {
      const res = await fetch('/api/comcigan?type=teacher_timetable');
      if (!res.ok) throw new Error("Failed to fetch teacher timetable");
      return res.json();
    },
    staleTime: 5000,
    retry: true,
    retryDelay: 3000,
    refetchInterval: 2 * 60 * 1000,
  });

  const ignoreKeywords = useMemo(() => {
    if (!settings) return ['빈교', '공강', '학년', '채', '창'];
    const rawVal = settings.teacher_ignore_keywords;
    if (rawVal === undefined) return ['빈교', '공강', '학년', '채', '창'];
    if (!rawVal) return []; // Explicitly cleared by admin
    return rawVal.split(',').map((k: string) => k.trim()).filter(Boolean);
  }, [settings]);

  const teacherMap = useMemo(() => {
    const map = new Map<string, string>();
    const allConfigs = [...(electiveConfigsG2 || []), ...(electiveConfigsG3 || [])];
    allConfigs.forEach((c: any) => {
      if (c.originalTeacher && c.fullTeacherName) {
        const rawNames = c.originalTeacher.split(',').map((t: string) => t.trim()).filter(Boolean);
        const fullNames = c.fullTeacherName.split(',').map((t: string) => t.trim()).filter(Boolean);
        rawNames.forEach((raw: string, idx: number) => {
          const full = fullNames[idx] || fullNames[0];
          if (raw && full) {
            map.set(raw, full);
          }
        });
      }
    });
    return map;
  }, [electiveConfigsG2, electiveConfigsG3]);

  const teacherSubjectsMap = useMemo(() => {
    const map = new Map<number, string[]>();
    if (!timetableData?.timetable || !timetableData?.subjects) return map;
    
    timetableData.timetable.forEach((schedule: any, tId: number) => {
      if (!schedule) return;
      const subjects = new Set<string>();
      for (let d = 1; d <= 5; d++) {
        const daySchedule = schedule[d];
        if (!daySchedule) continue;
        for (let p = 1; p < daySchedule.length; p++) {
          const val = daySchedule[p];
          if (!val) continue;
          let numVal = typeof val === 'number' ? val : parseInt(String(val).replace(/>/g, ''), 10);
          if (!numVal || isNaN(numVal) || numVal === 0) continue;
          
          const subjectId = Math.floor(numVal / 1000);
          const subjectName = timetableData.subjects[subjectId];
          if (subjectName) {
            subjects.add(subjectName);
          }
        }
      }
      map.set(tId, Array.from(subjects));
    });
    return map;
  }, [timetableData]);

  const getTeacherDisplayName = useCallback((rawName: string, idx?: number) => {
    if (idx !== undefined && teacherSubjectsMap) {
      const subjects = teacherSubjectsMap.get(idx) || [];
      const allConfigs = [...(electiveConfigsG2 || []), ...(electiveConfigsG3 || [])];
      
      // Try to find a config that matches both the raw name and one of the subjects the teacher teaches
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
      
      // Fallback: Try to find ANY config matching the raw name
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
    }
    return teacherMap.get(rawName) || rawName;
  }, [teacherSubjectsMap, electiveConfigsG2, electiveConfigsG3, teacherMap]);

  const teacherOptions = useMemo(() => {
    if (!timetableData?.teachers) return [];
    
    const options = timetableData.teachers.map((name, idx) => {
      if (idx === 0) return null; // Skip '*'
      const shouldIgnore = ignoreKeywords.some((kw: string) => name.includes(kw));
      if (shouldIgnore) return null;
      
      const displayName = getTeacherDisplayName(name, idx);
      const subjects = teacherSubjectsMap.get(idx) || [];
      
      return {
        idx,
        rawName: name,
        displayName,
        subjects,
      };
    }).filter(Boolean) as { idx: number; rawName: string; displayName: string; subjects: string[] }[];
    
    const displayNameCounts = new Map<string, number>();
    options.forEach(opt => {
      displayNameCounts.set(opt.displayName, (displayNameCounts.get(opt.displayName) || 0) + 1);
    });
    
    return options.map(opt => {
      const count = displayNameCounts.get(opt.displayName) || 0;
      let label = opt.displayName;
      if (count > 1 && opt.subjects.length > 0) {
        label = `${opt.displayName} (${opt.subjects.join(', ')})`;
      }
      return {
        ...opt,
        label,
      };
    });
  }, [timetableData, ignoreKeywords, teacherSubjectsMap, getTeacherDisplayName]);

  const [showTeacherSelectModal, setShowTeacherSelectModal] = useState(false);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState("");

  const filteredTeacherOptions = useMemo(() => {
    if (!teacherSearchQuery.trim()) return teacherOptions;
    const q = teacherSearchQuery.trim().toLowerCase();
    return teacherOptions.filter(opt => {
      const matchName = opt.displayName.toLowerCase().includes(q) || opt.rawName.toLowerCase().includes(q) || opt.label.toLowerCase().includes(q);
      const matchSubject = opt.subjects.some(s => s.toLowerCase().includes(q));
      return matchName || matchSubject;
    });
  }, [teacherOptions, teacherSearchQuery]);

  const tId = parseInt(selectedTeacherId, 10);
  const rawTeacherName = timetableData?.teachers?.[tId] || "";
  const teacherName = getTeacherDisplayName(rawTeacherName, tId);
  const selectedSchedule = timetableData?.timetable?.[tId];

  // Subjects taught by the selected teacher
  const taughtSubjects = useMemo(() => {
    if (isNaN(tId) || !teacherSubjectsMap) return [];
    return teacherSubjectsMap.get(tId) || [];
  }, [tId, teacherSubjectsMap]);

  // Decode cell value
  const decodeCell = (val: any) => {
    if (!val) return null;
    let numVal = typeof val === 'number' ? val : parseInt(String(val).replace(/>/g, ''), 10);
    if (!numVal || isNaN(numVal) || numVal === 0) return null;
    
    const classNum = numVal % 100;
    const grade = Math.floor(numVal / 100) % 10;
    const subjectId = Math.floor(numVal / 1000);
    const subjectName = timetableData?.subjects?.[subjectId] || "알 수 없음";
    return { classNum, grade, subjectName };
  };

  // Find max periods dynamically
  let maxPeriods = 7;
  if (selectedSchedule) {
    for (let d = 1; d <= 5; d++) {
      if (selectedSchedule[d] && selectedSchedule[d].length - 1 > maxPeriods) {
        maxPeriods = selectedSchedule[d].length - 1;
      }
    }
  }

  // Current time based period determination (1-9)
  const [currentPeriod, setCurrentPeriod] = useState<number | null>(null);

  useEffect(() => {
    const calcCurrentPeriod = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();

      if (minutes >= 8 * 60 + 30 && minutes < 9 * 60 + 25) return 1;
      if (minutes >= 9 * 60 + 30 && minutes < 10 * 60 + 25) return 2;
      if (minutes >= 10 * 60 + 30 && minutes < 11 * 60 + 25) return 3;
      if (minutes >= 11 * 60 + 30 && minutes < 12 * 60 + 25) return 4;
      if (minutes >= 13 * 60 + 20 && minutes < 14 * 60 + 15) return 5;
      if (minutes >= 14 * 60 + 20 && minutes < 15 * 60 + 15) return 6;
      if (minutes >= 15 * 60 + 20 && minutes < 16 * 60 + 15) return 7;
      if (minutes >= 16 * 60 + 20 && minutes < 17 * 60 + 15) return 8;
      if (minutes >= 17 * 60 + 20 && minutes < 18 * 60 + 15) return 9;
      return null;
    };

    setCurrentPeriod(calcCurrentPeriod());
    const interval = setInterval(() => {
      setCurrentPeriod(calcCurrentPeriod());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Scan and gather unique classes taught by selected teacher
  const taughtClasses = useMemo(() => {
    if (!selectedSchedule) return [];
    const classesMap = new Map<string, { grade: number; classNum: number }>();
    
    for (let d = 1; d <= 5; d++) {
      const daySchedule = selectedSchedule[d];
      if (!daySchedule) continue;
      for (let p = 1; p < daySchedule.length; p++) {
        const val = daySchedule[p];
        const decoded = decodeCell(val);
        if (decoded) {
          const key = `${decoded.grade}-${decoded.classNum}`;
          classesMap.set(key, { grade: decoded.grade, classNum: decoded.classNum });
        }
      }
    }
    return Array.from(classesMap.values());
  }, [selectedSchedule]);

  // 2. Fetch Assessments for all taught classes concurrently
  const { data: allAssessments, isLoading: isAssessmentsLoading } = useQuery<AssessmentItem[]>({
    // weekOffset excluded: assessment panel shows ALL weeks regardless of timetable navigation
    queryKey: ['teacher-assessments', taughtClasses, panelG1Dataset, panelG2Dataset, panelG3Dataset],
    queryFn: async () => {
      if (taughtClasses.length === 0) return [];
      
      const promises = taughtClasses.map(async (cls) => {
        let resolvedDataset = 'COMCIGAN';
        if (cls.grade === 1) {
          resolvedDataset = panelG1Dataset;
        } else if (cls.grade === 2) {
          resolvedDataset = panelG2Dataset;
        } else if (cls.grade === 3) {
          resolvedDataset = panelG3Dataset;
        }
        const res = await fetch(`/api/assessment?grade=${cls.grade}&classNum=${cls.classNum}&dataset=${resolvedDataset}`);
        if (!res.ok) return [];
        return res.json();
      });
      
      const results = await Promise.all(promises);
      const merged = results.flat() as AssessmentItem[];
      
      // Deduplicate by ID
      const uniqueMap = new Map<number, AssessmentItem>();
      merged.forEach(item => {
        if (item && item.id) {
          uniqueMap.set(item.id, item);
        }
      });
      return Array.from(uniqueMap.values());
    },
    enabled: taughtClasses.length > 0 && !!panelG1Dataset && !!panelG2Dataset && !!panelG3Dataset,
    staleTime: 5000,
    refetchInterval: 2000,
  });

  const [selectedTabId, setSelectedTabId] = useState<string>('');
  // null = no manual selection (auto-pick first subject)
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string | null>(null);

  // Bookmark tab color palette — diverse pastel tones
  const BOOKMARK_COLORS = [
    { bg: '#f472b6', activeBg: '#be185d' }, // rose pink
    { bg: '#60a5fa', activeBg: '#1d4ed8' }, // sky blue
    { bg: '#fde047', activeBg: '#a16207' }, // lemon yellow
    { bg: '#a78bfa', activeBg: '#6d28d9' }, // soft violet
    { bg: '#fb923c', activeBg: '#c2410c' }, // peach orange
    { bg: '#2dd4bf', activeBg: '#0f766e' }, // teal
    { bg: '#fbbf24', activeBg: '#b45309' }, // warm amber
    { bg: '#f87171', activeBg: '#b91c1c' }, // coral red
    { bg: '#818cf8', activeBg: '#3730a3' }, // periwinkle
    { bg: '#fcd34d', activeBg: '#92400e' }, // golden yellow
  ];

  // Standard Korean school period start times (컴시간알리미 reference)
  const PERIOD_TIMES: Record<number, string> = {
    1: '8:30',
    2: '9:30',
    3: '10:30',
    4: '11:30',
    5: '13:20',
    6: '14:20',
    7: '15:20',
    8: '16:00',
    9: '17:00',
  };

  // Drag-to-scroll state & handlers for class navigation tabs
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const isMouseDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const isDraggingTabsRef = useRef(false);

  const handleTabMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tabContainerRef.current) return;
    isMouseDownRef.current = true;
    startXRef.current = e.pageX - tabContainerRef.current.offsetLeft;
    scrollLeftRef.current = tabContainerRef.current.scrollLeft;
    isDraggingTabsRef.current = false;
  };

  const handleTabMouseLeave = () => {
    isMouseDownRef.current = false;
  };

  const handleTabMouseUp = () => {
    isMouseDownRef.current = false;
  };

  const handleTabMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDownRef.current || !tabContainerRef.current) return;
    const x = e.pageX - tabContainerRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    if (Math.abs(walk) > 4) {
      isDraggingTabsRef.current = true;
    }
    tabContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  // Subject tabs derived from taughtSubjects, sorted by period count (시수) desc
  const subjectTabs = useMemo(() => {
    if (!taughtSubjects || taughtSubjects.length === 0) return [];

    // selectedSchedule에서 과목별 시수(등장 횟수) 계산
    const periodCounts = new Map<string, number>();
    if (selectedSchedule) {
      for (let d = 1; d <= 5; d++) {
        const daySchedule = selectedSchedule[d];
        if (!daySchedule) continue;
        for (let p = 1; p < daySchedule.length; p++) {
          const val = daySchedule[p];
          if (!val) continue;
          let numVal = typeof val === 'number' ? val : parseInt(String(val).replace(/>/g, ''), 10);
          if (!numVal || isNaN(numVal) || numVal === 0) continue;
          const subjectId = Math.floor(numVal / 1000);
          const subjectName = timetableData?.subjects?.[subjectId];
          if (subjectName) {
            periodCounts.set(subjectName, (periodCounts.get(subjectName) || 0) + 1);
          }
        }
      }
    }

    // 시수 많은 순 → 동률이면 가나다 순
    return [...taughtSubjects].sort((a, b) => {
      const ca = periodCounts.get(a) ?? 0;
      const cb = periodCounts.get(b) ?? 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b, 'ko');
    });
  }, [taughtSubjects, selectedSchedule, timetableData]);


  // Effective subject filter: use manual selection if valid, else auto-pick first subject
  // Declared BEFORE classTabs and filteredClassTabs to avoid Temporal Dead Zone
  const effectiveSubjectFilter = useMemo(() => {
    if (selectedSubjectFilter && subjectTabs.includes(selectedSubjectFilter)) {
      return selectedSubjectFilter;
    }
    return subjectTabs[0] ?? '';
  }, [selectedSubjectFilter, subjectTabs]);

  // Reset manual selection when teacher changes — useEffect is safe, avoids setState-during-render
  useEffect(() => {
    setSelectedSubjectFilter(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId]);

  // Build class+group nav tabs for the right panel (filtered by effectiveSubjectFilter)
  const classTabs = useMemo(() => {
    const tabs: { id: string; grade: number; classNum: number; group: string; label: string }[] = [];
    if (!selectedSchedule) return tabs;

    const seenIds = new Set<string>();

    taughtClasses.forEach(({ grade, classNum }) => {
      const groupsInAss = new Set<string>();
      let hasMatchingCell = false;
      let hasPlainCell = false; // 그룹 없는 일반반 셀 존재 여부

      if (grade === 2) {
        for (let d = 1; d <= 5; d++) {
          const daySchedule = selectedSchedule[d];
          if (!daySchedule) continue;
          for (let p = 1; p < daySchedule.length; p++) {
            const val = daySchedule[p];
            const decoded = decodeCell(val);
            if (decoded && decoded.grade === grade && decoded.classNum === classNum) {
              if (!effectiveSubjectFilter || isSubjectMatch(decoded.subjectName, [effectiveSubjectFilter])) {
                hasMatchingCell = true;
                const cellG = computedGroupsG2[`${d - 1}-${p}`];
                if (cellG) {
                  const isValidElective = (electiveConfigsG2 || []).some((c: any) => {
                    if (!c.classCode) return false;
                    const groups = c.classCode.split(',').map((s: string) => s.trim()).filter(Boolean);
                    if (!groups.includes(cellG)) return false;
                    if (!isSubjectMatch(decoded.subjectName, [(c.subject || '').trim()])) return false;
                    const teacherNames = [
                      ...(c.originalTeacher || '').split(',').map((t: string) => t.trim()),
                      ...(c.fullTeacherName || '').split(',').map((t: string) => t.trim()),
                    ].filter(Boolean);
                    return teacherNames.some(t => t === teacherName || t === rawTeacherName);
                  });
                  if (isValidElective) groupsInAss.add(cellG);
                } else {
                  // 그룹 없는 일반반 셀
                  hasPlainCell = true;
                }
              }
            }
          }
        }
      } else if (grade === 3) {
        for (let d = 1; d <= 5; d++) {
          const daySchedule = selectedSchedule[d];
          if (!daySchedule) continue;
          for (let p = 1; p < daySchedule.length; p++) {
            const val = daySchedule[p];
            const decoded = decodeCell(val);
            if (decoded && decoded.grade === grade && decoded.classNum === classNum) {
              if (!effectiveSubjectFilter || isSubjectMatch(decoded.subjectName, [effectiveSubjectFilter])) {
                hasMatchingCell = true;
                const cellG = computedGroupsG3[`${d - 1}-${p}`];
                if (cellG) {
                  const isValidElective = (electiveConfigsG3 || []).some((c: any) => {
                    if (!c.classCode) return false;
                    const groups = c.classCode.split(',').map((s: string) => s.trim()).filter(Boolean);
                    if (!groups.includes(cellG)) return false;
                    if (!isSubjectMatch(decoded.subjectName, [(c.subject || '').trim()])) return false;
                    const teacherNames = [
                      ...(c.originalTeacher || '').split(',').map((t: string) => t.trim()),
                      ...(c.fullTeacherName || '').split(',').map((t: string) => t.trim()),
                    ].filter(Boolean);
                    return teacherNames.some(t => t === teacherName || t === rawTeacherName);
                  });
                  if (isValidElective) groupsInAss.add(cellG);
                } else {
                  hasPlainCell = true;
                }
              }
            }
          }
        }
      } else {
        // 1학년 등 grade 2/3 외: 과목필터 무관하게 탭 허용
        hasMatchingCell = true;
        hasPlainCell = true;
      }

      // 매칭 셀이 없는 경우(=이 class에서 해당 과목을 안 가르침) → 탭 생성 안 함
      if (!hasMatchingCell && effectiveSubjectFilter) return;

      if (groupsInAss.size > 0) {
        const sortedGroups = Array.from(groupsInAss).sort();
        sortedGroups.forEach(grp => {
          const id = `${grade}-${classNum}-${grp}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            tabs.push({ id, grade, classNum, group: grp, label: `${grade}-${classNum}(${grp})` });
          }
        });
        // 일반반 탭은 실제 일반반(그룹 없는) 셀이 있을 때만 추가
        if (hasPlainCell) {
          const baseId = `${grade}-${classNum}-`;
          if (!seenIds.has(baseId)) {
            seenIds.add(baseId);
            tabs.push({ id: baseId, grade, classNum, group: '', label: `${grade}-${classNum}반` });
          }
        }
      } else {
        const id = `${grade}-${classNum}-`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          tabs.push({ id, grade, classNum, group: '', label: `${grade}-${classNum}반` });
        }
      }
    });

    tabs.sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade;
      if (a.classNum !== b.classNum) return a.classNum - b.classNum;
      return a.group.localeCompare(b.group);
    });

    return tabs;
  }, [taughtClasses, selectedSchedule, computedGroupsG2, computedGroupsG3, electiveConfigsG2, electiveConfigsG3, teacherName, rawTeacherName, taughtSubjects, effectiveSubjectFilter]);

  // Auto-select first tab (based on full classTabs — will be refined after filteredClassTabs is computed)
  useEffect(() => {
    if (classTabs.length > 0 && !classTabs.find(t => t.id === selectedTabId)) {
      setSelectedTabId(classTabs[0].id);
    }
  }, [classTabs]);

  // filteredClassTabs: 탭은 시간표(선생님이 가르치는 것) 기준으로 결정되며,
  // 수행평가 존재 여부와 무관하게 표시된다. (classTabs에서 이미 subject 필터 적용됨)
  const filteredClassTabs = useMemo(() => classTabs, [classTabs]);

  // Auto-select first filtered tab when filteredClassTabs changes
  useEffect(() => {
    if (filteredClassTabs.length > 0 && !filteredClassTabs.find(t => t.id === selectedTabId)) {
      setSelectedTabId(filteredClassTabs[0].id);
    }
  }, [filteredClassTabs]);

  const selectedTab = filteredClassTabs.find(t => t.id === selectedTabId) || filteredClassTabs[0] || null;

  // Filter assessments for selected tab & selected teacher
  const panelAssessments = useMemo(() => {
    if (!selectedTab || !allAssessments) return [];
    const { grade, classNum, group } = selectedTab;
    return allAssessments.filter(a => {
      if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
      if (a.grade !== grade) return false;

      // classNum=0은 "전체반"(이동수업 그룹 수업) — classCode(그룹)가 있어야 유효
      if (a.classNum === 0) {
        const aGroups = parseClassCode(a.classCode);
        // classCode가 없으면 모순(오류 데이터) — 어느 탭에서도 표시 안 함
        if (aGroups.length === 0) return false;
        // 현재 탭의 group과 classCode가 일치해야 함
        if (!aGroups.includes(group || '')) return false;
      } else {
        // 일반 반 수행평가: 탭의 classNum과 일치해야 함
        if (a.classNum !== classNum) return false;
        // 그룹 탭인 경우 classCode도 확인
        if (group && a.classCode && a.classCode.trim()) {
          const allowedGroups = parseClassCode(a.classCode);
          if (!allowedGroups.includes(group)) return false;
        }
      }

      if (effectiveSubjectFilter && a.subject !== effectiveSubjectFilter) return false;
      return true;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [selectedTab, allAssessments, teacherName, rawTeacherName, taughtSubjects, effectiveSubjectFilter]);

  // 이동수업 수행평가의 강의반명(관리페이지 입력값) 조회 맵
  const lectureClassNameMap = useMemo(() => {
    const map = new Map<string, string>(); // key: `${grade}-${subject}-${classCode}` → className
    const allConfigs = [
      ...(electiveConfigsG2 || []).map((c: any) => ({ ...c, grade: 2 })),
      ...(electiveConfigsG3 || []).map((c: any) => ({ ...c, grade: 3 })),
    ];
    allConfigs.forEach((c: any) => {
      if (!c.classCode || !c.subject) return;
      const codes = c.classCode.split(',').map((s: string) => s.trim()).filter(Boolean);

      // className이 JSON 객체 형식일 수 있음: {"A":"2-3반","C":"2-3반"}
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
        const key = `${c.grade}-${(c.subject || '').trim()}-${code}`;
        // JSON 형식이면 해당 코드의 값, _global fallback, 아니면 일반 문자열 (Dashboard.tsx와 동일한 로직)
        const resolvedName = classNameObj[code] || classNameObj['_global'] || plainClassName;
        if (resolvedName) map.set(key, resolvedName);
      });
    });
    return map;
  }, [electiveConfigsG2, electiveConfigsG3]);

  // Mutate: Create Assessment
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create assessment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-assessments'] });
      toast.success("수행평가가 성공적으로 등록되었습니다.");
      setShowAddDialog(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "등록 실패");
    }
  });

  // Mutate: Update Assessment
  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/assessment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update assessment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-assessments'] });
      toast.success("수행평가가 수정되었습니다.");
      setShowEditDialog(false);
      setSelectedAssessment(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "수정 실패");
    }
  });

  // Mutate: Delete Assessment
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/assessment?id=${id}&role=teacher`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-assessments'] });
      toast.success("수행평가가 삭제되었습니다.");
      setShowEditDialog(false);
      setSelectedAssessment(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "삭제 실패");
    }
  });

  // Handlers
  const handleCellClick = (dayIndex: number, period: number, val: number) => {
    if (!requireAuth()) return; // 미인증 시 인증 다이얼로그 표시

    const decoded = decodeCell(val);
    if (!decoded) return;

    const dateStr = toDateString(weekDates[dayIndex]);
    
    // Resolve group for this cell
    let cellGroup = "";
    if (decoded.grade === 2) {
      cellGroup = computedGroupsG2[`${dayIndex}-${period}`] || "";
    } else if (decoded.grade === 3) {
      cellGroup = computedGroupsG3[`${dayIndex}-${period}`] || "";
    }
    
    // Check if there are assessments already
    const cellAssessments = (allAssessments || []).filter(a => {
      if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
      if (a.grade !== decoded.grade) return false;
      if (a.classNum !== decoded.classNum && a.classNum !== 0) return false;
      if (a.dueDate !== dateStr) return false;
      if (a.classTime !== period) return false;
      
      // Group check matching Dashboard.tsx
      if (a.classCode && a.classCode.trim()) {
        const allowedGroups = a.classCode.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (cellGroup && allowedGroups.length > 0 && !allowedGroups.includes(cellGroup)) {
          return false;
        }
      }
      return true;
    });

    if (cellAssessments.length > 0) {
      // Open edit/view mode for the first assessment in cell (or list them)
      setSelectedAssessment(cellAssessments[0]);
      const roundNum = cellAssessments[0].description ? cellAssessments[0].description.replace("차", "").trim() : "1";
      setFormData({
        assessmentDate: cellAssessments[0].dueDate,
        subject: cellAssessments[0].subject,
        content: cellAssessments[0].title,
        classTime: String(cellAssessments[0].classTime || period),
        round: roundNum,
        teacher: cellAssessments[0].teacher || teacherName,
        classCode: cellAssessments[0].classCode || "",
      });
      setShowEditDialog(true);
    } else {
      // 학년별 선생님 등록 권한 체크
      const isTeacherAllowed = decoded.grade === 1
        ? settings?.assessment_allow_teacher_grade1 !== false
        : decoded.grade === 2
        ? settings?.assessment_allow_teacher_grade2 !== false
        : decoded.grade === 3
        ? settings?.assessment_allow_teacher_grade3 !== false
        : true;

      if (!isTeacherAllowed) {
        toast.error(settings?.assessment_disallow_msg_teacher || "현재 선생님의 수행평가 등록이 제한되어 있습니다.");
        return;
      }

      // Add new
      setSelectedCell({
        weekdayIndex: dayIndex,
        period,
        dateStr,
        grade: decoded.grade,
        classNum: decoded.classNum,
        subjectName: decoded.subjectName,
        cellGroup,
      });
      
      setFormData({
        assessmentDate: dateStr,
        subject: decoded.subjectName,
        content: "",
        classTime: String(period),
        round: "1",
        teacher: teacherName,
        classCode: cellGroup || extractClassCode(decoded.subjectName),
      });
      
      setShowAddDialog(true);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;

    let resolvedDataset = 'COMCIGAN';
    if (selectedCell.grade === 1) {
      resolvedDataset = g1DatasetType;
    } else if (selectedCell.grade === 2) {
      resolvedDataset = g2DatasetType;
    } else if (selectedCell.grade === 3) {
      resolvedDataset = g3DatasetType;
    }

    createMutation.mutate({
      subject: formData.subject,
      title: formData.content,
      description: formData.round ? `${formData.round}차` : "",
      dueDate: formData.assessmentDate,
      grade: selectedCell.grade,
      classNum: selectedCell.classNum,
      classTime: parseInt(formData.classTime, 10),
      dataset: resolvedDataset,
      teacher: formData.teacher,
      classCode: formData.classCode,
      isTeacherCreated: 1,
    });
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessment) return;

    updateMutation.mutate({
      id: selectedAssessment.id,
      subject: formData.subject,
      title: formData.content,
      description: formData.round ? `${formData.round}차` : "",
      dueDate: formData.assessmentDate,
      classTime: parseInt(formData.classTime, 10),
      teacher: formData.teacher,
      classCode: formData.classCode,
    });
  };

  return (
    <div 
      className="w-full min-h-screen md:h-full px-2 md:px-4 py-2 md:py-4 flex flex-col"
      style={{
        backgroundColor: '#f6e7c9',
        backgroundImage: `
          radial-gradient(ellipse at 50% 0%, rgba(255, 254, 248, 0.7) 0%, rgba(232, 212, 178, 0.88) 100%),
          url("data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='organicWood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.005 0.07' numOctaves='4' result='noise'/%3E%3CfeColorMatrix type='matrix' values='0.7 0.35 0.12 0 0  0.55 0.3 0.1 0 0  0.35 0.2 0.05 0 0  0 0 0 0.17 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23organicWood)'/%3E%3C/svg%3E")
        `,
        backgroundAttachment: 'fixed',
      }}
    >
      {/* ===== 선생님별 인증 다이얼로그 ===== */}
      <Dialog open={showAuthDialog} onOpenChange={(open) => { setShowAuthDialog(open); if (!open) { setAuthError(""); setAuthPassword(""); } }}>
        <DialogContent className="sm:max-w-[360px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white">
            <DialogHeader>
              <DialogTitle className="text-base font-extrabold text-white flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {teacherName} 선생님 인증
              </DialogTitle>
            </DialogHeader>
            <p className="text-emerald-100 text-xs mt-1">수행평가 등록·수정 권한이 필요합니다</p>
          </div>
          <form onSubmit={handleTeacherAuth} className="p-5 space-y-4">
            <div className="relative">
              <input
                type={showAuthPassword ? "text" : "password"}
                value={authPassword}
                onChange={(e) => { setAuthPassword(e.target.value); setAuthError(""); }}
                placeholder="비밀번호 입력"
                autoFocus
                autoComplete="current-password"
                className="w-full h-11 px-4 pr-11 rounded-xl border-2 border-amber-200 bg-white text-gray-800 text-sm font-medium placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowAuthPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1">
                {showAuthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {authError && (
              <p className="text-red-500 text-xs text-center flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />{authError}
              </p>
            )}
            <button type="submit"
              className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98] transition-all">
              인증하기
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== 보기전용 배너 (미인증 시) — 모바일 전용 fixed ===== */}
      {settings !== undefined && !isCurrentTeacherVerified && (
        <div
          className="md:hidden fixed bottom-4 left-4 right-4 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-sm"
          style={{
            background: 'linear-gradient(135deg, #e8e8e8 0%, #c8c8c8 40%, #a8a8a8 100%)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <svg className="w-4 h-4 shrink-0" style={{ color: '#4b5563' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span className="text-sm font-semibold leading-relaxed flex-1" style={{ color: '#1f2937' }}>
            보기 전용<br />등록·수정하려면 인증하세요
          </span>
          <button
            onClick={() => setShowAuthDialog(true)}
            className="shrink-0 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors"
          >
            인증하기
          </button>
        </div>
      )}

      <div className="max-w-[1240px] mx-auto w-full flex-1 flex flex-col min-h-0">


        {/* ===== TOP SECTION: Title + Description + Desktop Week Selector + Shortcut ===== */}
        <div className="flex items-center gap-2 mb-2 md:mb-0 flex-shrink-0">
          {/* Left: title + description — shrinks when space is tight */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-3">
              <h1 className="text-base sm:text-xl md:text-3xl font-extrabold text-gray-900 truncate leading-tight shrink-0">
                <span className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 bg-clip-text text-transparent hidden md:inline">교사용 수행평가 등록 시스템</span>
                <span className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 bg-clip-text text-transparent md:hidden"> </span>
              </h1>
            </div>
            <p className="hidden md:block text-gray-500 text-xs sm:text-sm mt-0.5 truncate">
              시간표에서 수업이 들어있는 칸을 클릭하여 수행평가를 간편하게 등록하고 관리할 수 있습니다.
            </p>
          </div>

          {/* Right: PC Week Selector + Shortcut button — shrink-0 so they always take priority */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {/* Desktop Week Selector */}
            <div className="flex items-center bg-indigo-600 rounded-full p-1 border border-indigo-400 shadow-md">
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 rounded-full text-white hover:bg-white/25 active:bg-white/40 focus:bg-transparent focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:opacity-40 select-none cursor-pointer"
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                onClick={(e) => {
                  setWeekOffset(prev => prev - 1);
                  (e.currentTarget as HTMLElement).blur();
                }}
                disabled={weekOffset <= -2}
                title="이전 주"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex flex-col items-center min-w-[90px] px-1 select-none">
                <span className={`text-sm font-bold leading-tight whitespace-nowrap ${weekOffset === 0 ? 'text-white' : 'text-yellow-300'}`}>
                  {weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : weekOffset < 0 ? `${Math.abs(weekOffset)}주 전` : `${weekOffset}주 후`}
                </span>
                <span className="text-[10px] font-medium text-white/80 leading-tight whitespace-nowrap">{weekRangeText}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 rounded-full text-white hover:bg-white/25 active:bg-white/40 focus:bg-transparent focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:opacity-40 select-none cursor-pointer"
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                onClick={(e) => {
                  setWeekOffset(prev => prev + 1);
                  (e.currentTarget as HTMLElement).blur();
                }}
                disabled={weekOffset >= 8}
                title="다음 주"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* PC Only Desktop Shortcut Button */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full shadow-sm gap-1.5 text-xs md:text-sm bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              onClick={() => {
                downloadDesktopShortcut("교사용_수행평가_등록시스템");
                toast.success("바탕화면 바로가기(.url) 파일이 다운로드되었습니다. 다운로드된 파일을 바탕화면으로 옮겨서 사용하세요.");
              }}
              title="PC 바탕화면에 바로가기 파일 다운로드"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>바탕화면에 바로가기 추가</span>
            </Button>
          </div>

          {/* Mobile only: shortcut placeholder (empty — mobile has its own layout) */}
          <div className="md:hidden flex items-center gap-1.5 shrink-0" />
        </div>



        {/* ===== CONTENT AREA: flex-col on mobile (panel top, title+week, table bottom), flex-row on desktop ===== */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 xl:gap-6 items-start md:items-stretch flex-1 min-h-0">

        {/* ===== MOBILE ONLY: Title + Week nav row — order-1 (above timetable) ===== */}
        <div className="md:hidden w-full order-1 flex items-center justify-between gap-2 px-0.5 shrink-0">
          <h2 className="text-lg font-extrabold truncate leading-tight">
            <span className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 bg-clip-text text-transparent">교사용 수행평가 등록 시스템</span>
          </h2>
          <div className="flex items-center bg-indigo-600 rounded-full p-1 border border-indigo-400 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="w-7 h-7 p-0 rounded-full text-white hover:bg-white/25 active:bg-white/40 focus:bg-transparent focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:opacity-40 select-none"
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              onClick={(e) => {
                setWeekOffset(prev => prev - 1);
                (e.currentTarget as HTMLElement).blur();
              }}
              disabled={weekOffset <= -2}
              title="이전 주"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex flex-col items-center min-w-[82px] px-1 select-none">
              <span className={`text-sm font-bold leading-tight whitespace-nowrap ${weekOffset === 0 ? 'text-white' : 'text-yellow-300'}`}>
                {weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : weekOffset < 0 ? `${Math.abs(weekOffset)}주 전` : `${weekOffset}주 후`}
              </span>
              <span className="text-[10px] font-medium text-white/80 leading-tight whitespace-nowrap">{weekRangeText}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="w-7 h-7 p-0 rounded-full text-white hover:bg-white/25 active:bg-white/40 focus:bg-transparent focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:opacity-40 select-none"
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              onClick={(e) => {
                setWeekOffset(prev => prev + 1);
                (e.currentTarget as HTMLElement).blur();
              }}
              disabled={weekOffset >= 8}
              title="다음 주"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ===== TIMETABLE COLUMN: order-2 on mobile, order-1 on desktop ===== */}
        <div className="w-full md:flex-1 md:max-w-[850px] min-w-0 flex flex-col order-2 md:order-1 flex-1 min-h-0">


      {/* Main Timetable — Card wrapper */}
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto flex-1 flex flex-col md:h-[calc(100vh-115px)] md:min-h-[600px]">
          {(isTimetableLoading || isGroupDataLoading) ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-[40px] w-full" />
              <Skeleton className="h-[400px] w-full" />
            </div>
          
          ) : isTimetableError ? (
            <div className="text-center py-16 text-red-500 bg-red-50 rounded-lg m-6 flex flex-col items-center justify-center gap-2">
              <AlertCircle className="w-8 h-8" />
              <span className="font-bold">컴시간알리미 데이터 로드 실패</span>
              <p className="text-sm text-red-400">네트워크 연결 상태를 확인하고 잠시 후 다시 시도해 주세요.</p>
            </div>
          ) : timetableData && selectedSchedule ? (
            <div className="w-full overflow-x-auto flex-1 flex flex-col min-h-0">
              <table className="w-full table-fixed min-w-[340px] flex-1 h-full" style={{ borderCollapse: 'collapse', background: '#ffffff', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {/* Corner cell — empty (no 교시 label) */}
                    <th style={{ width: 36, height: 30, background: '#f2f2f2', borderRight: '1px solid #d0d0d0', borderBottom: '1px solid #d0d0d0', position: 'sticky', top: 0, zIndex: 2 }} />
                    {weekdays.map((day, idx) => {
                      const dDate = weekDates[idx];
                      const todayStr = toDateString(new Date());
                      const isToday = toDateString(dDate) === todayStr;
                      const dayNum = dDate.getDate();
                      return (
                        <th
                          key={day}
                          style={{
                            height: 30,
                            background: isToday ? '#cee8d0' : '#f2f2f2',
                            borderRight: '1px solid #d0d0d0',
                            borderBottom: isToday ? '2px solid #217346' : '1px solid #d0d0d0',
                            color: isToday ? '#1a5c30' : '#595959',
                            fontWeight: 700,
                            fontSize: 12,
                            textAlign: 'center',
                            userSelect: 'none',
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                          }}
                        >
                          {day}({dayNum})
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxPeriods }).map((_, periodIndex) => {
                    const p = periodIndex + 1;
                    const isCurrentPeriod = currentPeriod === p && weekOffset === 0;
                    return (
                      <tr key={p} className="h-[52px] md:h-[calc((100vh-150px)/7)] md:min-h-[84px]">
                        {/* Row number cell — Excel row header */}
                        <td
                          className="h-[52px] md:h-[calc((100vh-150px)/7)] md:min-h-[84px] overflow-hidden"
                          style={{
                            width: 36,
                            background: isCurrentPeriod ? '#cee8d0' : '#f2f2f2',
                            borderRight: isCurrentPeriod ? '2px solid #217346' : '1px solid #d0d0d0',
                            borderBottom: '1px solid #d0d0d0',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            userSelect: 'none',
                            padding: '2px 0',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 12, color: isCurrentPeriod ? '#1a5c30' : '#595959', lineHeight: 1.2 }}>{p}</div>
                          {PERIOD_TIMES[p] && (
                            <div style={{ fontSize: 8, color: isCurrentPeriod ? '#1a5c30' : '#999', lineHeight: 1.2, marginTop: 1 }}>({PERIOD_TIMES[p]})</div>
                          )}
                        </td>
                        {weekdays.map((_, dayIndex) => {
                          const d = dayIndex + 1;
                          const val = selectedSchedule[d]?.[p];
                          const cellData = decodeCell(val);
                          const cellDateStr = toDateString(weekDates[dayIndex]);

                          // Resolve group
                          let cellGroup = "";
                          if (cellData) {
                            if (cellData.grade === 2) cellGroup = computedGroupsG2[`${dayIndex}-${p}`] || "";
                            else if (cellData.grade === 3) cellGroup = computedGroupsG3[`${dayIndex}-${p}`] || "";
                          }

                          // Assessments
                          const cellAssessments = cellData ? (allAssessments || []).filter(a => {
                            if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
                            if (a.grade !== cellData.grade) return false;
                            if (a.classNum !== cellData.classNum && a.classNum !== 0) return false;
                            if (a.dueDate !== cellDateStr) return false;
                            if (a.classTime !== p) return false;
                            if (a.classCode && a.classCode.trim()) {
                              const ag = a.classCode.split(",").map((s: string) => s.trim()).filter(Boolean);
                              if (cellGroup && ag.length > 0 && !ag.includes(cellGroup)) return false;
                            }
                            return true;
                          }) : [];
                          const hasAssessment = cellAssessments.length > 0;

                          // Clean cell background (no today column background tint):
                          const baseBg = '#ffffff';
                          const classBg = hasAssessment ? '#fff5f7' : '#ffffff';
                          const cellBg = cellData ? classBg : baseBg;

                          return (
                            <td
                              key={d}
                              className="group h-[52px] md:h-[calc((100vh-150px)/7)] md:min-h-[84px] overflow-hidden"
                              style={{
                                background: cellBg,
                                borderRight: '1px solid #d0d0d0',
                                borderBottom: '1px solid #d0d0d0',
                                borderLeft: hasAssessment ? '2px solid #ec4899' : '1px solid #d0d0d0',
                                padding: '4px 5px',
                                verticalAlign: 'top',
                                cursor: cellData ? 'pointer' : 'default',
                                transition: 'outline 0.08s',
                                outline: 'none',
                                position: 'relative',
                              }}
                              onClick={() => cellData && handleCellClick(dayIndex, p, val)}
                              onMouseEnter={e => {
                                if (cellData) {
                                  (e.currentTarget as HTMLElement).style.outline = hasAssessment ? '2px solid #ec4899' : '2px solid #217346';
                                  (e.currentTarget as HTMLElement).style.zIndex = '1';
                                }
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.outline = 'none';
                                (e.currentTarget as HTMLElement).style.zIndex = 'auto';
                              }}
                            >
                              {cellData ? (
                                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
                                  {/* Class label */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{
                                      fontSize: 9,
                                      fontWeight: 700,
                                      padding: '1px 4px',
                                      borderRadius: 2,
                                      background: '#217346',
                                      color: '#ffffff',
                                      display: 'inline-block',
                                      lineHeight: 1.4,
                                      width: 'fit-content',
                                    }}>
                                      {(() => {
                                        if (!cellGroup) return `${cellData.grade}-${cellData.classNum}`;
                                        // 이동수업: 관리페이지 강의실 이름 조회
                                        const configName = lectureClassNameMap.get(`${cellData.grade}-${(cellData.subjectName || '').trim()}-${cellGroup}`);
                                        // 강의실 이름이 없으면 학년-반 표시, 있으면 강의실 이름만 표시 (그룹 기호는 과목명 뒤에 별도 표시)
                                        return configName ? configName : `${cellData.grade}-${cellData.classNum}`;
                                      })()}
                                    </span>
                                    <span style={{
                                      fontWeight: 700,
                                      color: '#1a1a1a',
                                      lineHeight: 1.3,
                                      fontSize: (cellData.subjectName || '').length > 6 ? 9 : (cellData.subjectName || '').length > 4 ? 10 : 12,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '100%',
                                    }}
                                      title={cellData.subjectName}
                                    >
                                      {cellGroup && (() => {
                                        const gc = getGroupColor(cellGroup);
                                        return <span style={{ color: gc, fontWeight: 900, marginRight: 3, WebkitTextStroke: '0.4px rgba(255,255,255,0.9)', textShadow: `0 1px 3px ${gc}70`, letterSpacing: '-0.01em' }}>{cellGroup}</span>;
                                      })()}{cellData.subjectName}
                                    </span>
                                  </div>

                                  {/* Assessment badges — uncolored (white/transparent background) with pink border, positioned directly below subject name */}
                                  {hasAssessment ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 1 }}>
                                      {cellAssessments.map(a => (
                                        <div
                                          key={a.id}
                                          style={{
                                            fontSize: 8,
                                            fontWeight: 700,
                                            padding: '1px 4px',
                                            borderRadius: 3,
                                            background: '#ffffff',
                                            border: '1px solid #ec4899',
                                            color: '#db2777',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 2,
                                            lineHeight: 1.4,
                                          }}
                                          title={`[${a.description || '수행'}] ${a.title}`}
                                        >
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.title}</span>
                                          <span style={{ fontSize: 7, border: '1px solid #f472b6', color: '#be185d', padding: '0 3px', borderRadius: 2, flexShrink: 0, whiteSpace: 'nowrap', background: '#fdf2f8' }}>
                                            {a.description && a.description.includes('차') ? a.description : '평가'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="opacity-0 group-hover:opacity-100" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 'auto', transition: 'opacity 0.12s' }}>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: '#217346', display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Plus style={{ width: 10, height: 10 }} /> 등록
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
      </div>

      </div>{/* end timetable column */}

      {/* ===== RIGHT PANEL: order-3 on mobile (below timetable), order-2 on desktop (right, sticky) ===== */}
      <div className="w-full md:w-[320px] xl:w-[360px] shrink-0 flex flex-col order-3 md:order-2 md:sticky md:top-4 h-fit">
        <div className="md:rounded-2xl md:border md:border-slate-200 md:bg-white md:shadow-md md:overflow-hidden flex flex-col h-fit md:max-h-[calc(100vh-2rem)]">
          {/* Teacher Picker — slim bar, no colored banner */}
          <div className="px-1 md:px-3 py-2 border-b border-slate-100 flex-shrink-0 flex items-center justify-between gap-2">
            {timetableData ? (
              <button
                type="button"
                onClick={() => {
                  setTeacherSearchQuery("");
                  setShowTeacherSelectModal(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 font-extrabold text-sm tracking-tight leading-tight transition-colors border border-indigo-200 focus:outline-none cursor-pointer group max-w-full"
              >
                <span className="truncate">
                  {selectedTeacherId
                    ? `${teacherOptions.find(o => o.idx.toString() === selectedTeacherId)?.label || getTeacherDisplayName(timetableData.teachers[parseInt(selectedTeacherId, 10)], parseInt(selectedTeacherId, 10))} 선생님`
                    : "교사 선택"}
                </span>
                <ChevronsUpDown className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600 shrink-0 ml-0.5" />
              </button>
            ) : (
              <span className="text-sm font-extrabold text-slate-700">
                {teacherName ? `${teacherName} 선생님` : '선생님'}
              </span>
            )}
          </div>

          {/* Subject Bookmark Tabs */}
          {subjectTabs.length > 1 && (
            <div className="flex-shrink-0 bg-white border-b border-slate-200">
              <div className="flex w-full">
                {subjectTabs.map((subject, idx) => {
                  const colorIdx = idx % BOOKMARK_COLORS.length;
                  const color = BOOKMARK_COLORS[colorIdx];
                  const isActive = effectiveSubjectFilter === subject;
                  return (
                    <button
                      key={subject}
                      onPointerDown={(e) => {
                        // Record pointer position on down
                        (e.currentTarget as any)._tapStartX = e.clientX;
                        (e.currentTarget as any)._tapStartY = e.clientY;
                      }}
                      onPointerUp={(e) => {
                        // Only count as tap if pointer didn't move much (not a scroll)
                        const dx = e.clientX - ((e.currentTarget as any)._tapStartX ?? e.clientX);
                        const dy = e.clientY - ((e.currentTarget as any)._tapStartY ?? e.clientY);
                        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
                          setSelectedSubjectFilter(subject);
                        }
                      }}
                      className="flex-1 py-2 px-1 text-[11px] font-bold leading-tight text-center"
                      style={{
                        color: isActive ? '#fff' : color.activeBg,
                        backgroundColor: isActive ? `${color.activeBg}BF` : `${color.bg}20`,
                        borderBottom: `3px solid ${isActive ? color.activeBg : `${color.activeBg}30`}`,
                        WebkitTapHighlightColor: 'transparent',
                        touchAction: 'manipulation',
                        userSelect: 'none',
                      }}
                    >
                      {subject}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Class Navigation Tabs — hidden when no classes match selected subject */}
          {filteredClassTabs.length > 0 && (
            <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50">
              <div
                ref={tabContainerRef}
                onMouseDown={handleTabMouseDown}
                onMouseLeave={handleTabMouseLeave}
                onMouseUp={handleTabMouseUp}
                onMouseMove={handleTabMouseMove}
                className="flex gap-1 overflow-x-auto px-1 md:px-3 py-2 scrollbar-hide select-none cursor-grab active:cursor-grabbing"
                style={{ scrollbarWidth: 'none' }}
              >
                {filteredClassTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (isDraggingTabsRef.current) return;
                      setSelectedTabId(tab.id);
                    }}
                    className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-all duration-150
                      ${
                        selectedTabId === tab.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                  >
                    {tab.group
                      ? (() => {
                          const configName = lectureClassNameMap.get(`${tab.grade}-${(effectiveSubjectFilter || '').trim()}-${tab.group}`);
                          return configName ? `${configName}(${tab.group})` : `(${tab.group})`;
                        })()
                      : tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assessment List */}
          <div className="overflow-y-auto px-1 md:px-4 py-2.5 md:max-h-[calc(100vh-200px)]">
            {isAssessmentsLoading ? (
              <div className="space-y-2 mt-1">
                {[1,2].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : panelAssessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-5 text-slate-400">
                <span className="text-2xl mb-1">📭</span>
                <p className="text-xs font-medium">등록된 수행평가가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-0 md:space-y-2">
                {panelAssessments.map(a => {
                  const dateObj = new Date(a.dueDate);
                  const mmdd = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                  const weekdayNames = ['일','월','화','수','목','금','토'];
                  const wd = weekdayNames[dateObj.getDay()];
                  return (
                    <div
                      key={a.id}
                      className="border-b border-slate-100/80 last:border-b-0 md:border md:border-slate-100 py-2.5 px-1 md:p-3 md:rounded-xl md:bg-slate-50 hover:bg-indigo-50/60 md:hover:border-indigo-200 transition-all duration-150 cursor-pointer"
                      onClick={() => {
                        if (!requireAuth()) return; // 미인증 시 인증 다이얼로그
                        setSelectedAssessment(a);
                        const roundNum = a.description ? a.description.replace('차', '').trim() : '1';
                        setFormData({
                          assessmentDate: a.dueDate,
                          subject: a.subject,
                          content: a.title,
                          classTime: String(a.classTime || ''),
                          round: roundNum,
                          teacher: a.teacher || teacherName,
                          classCode: a.classCode || '',
                        });
                        setShowEditDialog(true);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                              {(() => {
                                if (a.classNum !== 0) return `${a.grade}-${a.classNum}반`;
                                const codes = parseClassCode(a.classCode);
                                if (codes.length === 0) return `${a.grade}-전체반`;
                                const classNames = codes
                                  .map((code: string) => lectureClassNameMap.get(`${a.grade}-${(a.subject || '').trim()}-${code}`))
                                  .filter(Boolean);
                                const uniqueNames = (classNames as string[]).filter((v, i, arr) => arr.indexOf(v) === i);
                                if (uniqueNames.length > 0) {
                                  return codes.length === 1
                                    ? `${uniqueNames[0]}(${codes[0]})`
                                    : uniqueNames.join(', ');
                                }
                                // 강의실 이름 없을 경우 그룹코드만 표시 (raw data fallback 금지)
                                return codes.length === 1 ? `(${codes[0]})` : `(${codes.join(', ')})`;
                              })()}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                              {a.subject}
                            </span>
                            {a.classTime && (
                              <span className="text-[10px] text-slate-400 font-medium">{a.classTime}교시</span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-800 leading-tight truncate" title={a.title}>
                            {a.title}
                          </p>
                          {a.teacher && (
                            <p className="hidden md:block text-[10px] text-slate-400 mt-0.5">{a.teacher} 선생님</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {/* Mobile: date + day on one line */}
                          <div className="md:hidden text-[11px] font-extrabold text-indigo-600 whitespace-nowrap">
                            {mmdd} <span className="font-semibold text-slate-400">({wd})</span>
                          </div>
                          {/* Desktop: stacked */}
                          <div className="hidden md:block text-[11px] font-extrabold text-indigo-600">{mmdd}</div>
                          <div className="hidden md:block text-[9px] text-slate-400">{wd}요일</div>
                          {a.description && (
                            <div className="mt-1 flex justify-end">
                              <span className="text-[10px] bg-indigo-600 text-white rounded-md px-1.5 py-0.5 font-extrabold whitespace-nowrap shadow-xs">
                                {a.description}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>{/* end inner card */}

        {/* ===== PC 전용: 보기전용 배너 (우측 패널 하단) ===== */}
        {settings !== undefined && !isCurrentTeacherVerified && (
          <div
            className="hidden md:flex items-center gap-3 mt-2 px-4 py-3 rounded-2xl backdrop-blur-sm"
            style={{
              background: 'linear-gradient(135deg, #e8e8e8 0%, #c8c8c8 40%, #a8a8a8 100%)',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.7)',
            }}
          >
            <svg className="w-4 h-4 shrink-0" style={{ color: '#4b5563' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-sm font-semibold leading-tight flex-1" style={{ color: '#1f2937' }}>
              보기 전용<br />등록·수정하려면 인증하세요
            </span>
            <button
              onClick={() => setShowAuthDialog(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-colors"
            >
              인증하기
            </button>
          </div>
        )}
        </div>{/* end right panel */}

        </div>{/* end content area */}
      </div>{/* end max-w wrapper */}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              수행평가 등록
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddSubmit} className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">일시</label>
                <div className="h-10 px-3.5 bg-slate-100/70 border border-slate-200/80 rounded-lg text-sm font-bold text-slate-800 flex items-center select-none">
                  {formatDateWithDay(formData.assessmentDate, formData.classTime)}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">차수</label>
                <select
                  className="flex h-10 w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.round}
                  onChange={(e) => setFormData({ ...formData, round: e.target.value })}
                >
                  {[1, 2, 3, 4].map((r) => (
                    <option key={r} value={r.toString()}>{r}차 수행</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">과목</label>
                <div className="h-10 px-3.5 bg-slate-100/70 border border-slate-200/80 rounded-lg text-sm font-bold text-slate-800 flex items-center select-none">
                  {formData.subject}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">대상 반</label>
                <div className="h-10 px-3.5 bg-slate-100/70 border border-slate-200/80 rounded-lg text-sm font-bold text-slate-800 flex items-center select-none">
                  {(() => {
                    const grade = selectedCell?.grade;
                    const classNum = selectedCell?.classNum;
                    const subject = formData.subject;
                    const classCode = formData.classCode;
                    if (!classCode) return grade && classNum ? `${grade}-${classNum}반` : '공통';
                    const codes = parseClassCode(classCode);
                    if (codes.length === 0) return grade && classNum ? `${grade}-${classNum}반` : '공통';
                    const classNames = codes
                      .map((code: string) => lectureClassNameMap.get(`${grade}-${(subject || '').trim()}-${code}`))
                      .filter(Boolean) as string[];
                    const uniqueNames = classNames.filter((v, i, arr) => arr.indexOf(v) === i);
                    if (uniqueNames.length > 0) {
                      return codes.length === 1 ? `${uniqueNames[0]}(${codes[0]})` : uniqueNames.length > 0 ? uniqueNames.join(', ') : `(${codes.join(', ')})`;
                    }
                    return codes.length === 1 ? `(${codes[0]})` : uniqueNames.length > 0 ? uniqueNames.join(', ') : `(${codes.join(', ')})`;
                  })()}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">수행평가 내용 (주제/제목)</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="예: 다항식의 계산 서술형 평가"
                required
                rows={3}
                className="text-sm border-gray-200"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
                취소
              </Button>
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold" disabled={createMutation.isPending}>
                {createMutation.isPending ? "등록 중..." : "등록하기"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit/Delete Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center justify-between gap-2 border-b pb-2">
              <span className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-500" />
                수행평가 상세 및 수정
              </span>
              {selectedAssessment && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1 rounded-full p-2 h-auto"
                  onClick={() => {
                    if (window.confirm("이 수행평가를 정말 삭제하시겠습니까?")) {
                      deleteMutation.mutate(selectedAssessment.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                  삭제
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateSubmit} className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">일시</label>
                <div className="h-10 px-3.5 bg-slate-100/70 border border-slate-200/80 rounded-lg text-sm font-bold text-slate-800 flex items-center select-none">
                  {formatDateWithDay(formData.assessmentDate, formData.classTime)}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">차수</label>
                <select
                  className="flex h-10 w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.round}
                  onChange={(e) => setFormData({ ...formData, round: e.target.value })}
                >
                  {[1, 2, 3, 4].map((r) => (
                    <option key={r} value={r.toString()}>{r}차 수행</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">과목</label>
                <div className="h-10 px-3.5 bg-slate-100/70 border border-slate-200/80 rounded-lg text-sm font-bold text-slate-800 flex items-center select-none">
                  {formData.subject}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">대상 반</label>
                <div className="h-10 px-3.5 bg-slate-100/70 border border-slate-200/80 rounded-lg text-sm font-bold text-slate-800 flex items-center select-none">
                  {(() => {
                    const grade = selectedAssessment?.grade;
                    const classNum = selectedAssessment?.classNum;
                    const subject = formData.subject;
                    const classCode = formData.classCode;
                    if (!classCode) return grade && classNum ? `${grade}-${classNum}반` : '공통';
                    const codes = parseClassCode(classCode);
                    if (codes.length === 0) return grade && classNum ? `${grade}-${classNum}반` : '공통';
                    const classNames = codes
                      .map((code: string) => lectureClassNameMap.get(`${grade}-${(subject || '').trim()}-${code}`))
                      .filter(Boolean) as string[];
                    const uniqueNames = classNames.filter((v, i, arr) => arr.indexOf(v) === i);
                    if (uniqueNames.length > 0) {
                      return codes.length === 1 ? `${uniqueNames[0]}(${codes[0]})` : uniqueNames.length > 0 ? uniqueNames.join(', ') : `(${codes.join(', ')})`;
                    }
                    return codes.length === 1 ? `(${codes[0]})` : uniqueNames.length > 0 ? uniqueNames.join(', ') : `(${codes.join(', ')})`;
                  })()}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">수행평가 내용 (주제/제목)</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="수행평가 내용 입력"
                required
                rows={3}
                className="text-sm border-gray-200"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowEditDialog(false)}>
                취소
              </Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "저장 중..." : "수정 완료"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Clean Teacher Selection Popup Dialog */}
      <Dialog open={showTeacherSelectModal} onOpenChange={setShowTeacherSelectModal}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
          {/* Modal Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 sm:px-5 sm:py-4 text-white">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg font-extrabold text-white">
                선생님 선택
              </DialogTitle>
            </DialogHeader>
            <p className="text-indigo-100 text-[11px] sm:text-xs mt-0.5 font-medium">
              시간표 및 수행평가 목록을 조회할 선생님을 선택해 주세요.
            </p>
          </div>

          {/* Search Bar */}
          <div className="p-2.5 sm:p-3 bg-slate-50 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="선생님 이름 또는 과목 검색..."
                value={teacherSearchQuery}
                onChange={(e) => setTeacherSearchQuery(e.target.value)}
                className="pl-9 pr-8 bg-white border-slate-200 text-sm h-9 sm:h-10 rounded-xl focus-visible:ring-indigo-500"
                autoFocus
              />
              {teacherSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTeacherSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Teacher List */}
          <div className="max-h-[240px] sm:max-h-[340px] overflow-y-auto p-2 space-y-1">
            {filteredTeacherOptions.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-sm font-medium">검색 결과가 없습니다.</p>
              </div>
            ) : (
              filteredTeacherOptions.map((opt) => {
                const isSelected = selectedTeacherId === opt.idx.toString();
                return (
                  <button
                    key={opt.idx}
                    type="button"
                    onClick={() => {
                      setSelectedTeacherId(opt.idx.toString());
                      setShowTeacherSelectModal(false);
                      setTeacherSearchQuery("");
                      toast.success(`${opt.displayName} 선생님이 선택되었습니다.`);
                    }}
                    className={cn(
                      "w-full text-left px-3.5 py-3 rounded-xl flex items-center justify-between transition-all duration-150 gap-2 border",
                      isSelected
                        ? "bg-indigo-50/90 border-indigo-200 text-indigo-900 font-bold shadow-xs"
                        : "bg-white border-transparent hover:bg-slate-50 text-slate-800 font-medium active:bg-slate-100"
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold truncate">{opt.displayName} 선생님</span>
                      {opt.subjects && opt.subjects.length > 0 && (
                        <span className="text-xs text-slate-400 font-normal truncate mt-0.5">
                          {opt.subjects.join(", ")}
                        </span>
                      )}
                    </div>

                    {isSelected ? (
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-semibold px-2.5 py-1 rounded-md bg-slate-100 shrink-0">
                        선택
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
