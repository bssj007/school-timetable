import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus, Calendar, Trash2, Edit, AlertCircle, Home, Search, X, ChevronsUpDown, Check, Download, Eye, EyeOff, ArrowLeft, ArrowRight, User, BookOpen, FileText, CalendarDays, Link2, Clock, BookMarked, Bell, UtensilsCrossed, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { clearRoleCookie } from "@/components/RoleSelectDialog";

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
  activityType?: string;
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

/** 그룹코드(A, B, C ...) 스타일 span — 메인 표/패널 공용 */
function renderGroupCode(code: string, marginRight: number = 3): React.ReactElement {
  const gc = getGroupColor(code);
  return (
    <span style={{
      color: gc,
      fontWeight: 900,
      marginRight,
      WebkitTextStroke: '0.4px rgba(255,255,255,0.9)',
      textShadow: `0 1px 3px ${gc}70`,
      letterSpacing: '-0.01em',
    } as React.CSSProperties}>
      {code}
    </span>
  );
}


export default function TeacherPage() {
  const queryClient = useQueryClient();
  const { refreshRole } = useUserConfig();
  const [, setLocation] = useLocation();

  const handleReturnToStudentPage = () => {
    // 자동 리다이렉션 쿠키만 삭제 (sj_user_role, sj_teacher_name)
    clearRoleCookie();
    refreshRole();
    toast.success("학생용 페이지로 이동합니다.");
    window.location.href = "/";
  };
  
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

  // ── 모바일 뷰 모드 선택기 ──
  type MobileViewMode = 'daily' | 'homework' | 'calendar';
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('daily');
  // 달력에서 클릭한 날짜 (당일형 이동용)
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);
  // 달력 표시 월 (기본: 이번 달)
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // month: 0-indexed
  });

  // ── 숙제형 폼 상태 ──
  const [hwForm, setHwForm] = useState({
    subject: '',
    classNum: '',
    startDate: '',
    dueDate: '',
    title: '',
    content: '',
    link: '',
    activityType: '수행평가',
  });
  // 숙제형 wizard 페이지 (1 | 2)
  const [hwPage, setHwPage] = useState<1 | 2>(1);

  // ── 달력 드래그 선택 상태 ──
  const [calDragStart, setCalDragStart] = useState<string | null>(null);
  const [calDragEnd, setCalDragEnd] = useState<string | null>(null);
  const calIsDragging = calDragStart !== null;
  // 달력 그리드 컨테이너 ref (좌표 기반 month-nav 감지용)
  const calGridRef = useRef<HTMLDivElement>(null);
  const lastMonthSwitchTimeRef = useRef<number>(0);

  const [formData, setFormData] = useState({
    assessmentDate: "",
    subject: "",
    content: "",
    classTime: "",
    round: "1",
    teacher: "",
    classCode: "",
    activityType: "수행평가",
  });


  // 달력 탭 진입 시 항상 이번 달로 초기화
  useEffect(() => {
    if (mobileViewMode === 'calendar') {
      const now = new Date();
      setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
    }
    // 당일형이 아닌 탭으로 전환 시 weekOffset을 디폴트(오늘 기준)로 초기화
    if (mobileViewMode !== 'daily') {
      const today = new Date();
      const day = today.getDay();
      setWeekOffset((day === 0 || day === 6) ? 1 : 0);
    }
    // 숙제형 탭 전환 시 wizard 페이지 리셋
    if (mobileViewMode === 'homework') setHwPage(1);
  }, [mobileViewMode]);


  useEffect(() => {
    localStorage.setItem("teacher-page-selected-teacher", selectedTeacherId);
  }, [selectedTeacherId]);

  // PC 하단 흰 공백 방지: body 배경을 TeacherPage 배경과 일치시킴
  // TeacherPage 최상위 div가 h-screen으로 잘릴 때 그 아래 body 영역이 노출되기 때문
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevBgImage = document.body.style.backgroundImage;
    const prevBgAttachment = document.body.style.backgroundAttachment;
    document.body.style.backgroundColor = '#f6e7c9';
    document.body.style.backgroundImage = [
      "radial-gradient(ellipse at 50% 0%, rgba(255,254,248,0.7) 0%, rgba(232,212,178,0.88) 100%)",
      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='organicWood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.005 0.07' numOctaves='4' result='noise'/%3E%3CfeColorMatrix type='matrix' values='0.7 0.35 0.12 0 0  0.55 0.3 0.1 0 0  0.35 0.2 0.05 0 0  0 0 0 0.17 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23organicWood)'/%3E%3C/svg%3E\")",
    ].join(', ');
    document.body.style.backgroundAttachment = 'fixed';
    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.backgroundImage = prevBgImage;
      document.body.style.backgroundAttachment = prevBgAttachment;
    };
  }, []);

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
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // 점검 모드 감지 시 강제 새로고침 (Edge 차단 페이지로 전환 및 로드된 데이터 클리어)
  useEffect(() => {
    if (settings?.maintenance_mode?.active && !settings?.is_whitelisted) {
      window.location.reload();
    }
  }, [settings?.maintenance_mode?.active, settings?.is_whitelisted]);

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

  // 날짜 범위 밖 여부 — 3개 학년 중 하나라도 COMCIGAN+isOutOfRange이면 미확정
  // 아카이브 데이터가 있는 경우 미확정 표시 안 함
  const isOutOfDateRange = (
    (g1DatasetType === 'COMCIGAN' && !!grade1Timetable?.isOutOfRange && !grade1Timetable?.isArchivedData) ||
    (g2DatasetType === 'COMCIGAN' && !!grade2Timetable?.isOutOfRange && !grade2Timetable?.isArchivedData) ||
    (g3DatasetType === 'COMCIGAN' && !!grade3Timetable?.isOutOfRange && !grade3Timetable?.isArchivedData)
  );

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

  // 과목이 1개밖에 없는 경우 숙제형 폼의 과목 자동 선택
  useEffect(() => {
    if (taughtSubjects && taughtSubjects.length === 1) {
      setHwForm(f => {
        if (f.subject !== taughtSubjects[0]) {
          return { ...f, subject: taughtSubjects[0], classNum: '' };
        }
        return f;
      });
    }
  }, [taughtSubjects]);

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

  // 숙제형 폼: 선택된 과목에 해당하는 반 목록 (시간표 기반)
  const classesForHwSubject = useMemo(() => {
    if (!selectedSchedule || !hwForm.subject) return [];
    const result = new Map<string, { grade: number; classNum: number }>();
    for (let d = 1; d <= 5; d++) {
      const daySchedule = selectedSchedule[d];
      if (!daySchedule) continue;
      for (let p = 1; p < daySchedule.length; p++) {
        const decoded = decodeCell(daySchedule[p]);
        if (decoded && decoded.subjectName === hwForm.subject) {
          const key = `${decoded.grade}-${decoded.classNum}`;
          result.set(key, { grade: decoded.grade, classNum: decoded.classNum });
        }
      }
    }
    return Array.from(result.values()).sort((a, b) =>
      a.grade !== b.grade ? a.grade - b.grade : a.classNum - b.classNum
    );
  }, [selectedSchedule, hwForm.subject]);

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
  // 탭별 확인한 수행평가 ID 스냅샷 (탭 클릭 시 저장 — 모두 확인 여부 판정용)
  const [viewedTabSnapshots, setViewedTabSnapshots] = useState<Map<string, Set<number>>>(() => new Map());

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

  // 접속 시 수행평가 있는 첫 (과목, 반) 자동선택용 ref
  // 교사 변경 시 false로 리셋하여 재탐색
  const hasAutoSelectedRef = useRef(false);

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

  // 교사 변경 시 자동선택 ref 초기화 (새 교사의 데이터로 재탐색)
  useEffect(() => {
    hasAutoSelectedRef.current = false;
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

  // ── 스마트 자동선택: 접속 시 수행평가가 있는 첫 (과목, 반) 자동 선택 ──
  // allAssessments 로딩 완료 후 딱 한 번만 실행 (hasAutoSelectedRef)
  // 과목 좌→우, 각 과목 내 반 좌→우 순서로 탐색
  useEffect(() => {
    // 아직 로딩 중이거나 이미 자동선택 완료 시 skip
    if (isAssessmentsLoading) return;
    if (!allAssessments) return;
    if (hasAutoSelectedRef.current) return;
    if (subjectTabs.length === 0) return;

    // 과목별로 좌→우 탐색
    for (const subject of subjectTabs) {
      // 해당 과목의 classTabs 구성 (effectiveSubjectFilter 적용 전 classTabs 전체 기준)
      // classTabs는 이미 현재 선생님의 수업만 포함하므로 subject 필터만 추가 적용
      const subjectTabs_classTabs = classTabs.filter(tab => {
        // classTabs는 effectiveSubjectFilter 기준으로 만들어져 있으므로,
        // 과목이 다르면 해당 과목용 classTabs를 직접 조회할 수 없음.
        // 대신 allAssessments에서 해당 과목+탭 조합을 확인한다.
        return true; // 일단 전체 탭 대상 — 아래에서 subject 필터로 assessments 카운트
      });

      // 해당 과목에서 각 반 탭을 좌→우 탐색
      for (const tab of classTabs) {
        const { grade, classNum, group } = tab;
        const count = allAssessments.filter(a => {
          if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
          if (a.subject !== subject) return false;
          if (a.grade !== grade) return false;
          if (a.classNum === 0) {
            const ag = parseClassCode(a.classCode);
            if (ag.length === 0) return false;
            if (!ag.includes(group || '')) return false;
          } else {
            if (a.classNum !== classNum) return false;
            if (group && a.classCode && a.classCode.trim()) {
              const ag2 = parseClassCode(a.classCode);
              if (!ag2.includes(group)) return false;
            }
          }
          return true;
        }).length;

        if (count > 0) {
          // 수행평가 있는 첫 (과목, 반) 발견 → 선택 후 종료
          hasAutoSelectedRef.current = true;
          setSelectedSubjectFilter(subject);
          setSelectedTabId(tab.id);
          return;
        }
      }
    }

    // 수행평가가 하나도 없음 → 기본값(첫 과목, 첫 탭) 유지, 재탐색 방지
    hasAutoSelectedRef.current = true;
  }, [isAssessmentsLoading, allAssessments, subjectTabs, classTabs, teacherName, rawTeacherName, taughtSubjects]);

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

  // 탭별 수행평가 수 계산 (반 선택 버튼 배지용)
  const tabAssessmentCounts = useMemo(() => {
    if (!allAssessments) return new Map<string, number>();
    const counts = new Map<string, number>();
    filteredClassTabs.forEach(tab => {
      const { grade, classNum, group } = tab;
      const count = allAssessments.filter(a => {
        if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
        if (a.grade !== grade) return false;
        if (a.classNum === 0) {
          const aGroups = parseClassCode(a.classCode);
          if (aGroups.length === 0) return false;
          if (!aGroups.includes(group || '')) return false;
        } else {
          if (a.classNum !== classNum) return false;
          if (group && a.classCode && a.classCode.trim()) {
            const allowedGroups = parseClassCode(a.classCode);
            if (!allowedGroups.includes(group)) return false;
          }
        }
        if (effectiveSubjectFilter && a.subject !== effectiveSubjectFilter) return false;
        return true;
      }).length;
      counts.set(tab.id, count);
    });
    return counts;
  }, [filteredClassTabs, allAssessments, teacherName, rawTeacherName, taughtSubjects, effectiveSubjectFilter]);

  // 탭별 "모두 확인" 여부: 현재 assessment ID 세트가 저장된 스냅샷에 모두 포함되면 true
  const tabAllViewed = useMemo(() => {
    const result = new Map<string, boolean>();
    filteredClassTabs.forEach(tab => {
      const count = tabAssessmentCounts.get(tab.id) ?? 0;
      if (count === 0) { result.set(tab.id, false); return; }
      const snapshot = viewedTabSnapshots.get(tab.id);
      if (!snapshot || snapshot.size === 0) { result.set(tab.id, false); return; }
      const { grade, classNum, group } = tab;
      const currentIds = (allAssessments || []).filter(a => {
        if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
        if (a.grade !== grade) return false;
        if (a.classNum === 0) {
          const ag = parseClassCode(a.classCode);
          if (ag.length === 0) return false;
          if (!ag.includes(group || '')) return false;
        } else {
          if (a.classNum !== classNum) return false;
          if (group && a.classCode && a.classCode.trim()) {
            const ag2 = parseClassCode(a.classCode);
            if (!ag2.includes(group)) return false;
          }
        }
        if (effectiveSubjectFilter && a.subject !== effectiveSubjectFilter) return false;
        return true;
      }).map(a => a.id);
      const allSeen = currentIds.length > 0 && currentIds.every(id => snapshot.has(id));
      result.set(tab.id, allSeen);
    });
    return result;
  }, [filteredClassTabs, tabAssessmentCounts, viewedTabSnapshots, allAssessments, teacherName, rawTeacherName, taughtSubjects, effectiveSubjectFilter]);

  // 과목별 총 수행평가 수 (반 필터 없이, 해당 교사의 전체)
  const subjectAssessmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    subjectTabs.forEach(subject => {
      const count = (allAssessments || []).filter(a => {
        if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
        if (a.subject !== subject) return false;
        return true;
      }).length;
      counts.set(subject, count);
    });
    return counts;
  }, [subjectTabs, allAssessments, teacherName, rawTeacherName, taughtSubjects]);

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
        activityType: cellAssessments[0].activityType || "수행평가",
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
        activityType: "수행평가",
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
      activityType: formData.activityType || "수행평가",
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
      activityType: formData.activityType || "수행평가",
    });
  };

  return (
    <div 
      className="w-full min-h-screen md:h-screen md:overflow-hidden px-2 md:px-4 py-2 flex flex-col"
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
                type="text"
                value={authPassword}
                onChange={(e) => { setAuthPassword(e.target.value); setAuthError(""); }}
                placeholder="비밀번호 입력"
                autoComplete="current-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{ WebkitTextSecurity: showAuthPassword ? 'none' : 'disc' } as React.CSSProperties}
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

      {/* 보기전용 배너: 바 인라인으로 이동 (fixed 배너 제거) */}

      <div className="max-w-[1440px] mx-auto w-full md:flex-1 flex flex-col md:min-h-0">

        {/* ===== PC 전용 TOP SECTION ===== */}
        <div className="hidden md:flex flex-row gap-4 xl:gap-6 items-center mb-2 flex-shrink-0">

          {/* ── 좌: 제목 + 선생님 정보 + 주선택기 ── */}
          <div className="flex-1 md:max-w-[1000px] min-w-0 flex items-center gap-3">

            {/* 뱃지형 제목 */}
            <div className="flex flex-col min-w-0">
              <h1 className="font-extrabold text-gray-900 leading-tight truncate" style={{ fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>
                <span className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 bg-clip-text text-transparent">
                  교사용 수행평가 시스템
                </span>
              </h1>
              {/* 선생님 이름 & 인증 상태 */}
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-slate-400 font-medium">
                  {teacherName
                    ? <><span className="text-slate-700 font-bold">{teacherName}</span> 선생님</>
                    : <span className="text-slate-400">선생님을 선택하세요</span>}
                </span>
                {teacherName && isCurrentTeacherVerified && (
                  <Link href="/teacher/account">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 leading-tight hover:bg-emerald-100 transition-colors cursor-pointer">✓ 인증됨 · 계정</span>
                  </Link>
                )}
              </div>
            </div>

            {/* 주 선택기 */}
            <div className="flex flex-col items-center gap-0.5 shrink-0 ml-auto">
              <div className="flex items-center bg-indigo-600 rounded-full p-1 border border-indigo-400 shadow-md">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-8 h-8 p-0 rounded-full text-white hover:bg-white/25 active:bg-white/40 focus:bg-transparent focus:outline-none focus:ring-0 focus-visible:ring-0 disabled:opacity-40 select-none cursor-pointer"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  onClick={(e) => { setWeekOffset(prev => prev - 1); (e.currentTarget as HTMLElement).blur(); }}
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
                  onClick={(e) => { setWeekOffset(prev => prev + 1); (e.currentTarget as HTMLElement).blur(); }}
                  disabled={weekOffset >= 8}
                  title="다음 주"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {isOutOfDateRange && (
                <span className="text-xs font-bold text-red-500 bg-red-50/80 border border-red-200 rounded px-1.5 py-0.5 leading-tight animate-pulse whitespace-nowrap">
                  미확정 시간표
                </span>
              )}
            </div>
          </div>

          {/* ── 우: 네비게이션 버튼 묶음 ── */}
          <div className="hidden md:flex md:w-[320px] xl:w-[360px] shrink-0 items-center justify-end gap-2">
            <Button variant="outline" size="sm"
              className="rounded-full shadow-sm gap-1.5 text-xs bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              onClick={handleReturnToStudentPage}
              title="학생용 페이지로 이동"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-emerald-600" />
              <span>학생용</span>
            </Button>
            <Link href="/meal">
              <Button variant="outline" size="sm"
                className="rounded-full shadow-sm gap-1.5 text-xs bg-white hover:bg-orange-50 border-orange-200 text-orange-700 font-semibold"
                title="급식 정보 보기"
              >
                <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500" />
                <span>급식정보</span>
                <ArrowRight className="w-3.5 h-3.5 text-orange-500" />
              </Button>
            </Link>
            <Button variant="outline" size="sm"
              className="rounded-full shadow-sm gap-1.5 text-xs bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              onClick={() => {
                downloadDesktopShortcut("교사용_수행평가_등록시스템");
                toast.success("바탕화면 바로가기(.url) 파일이 다운로드되었습니다.");
              }}
              title="PC 바탕화면에 바로가기 파일 다운로드"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>바로가기</span>
            </Button>
          </div>
        </div>


        {/* ===== CONTENT AREA: flex-col on mobile (panel top, title+week, table bottom), flex-row on desktop ===== */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 xl:gap-6 items-start md:items-stretch md:flex-1 md:min-h-0">

        {/* ===== MOBILE ONLY: Title row — 항상 표시 ===== */}
        <div className="md:hidden w-full order-1 flex items-center justify-between gap-2 px-0.5 shrink-0 min-h-[44px]">
          <h2 className="text-lg font-extrabold truncate leading-tight">
            <span className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 bg-clip-text text-transparent">교사용 수행평가 등록 시스템</span>
          </h2>
          {/* 주 선택기 — 레이아웃 공간 항상 유지, 당일형이 아닐 때 invisible */}
          <div className={`flex flex-col items-center gap-0.5 shrink-0 ${mobileViewMode !== 'daily' ? 'invisible pointer-events-none' : ''}`}>
            <div className="flex items-center bg-indigo-600 rounded-full p-1 border border-indigo-400">
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
            {/* 미확정 뱃지 — 당일형 + 범위 초과 시에만 표시 */}
            {mobileViewMode === 'daily' && isOutOfDateRange && (
              <span className="text-xs font-bold text-red-500 bg-red-50/80 border border-red-200 rounded px-1.5 py-0.5 leading-tight animate-pulse whitespace-nowrap">
                미확정 시간표
              </span>
            )}
          </div>
        </div>

        {/* ===== TIMETABLE COLUMN: order-2 on mobile, order-1 on desktop ===== */}
        <div className="w-full md:flex-1 md:max-w-[1000px] min-w-0 flex flex-col order-2 md:order-1 md:min-h-0">

        {/* ===== 모바일 전용: 뷰 모드 선택기 (당일형 / 숙제형 / 달력) ===== */}
        <div className="md:hidden mb-2 shrink-0">
          <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
            {([
              { key: 'daily',    label: '당일형 수행', Icon: Clock },
              { key: 'homework', label: '숙제형 수행', Icon: BookOpen },
              { key: 'calendar', label: '달력',        Icon: CalendarDays },
            ] as { key: MobileViewMode; label: string; Icon: React.ElementType }[]).map(({ key, label, Icon }, i, arr) => (
              <button
                key={key}
                type="button"
                onClick={() => setMobileViewMode(key)}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className={[
                  'flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[11px] font-bold leading-tight transition-colors select-none',
                  i > 0 ? 'border-l border-slate-200' : '',
                  mobileViewMode === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-500 active:bg-slate-100',
                ].join(' ')}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ===== 모바일: 탭 전환 영역 — 당일형 표를 기준으로 크기 고정 ===== */}
        {/* 당일형 표는 항상 렌더(invisible로 공간 유지), 숙제/달력 패널은 absolute로 덮는다 */}
        <div className="md:hidden w-full relative">

        {/* ===== 모바일: 숙제형 패널 ===== */}
        {mobileViewMode === 'homework' && (
          <div
            className="w-full rounded-xl shadow-sm flex flex-col overflow-hidden absolute inset-0 z-10"
            style={{
              ...(!isCurrentTeacherVerified ? {
                background: 'linear-gradient(135deg, #e8e8e8 0%, #c8c8c8 40%, #a8a8a8 100%)',
                border: '1px solid rgba(255,255,255,0.6)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
              } : {
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
              })
            }}
          >
            {!isCurrentTeacherVerified ? (
              <div
                onClick={() => setShowAuthDialog(true)}
                className="flex-1 flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none min-h-[350px]"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/70 shadow-md border border-white/90 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h4 className="text-lg font-extrabold text-slate-800 tracking-tight">로그인이 필요합니다</h4>
              </div>
            ) : (
              <>
                {/* 헤더 */}
                <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-base font-extrabold text-slate-800">숙제형 수행평가 등록</h3>
                  <span className="ml-auto text-xs text-slate-400 font-bold">{hwPage} / 2</span>
                </div>

                {/* 콘텐츠 영역 */}
                <div className="flex-1 overflow-y-auto px-4 py-4">

                  {hwPage === 1 ? (
                    <div className="flex flex-col gap-3">
                      {/* 종류 선택 */}
                      <div
                        style={{
                          display: 'flex',
                          background: '#f1f5f9',
                          borderRadius: 12,
                          padding: 4,
                          gap: 4,
                        }}
                      >
                        {(['수행평가', '기타 활동'] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setHwForm(f => ({ ...f, activityType: type }))}
                            style={{
                              flex: 1,
                              padding: '8px 0',
                              borderRadius: 8,
                              border: 'none',
                              fontWeight: 700,
                              fontSize: 14,
                              cursor: 'pointer',
                              transition: 'all 0.18s',
                              background: hwForm.activityType === type
                                ? (type === '수행평가' ? '#3b82f6' : '#7c3aed')
                                : 'transparent',
                              color: hwForm.activityType === type ? '#fff' : '#64748b',
                              boxShadow: hwForm.activityType === type ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                            }}
                          >
                            {type === '수행평가' ? '📝 수행평가' : '✨ 기타 활동'}
                          </button>
                        ))}
                      </div>

                      {/* 평가 제목 */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">평가 제목</label>
                        <Input
                          placeholder="예: 독서록 작성, 탐구 보고서 제출"
                          value={hwForm.title}
                          onChange={e => setHwForm(f => ({ ...f, title: e.target.value }))}
                          className="h-10 text-sm"
                        />
                      </div>

                      {/* 과목 / 반 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">과목</label>
                          <select
                            value={hwForm.subject}
                            onChange={e => setHwForm(f => ({ ...f, subject: e.target.value, classNum: '' }))}
                            className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          >
                            <option value="">과목 선택</option>
                            {(taughtSubjects || []).map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">반</label>
                          <select
                            value={hwForm.classNum}
                            onChange={e => setHwForm(f => ({ ...f, classNum: e.target.value }))}
                            disabled={!hwForm.subject || classesForHwSubject.length === 0}
                            className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                          >
                            <option value="">{!hwForm.subject ? '과목 먼저 선택' : '반 선택'}</option>
                            {classesForHwSubject.map(({ grade, classNum }) => (
                              <option key={`${grade}-${classNum}`} value={String(classNum)}>
                                {grade}학년 {classNum}반
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* 시작일 / 마감일 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">시작일</label>
                          <Input type="date" value={hwForm.startDate}
                            onChange={e => setHwForm(f => ({ ...f, startDate: e.target.value }))}
                            className="h-10 text-sm px-2" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">마감일</label>
                          <Input type="date" value={hwForm.dueDate}
                            onChange={e => setHwForm(f => ({ ...f, dueDate: e.target.value }))}
                            className="h-10 text-sm px-2" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {/* 활동 내용 */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">활동 내용</label>
                        <Textarea
                          placeholder="예: 준비물, 실습, 생기부 활동 등등"
                          value={hwForm.content}
                          onChange={e => setHwForm(f => ({ ...f, content: e.target.value }))}
                          className="h-28 text-sm resize-none"
                        />
                      </div>
                      {/* 제출 링크 */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                          <Link2 className="w-3 h-3" /> 제출 사이트 / 링크
                        </label>
                        <Input type="url" placeholder="예: https://school.go.kr/..."
                          value={hwForm.link}
                          onChange={e => setHwForm(f => ({ ...f, link: e.target.value }))}
                          className="h-10 text-sm" />
                      </div>
                    </div>
                  )}
                </div>

                {/* 하단 버튼 영역 */}
                <div className="shrink-0 px-4 pb-4 pt-2 flex gap-2">
                  {hwPage === 1 ? (
                    <button
                      type="button"
                      onClick={() => setMobileViewMode('daily')}
                      className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      취소
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setHwPage(1)}
                      className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      이전
                    </button>
                  )}
                  {hwPage === 1 ? (() => {
                    const page1Valid = !!(hwForm.title && hwForm.subject && hwForm.classNum && hwForm.startDate && hwForm.dueDate);
                    return (
                      <button
                        type="button"
                        onClick={() => { if (page1Valid) setHwPage(2); }}
                        disabled={!page1Valid}
                        className={[
                          'flex-[2] h-11 rounded-xl font-extrabold text-sm transition-colors flex items-center justify-center gap-1',
                          page1Valid
                            ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white cursor-pointer'
                            : 'bg-indigo-200 text-white cursor-not-allowed',
                        ].join(' ')}
                      >
                        다음
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    );
                  })() : (
                    <button
                      type="button"
                      onClick={() => {/* TODO: DB 연동 후 등록 처리 */}}
                      className="flex-[2] h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-sm transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      등록
                    </button>
                  )}
                </div>
              </>
            )}

          </div>
        )}


        {/* ===== 모바일: 달력 패널 ===== */}
        {mobileViewMode === 'calendar' ? (() => {
          const { year, month } = calendarMonth;
          const firstDay = new Date(year, month, 1);
          const totalDays = new Date(year, month + 1, 0).getDate();
          const startDow = firstDay.getDay();
          const todayStr = toDateString(new Date());
          const DOW_LABELS = ['일','월','화','수','목','금','토'];

          const totalCells = Math.ceil((startDow + totalDays) / 7) * 7;
          const cells: (number | null)[] = [
            ...Array(startDow).fill(null),
            ...Array.from({ length: totalDays }, (_, i) => i + 1),
            ...Array(totalCells - startDow - totalDays).fill(null),
          ];

          // 드래그 범위 체크 헬퍼
          const dragMin = calDragStart && calDragEnd ? [calDragStart, calDragEnd].sort()[0] : null;
          const dragMax = calDragStart && calDragEnd ? [calDragStart, calDragEnd].sort()[1] : null;
          const isInDragRange = (ds: string) => !!dragMin && !!dragMax && ds >= dragMin && ds <= dragMax;
          const isDragStartDate = (ds: string) => ds === dragMin;
          const isDragEndDate   = (ds: string) => ds === dragMax;

          // 좌표에서 data-date 속성 읽기
          const dateFromPoint = (cx: number, cy: number): string | null => {
            const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
            return el?.closest('[data-date]')?.getAttribute('data-date') ?? null;
          };

          return (
            <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col absolute inset-0 z-10">
              {/* 달력 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                <button type="button"
                  onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 active:bg-slate-100 text-slate-600">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-extrabold text-slate-800 text-base">{year}년 {month + 1}월</span>
                <button type="button"
                  onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 active:bg-slate-100 text-slate-600">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* 단일 grid — 이벤트 위임 방식 */}
              <div
                className="relative grid grid-cols-7 px-1 pb-1 select-none"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const ds = dateFromPoint(e.clientX, e.clientY);
                  if (ds) { setCalDragStart(ds); setCalDragEnd(ds); }
                }}
                onPointerMove={(e) => {
                  if (!calIsDragging) return;
                  e.preventDefault();

                  // 좌표 기반 month-nav 감지 (pointer-events-none 존을 우회)
                  if (calGridRef.current) {
                    const rect = calGridRef.current.getBoundingClientRect();
                    const relX = e.clientX - rect.left;
                    const relY = e.clientY - rect.top;
                    const DOW_H = 32; // py-2 + text-[11px] 행 높이 근사
                    const CELL_H = 44; // h-11
                    const ZONE_W = 44; // 좌우 감지 너비
                    const numRows = totalCells / 7;

                    // 첫 행 왼쪽 경계
                    if (relY >= DOW_H && relY < DOW_H + CELL_H && relX >= 0 && relX < ZONE_W) {
                      const prevDate = new Date(year, month - 1, 1);
                      const now = Date.now();
                      if (now - lastMonthSwitchTimeRef.current > 600) {
                        setCalendarMonth({ year: prevDate.getFullYear(), month: prevDate.getMonth() });
                        lastMonthSwitchTimeRef.current = now;
                      }
                      setCalDragEnd(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`);
                      return;
                    }
                    // 마지막 행 오른쪽 경계
                    const lastRowTop = DOW_H + (numRows - 1) * CELL_H;
                    if (relY >= lastRowTop && relY < lastRowTop + CELL_H && relX > rect.width - ZONE_W) {
                      const lastDay = new Date(year, month + 2, 0).getDate();
                      const nextDate = new Date(year, month + 1, lastDay);
                      const now = Date.now();
                      if (now - lastMonthSwitchTimeRef.current > 600) {
                        setCalendarMonth({ year: nextDate.getFullYear(), month: nextDate.getMonth() });
                        lastMonthSwitchTimeRef.current = now;
                      }
                      setCalDragEnd(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
                      return;
                    }
                  }

                  const ds = dateFromPoint(e.clientX, e.clientY);
                  if (ds) setCalDragEnd(ds);
                }}
                onPointerUp={(e) => {
                  if (!calIsDragging) return;
                  const ds = calDragStart;
                  const de = dateFromPoint(e.clientX, e.clientY) ?? calDragEnd;
                  setCalDragStart(null);
                  setCalDragEnd(null);

                  if (!ds || !de || ds === de) {
                    // 클릭: 당일형으로 이동
                    const target = ds ?? de;
                    if (!target) return;
                    const [ty, tm, td2] = target.split('-').map(Number);
                    const clicked = new Date(ty, tm - 1, td2);
                    const cdow = clicked.getDay();
                    const clickedMon = new Date(clicked);
                    clickedMon.setDate(clicked.getDate() - (cdow === 0 ? 6 : cdow - 1));
                    const today2 = new Date();
                    const tdow = today2.getDay();
                    const curMon = new Date(today2);
                    curMon.setDate(today2.getDate() - (tdow === 0 ? 6 : tdow - 1));
                    const diffWeeks = Math.round((clickedMon.getTime() - curMon.getTime()) / (7 * 86400000));
                    setWeekOffset(Math.max(-2, Math.min(8, diffWeeks)));
                    setMobileViewMode('daily');
                  } else {
                    // 드래그: 숙제형 탭으로 이동 + 날짜 자동 입력
                    const [s, e2] = [ds, de].sort();
                    setHwForm(f => ({ ...f, startDate: s, dueDate: e2 }));
                    setMobileViewMode('homework');
                  }
                }}
                onPointerCancel={() => { setCalDragStart(null); setCalDragEnd(null); }}
                ref={calGridRef}
              >
                {/* ── 드래그 중에만 표시: 지난 달 / 다음 달 시각 힌트 (pointer-events-none) ── */}
                {calIsDragging && (
                  <>
                    {/* 지난 달: 첫째 행 왼쪽 테두리 — 시각 전용 */}
                    <div
                      className="absolute left-0 z-10 flex items-center justify-start pointer-events-none"
                      style={{ top: 32, height: 44 }}
                    >
                      <div className="flex flex-col items-center justify-center w-9 h-9 rounded-r-xl bg-indigo-600/80 shadow-md">
                        <ChevronLeft className="w-4 h-4 text-white animate-bounce" style={{ animationDuration: '0.5s' }} />
                        <span className="text-[8px] text-white font-bold leading-none mt-0.5">지난달</span>
                      </div>
                    </div>

                    {/* 다음 달: 마지막 행 오른쪽 테두리 — 시각 전용 */}
                    <div
                      className="absolute right-0 z-10 flex items-center justify-end pointer-events-none"
                      style={{ bottom: 4, height: 44 }}
                    >
                      <div className="flex flex-col items-center justify-center w-9 h-9 rounded-l-xl bg-indigo-600/80 shadow-md">
                        <ChevronRight className="w-4 h-4 text-white animate-bounce" style={{ animationDuration: '0.5s' }} />
                        <span className="text-[8px] text-white font-bold leading-none mt-0.5">다음달</span>
                      </div>
                    </div>
                  </>
                )}

                {DOW_LABELS.map((dow, i) => (
                  <div key={dow} className={[
                    'py-2 text-center text-[11px] font-bold pointer-events-none',
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500',
                  ].join('')}>{dow}</div>
                ))}

                {cells.map((d, idx) => {
                  const col = idx % 7;
                  if (!d) return <div key={`empty-${idx}`} className="h-11" />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isToday      = dateStr === todayStr;
                  const isSun        = col === 0;
                  const isSat        = col === 6;
                  const inRange      = isInDragRange(dateStr);
                  const isRangeStart = isDragStartDate(dateStr);
                  const isRangeEnd   = isDragEndDate(dateStr);
                  const hasDailyAssessment = (allAssessments || []).some(a => a.dueDate === dateStr);

                  return (
                    <div
                      key={dateStr}
                      data-date={dateStr}
                      className={[
                        'h-11 flex flex-col items-center justify-center text-[13px] font-bold transition-colors cursor-pointer',
                        isRangeStart || isRangeEnd     ? 'bg-indigo-500 text-white rounded-lg' : '',
                        inRange && !isRangeStart && !isRangeEnd ? 'bg-indigo-100 text-indigo-700' : '',
                        !inRange && !isRangeStart && !isRangeEnd && isToday  ? 'ring-2 ring-emerald-500 text-emerald-700 bg-emerald-50 rounded-lg' : '',
                        !inRange && !isRangeStart && !isRangeEnd && !isToday && isSun  ? 'text-red-500' : '',
                        !inRange && !isRangeStart && !isRangeEnd && !isToday && isSat  ? 'text-blue-500' : '',
                        !inRange && !isRangeStart && !isRangeEnd && !isToday && !isSun && !isSat ? 'text-slate-700' : '',
                      ].join(' ')}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span>{d}</span>
                      {hasDailyAssessment && (
                        <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                          isRangeStart || isRangeEnd ? 'bg-white' : isToday ? 'bg-emerald-500' : 'bg-pink-500'
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 하단 안내 */}
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-center gap-4">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="text-base leading-none">👆</span>
                  <span><b className="text-slate-600">클릭</b> — 당일형 이동</span>
                </span>
                <span className="w-px h-3 bg-slate-300 shrink-0" />
                <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="text-base leading-none">↔️</span>
                  <span><b className="text-slate-600">드래그</b> — 숙제 구간 선택</span>
                </span>
              </div>

            </div>
          );
        })() : null}

        {/* 시간표: absolute 오버레이의 기준 크기 제공. 당일형 아닐 때 invisible로 공간 유지. PC: 항상 표시. */}
      <div className={`w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto flex-1 flex flex-col md:min-h-0 ${
        mobileViewMode !== 'daily' ? 'invisible pointer-events-none md:visible md:pointer-events-auto' : ''
      }`}>
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
              <table className="w-full table-fixed min-w-[340px] md:min-w-[500px] xl:min-w-[600px] flex-1 h-full" style={{ borderCollapse: 'collapse', background: '#ffffff', fontSize: '12px' }}>
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
                      <tr key={p} className="h-[50px] md:h-[calc((100vh-150px)/7)] md:min-h-[44px]">
                        {/* Row number cell — Excel row header */}
                        <td
                          className="h-[50px] md:h-[calc((100vh-150px)/7)] md:min-h-[44px] overflow-hidden"
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
                              className="group h-[52px] md:h-[calc((100vh-150px)/7)] md:min-h-[44px] overflow-hidden"
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
                                  {/* 학생 배지 — td의 position:relative 기준 우측 상단 */}
                                  {hasAssessment && cellAssessments.some(a => !a.isTeacherCreated) && (
                                    <span style={{
                                      position: 'absolute',
                                      top: 2,
                                      right: 2,
                                      fontSize: 10,
                                      fontWeight: 800,
                                      border: '1px solid #94a3b8',
                                      color: '#475569',
                                      padding: '2px 4px',
                                      borderRadius: 3,
                                      background: '#f1f5f9',
                                      whiteSpace: 'nowrap',
                                      lineHeight: 1.2,
                                      zIndex: 1,
                                    }}>
                                      학생
                                    </span>
                                  )}
                                  {/* Class label */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{
                                      fontSize: 10,
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
                                        if (!cellGroup) return `${cellData.grade}-${String(cellData.classNum).replace(/반$/, '')}`;
                                        // 이동수업: 관리페이지 강의실 이름 조회
                                        const configName = lectureClassNameMap.get(`${cellData.grade}-${(cellData.subjectName || '').trim()}-${cellGroup}`);
                                        // 강의실 이름이 없으면 학년-반 표시, 있으면 강의실 이름만 표시 (그룹 기호는 과목명 뒤에 별도 표시)
                                        return configName ? configName : `${cellData.grade}-${String(cellData.classNum).replace(/반$/, '')}`;
                                      })()}
                                    </span>
                                    <span style={{
                                      fontWeight: 700,
                                      color: '#1a1a1a',
                                      lineHeight: 1.3,
                                      fontSize: (cellData.subjectName || '').length > 6 ? 11 : (cellData.subjectName || '').length > 4 ? 12 : 14,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '100%',
                                    }}
                                      title={cellData.subjectName}
                                    >
                                      {cellGroup && renderGroupCode(cellGroup)}{cellData.subjectName}
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
                                          <span className="hidden md:inline" style={{ fontSize: 7, border: '1px solid #f472b6', color: '#be185d', padding: '0 3px', borderRadius: 2, flexShrink: 0, whiteSpace: 'nowrap', background: '#fdf2f8' }}>
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
        </div>{/* end md:hidden relative panels wrapper */}

      {/* ===== PC 전용: 표 밑 설명 텍스트 ===== */}
      <p className="hidden md:flex items-center justify-center text-slate-500 text-sm mt-2 w-full">
        <MousePointerClick className="w-4 h-4 mr-1.5" />
        시간표 <strong className="text-slate-600 mx-1">클릭</strong>
        <ArrowRight className="w-3.5 h-3.5 mx-1 text-slate-400" />
        수행평가 <strong className="text-slate-600 ml-1">등록</strong>
      </p>

      </div>{/* end timetable column */}

      {/* ===== RIGHT PANEL: order-3 on mobile (below timetable), order-2 on desktop (right, sticky) ===== */}
      <div className="w-full md:w-[320px] xl:w-[360px] shrink-0 flex flex-col order-3 md:order-2 md:sticky md:top-4 h-fit">
        <div className="md:bg-white md:rounded-2xl md:border md:border-slate-200 md:shadow-md flex flex-col h-fit md:max-h-[calc(100vh-2rem)]">
          {/* Teacher Picker — 모바일 카드 / PC 패널 내부 바
               미인증 시: relative + min-height → 실버 absolute inset-0으로 꽉 채움
               선생님 선택기는 z-10으로 실버 위에 표시 */}
          <div
            className={`rounded-xl border shadow-sm mb-2 md:mb-0 md:rounded-t-2xl md:rounded-b-none md:border-none md:shadow-none md:border-b flex-shrink-0 flex flex-col justify-center ${
              isCurrentTeacherVerified 
                ? 'bg-white border-slate-200 md:border-slate-100 p-2 sm:p-2.5 md:p-3' 
                : 'p-2 sm:p-2.5 md:p-2.5'
            }`}
            style={!isCurrentTeacherVerified ? {
              background: 'linear-gradient(135deg, #e8e8e8 0%, #c8c8c8 40%, #a8a8a8 100%)',
              borderTop: '1px solid rgba(255,255,255,0.6)',
              borderLeft: '1px solid rgba(255,255,255,0.6)',
              borderRight: '1px solid rgba(255,255,255,0.6)',
              borderBottom: '1px solid rgba(200,200,200,0.5)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
            } : undefined}
          >
            {/* 선생님 선택기 + (인증 시: 계정버튼 / 미인증 시: [보기 전용] [로그인]) 한 줄 배치 */}
            <div className="flex items-center gap-2 justify-between w-full min-w-0">
              {/* 융합된 선생님 선택기 + 계정 버튼 */}
              <div className="flex items-stretch rounded-xl border border-indigo-200 overflow-hidden shadow-sm min-w-0 bg-indigo-50 shrink">
                {/* 선생님 선택기 */}
                {timetableData ? (
                  <button
                    type="button"
                    onClick={() => { setTeacherSearchQuery(""); setShowTeacherSelectModal(true); }}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    className="flex items-center gap-1 pl-3 pr-2 py-2 md:pl-2.5 md:pr-1.5 md:py-1.5 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 font-extrabold text-sm tracking-tight leading-tight transition-colors focus:outline-none cursor-pointer group min-w-0 max-w-[160px] md:max-w-[190px]"
                  >
                    <span className="truncate text-left min-w-0">
                      {selectedTeacherId
                        ? `${teacherOptions.find(o => o.idx.toString() === selectedTeacherId)?.label || getTeacherDisplayName(timetableData.teachers[parseInt(selectedTeacherId, 10)], parseInt(selectedTeacherId, 10))} 선생님`
                        : "선생님 선택"}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 md:w-3.5 md:h-3.5 text-indigo-400 group-hover:text-indigo-600 shrink-0" />
                  </button>
                ) : (
                  <span className="pl-3 pr-2 py-2 md:pl-2.5 md:pr-1.5 md:py-1.5 text-sm font-extrabold text-slate-700 flex items-center truncate flex-1 min-w-0">
                    {teacherName ? `${teacherName} 선생님` : '선생님 선택'}
                  </span>
                )}

                {/* 계정 버튼: 인증 시에만 표시되며, 구분선을 주어 융합된 형태 유지 */}
                {isCurrentTeacherVerified && (
                  <Link href="/teacher/account" className="flex shrink-0">
                    <button type="button" style={{ WebkitTapHighlightColor: 'transparent' }}
                      className="flex items-center gap-1 px-3 py-2 md:px-2.5 md:py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 font-bold text-xs sm:text-sm md:text-xs shrink-0 transition-colors border-l border-indigo-200 cursor-pointer"
                      title="선생님 계정 관리">
                      <User className="w-3.5 h-3.5" /><span>계정</span>
                    </button>
                  </Link>
                )}
              </div>

              {/* 학생공지 (모바일 - 인증 시) */}
              {isCurrentTeacherVerified && (
                <button type="button" onClick={() => {}} style={{ WebkitTapHighlightColor: 'transparent' }}
                  className="md:hidden ml-auto flex items-center gap-1 px-2.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-gray-900 font-bold text-xs sm:text-sm shrink-0 transition-colors border border-yellow-300 cursor-pointer shadow-sm"
                  title="학생공지">
                  <Bell className="w-3.5 h-3.5" /><span>학생공지</span>
                </button>
              )}

              {/* 미인증 시 우측 묶음: [보기 전용] [로그인] */}
              {!isCurrentTeacherVerified && (
                <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-gray-800 bg-black/5 rounded-xl px-2.5 py-2 md:px-2 md:py-1.5 border border-black/5 shrink-0">
                    <svg className="w-3.5 h-3.5 shrink-0 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="text-xs font-bold leading-tight whitespace-nowrap text-gray-800">
                      보기 전용
                    </span>
                  </div>
                  <div className="relative shrink-0">
                    {mobileViewMode === 'homework' && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-30 animate-bounce">
                        <svg className="w-5 h-7.5 text-red-500 fill-red-500 filter drop-shadow-md" viewBox="0 0 24 32">
                          <path d="M12 30l-8-10h5V2h6v18h5l-8 10z" />
                        </svg>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAuthDialog(true)}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                      className={`shrink-0 px-3 py-2 md:px-2.5 md:py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-md whitespace-nowrap ${
                        mobileViewMode === 'homework' ? 'ring-2 ring-red-500 ring-offset-1 shadow-red-200' : ''
                      }`}
                    >
                      로그인
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>






          {/* ===== 모바일: 과목탭 + 반선택 + 평가목록 — 선생님선택과 분리된 별도 카드 ===== */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden md:bg-transparent md:rounded-none md:border-none md:shadow-none md:overflow-visible flex flex-col">

          {subjectTabs.length > 1 && (() => {
            const activeIdx = subjectTabs.indexOf(effectiveSubjectFilter);
            const activeColor = BOOKMARK_COLORS[activeIdx >= 0 ? activeIdx % BOOKMARK_COLORS.length : 0];
            return (
              <div
                className="flex-shrink-0 bg-white"
                style={{ borderBottom: `3px solid ${activeColor.activeBg}` }}
              >
                <div className="flex w-full">
                {subjectTabs.map((subject, idx) => {
                    const colorIdx = idx % BOOKMARK_COLORS.length;
                    const color = BOOKMARK_COLORS[colorIdx];
                    const isActive = effectiveSubjectFilter === subject;
                    const subjectCount = subjectAssessmentCounts.get(subject) ?? 0;
                    return (
                      <button
                        key={subject}
                        onPointerDown={(e) => {
                          (e.currentTarget as any)._tapStartX = e.clientX;
                          (e.currentTarget as any)._tapStartY = e.clientY;
                        }}
                        onPointerUp={(e) => {
                          const dx = e.clientX - ((e.currentTarget as any)._tapStartX ?? e.clientX);
                          const dy = e.clientY - ((e.currentTarget as any)._tapStartY ?? e.clientY);
                          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
                            setSelectedSubjectFilter(subject);
                          }
                        }}
                        className="relative flex-1 py-2.5 px-1 text-[13px] font-bold leading-tight text-center overflow-hidden"
                        style={{
                          color: isActive ? '#fff' : color.activeBg,
                          backgroundColor: isActive ? `${color.activeBg}BF` : `${color.bg}20`,
                          borderBottom: 'none',
                          WebkitTapHighlightColor: 'transparent',
                          touchAction: 'manipulation',
                          userSelect: 'none',
                        }}
                      >
                        {subjectCount > 0 && (
                          // 사선 컷 배지: polygon(0 0, 100% 0, 55% 100%, 0 100%)
                          // 해당 사다리꼴의 x 무게중심 ≈ 39%, y = 50%
                          <span
                            className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none"
                            style={{
                              clipPath: 'polygon(0 0, 100% 0, 55% 100%, 0 100%)',
                              backgroundColor: isActive
                                ? 'rgba(0,0,0,0.22)'
                                : `${color.activeBg}28`,
                            }}
                          >
                            <span
                              className="absolute font-extrabold leading-none"
                              style={{
                                top: '50%',
                                left: '39%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: subjectCount >= 10 ? '9px' : '11px',
                                color: isActive
                                  ? 'rgba(255,255,255,0.95)'
                                  : color.activeBg,
                              }}
                            >
                              {subjectCount}
                            </span>
                          </span>
                        )}
                        {subject}
                      </button>
                    );
                  })}


                </div>
              </div>
            );
          })()}

          {/* Class Navigation Tabs — hidden when no classes match selected subject */}
          {filteredClassTabs.length > 0 && (() => {
            const activeIdx = subjectTabs.indexOf(effectiveSubjectFilter);
            const ac = BOOKMARK_COLORS[activeIdx >= 0 ? activeIdx % BOOKMARK_COLORS.length : 0];
            return (
              <div
                className="flex-shrink-0 border-b border-slate-100"
                style={{ background: `${ac.bg}28` }}
              >
                <div
                  ref={tabContainerRef}
                  onMouseDown={handleTabMouseDown}
                  onMouseLeave={handleTabMouseLeave}
                  onMouseUp={handleTabMouseUp}
                  onMouseMove={handleTabMouseMove}
                  className="flex gap-1 overflow-x-auto px-1 md:px-3 py-2 scrollbar-hide select-none cursor-grab active:cursor-grabbing"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {filteredClassTabs.map(tab => {
                    const tabCount = tabAssessmentCounts.get(tab.id) ?? 0;
                    const allViewed = tabAllViewed.get(tab.id) ?? false;
                    return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (isDraggingTabsRef.current) return;
                        setSelectedTabId(tab.id);
                        // 탭 클릭 시 현재 assessment ID 스냅샷 저장
                        setViewedTabSnapshots(prev => {
                          const next = new Map(prev);
                          const { grade, classNum, group } = tab;
                          const ids = new Set(
                            (allAssessments || []).filter(a => {
                              if (!matchTeacherAndSubject(a, teacherName, rawTeacherName, taughtSubjects)) return false;
                              if (a.grade !== grade) return false;
                              if (a.classNum === 0) {
                                const ag = parseClassCode(a.classCode);
                                if (ag.length === 0) return false;
                                if (!ag.includes(group || '')) return false;
                              } else {
                                if (a.classNum !== classNum) return false;
                                if (group && a.classCode && a.classCode.trim()) {
                                  const ag2 = parseClassCode(a.classCode);
                                  if (!ag2.includes(group)) return false;
                                }
                              }
                              if (effectiveSubjectFilter && a.subject !== effectiveSubjectFilter) return false;
                              return true;
                            }).map(a => a.id)
                          );
                          next.set(tab.id, ids);
                          return next;
                        });
                      }}
                      className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-all duration-150 flex items-center gap-0.5 relative
                        ${selectedTabId === tab.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                      {tab.group
                        ? (() => {
                            const configName = lectureClassNameMap.get(`${tab.grade}-${(effectiveSubjectFilter || '').trim()}-${tab.group}`);
                            return (
                              <>
                                {renderGroupCode(tab.group, configName ? 3 : 0)}
                                {configName && <span>{configName}</span>}
                              </>
                            );
                          })()
                        : String(tab.label).replace(/반$/, '')}
                      {tabCount > 0 && (
                        <span
                          className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center leading-none shadow-sm transition-all duration-300 ${
                            allViewed
                              ? 'bg-slate-300 text-slate-500'
                              : 'bg-red-500 text-white'
                          }`}
                          style={allViewed ? {} : { boxShadow: '0 1px 3px rgba(239,68,68,0.5)' }}
                        >
                          {tabCount > 99 ? '99+' : tabCount}
                        </span>
                      )}
                    </button>
                    );
                  })}

                </div>
              </div>
            );
          })()}

          {/* Assessment List */}
          <div
            className="overflow-y-auto px-1 md:px-4 py-2.5 md:max-h-[calc(100vh-200px)]"
            style={(() => {
              const activeIdx = subjectTabs.indexOf(effectiveSubjectFilter);
              if (activeIdx < 0) return {};
              const ac = BOOKMARK_COLORS[activeIdx % BOOKMARK_COLORS.length];
              return { background: `${ac.bg}18` };
            })()}
          >
            {isAssessmentsLoading ? (
              <div className="space-y-2 mt-1">
                {[1,2].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : panelAssessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-16 text-slate-400">
                <span className="text-lg mb-0.5">📭</span>
                <p className="text-xs font-medium">등록된 수행평가가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-0 md:space-y-2">
                {panelAssessments.map(a => {
                  const dateObj = new Date(a.dueDate);
                  const mmdd = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                  const weekdayNames = ['일','월','화','수','목','금','토'];
                  const wd = weekdayNames[dateObj.getDay()];
                  const panelCodes = parseClassCode(a.classCode);
                  const panelClassLabel = (() => {
                    if (a.classNum !== 0) return `${a.grade}-${String(a.classNum).replace(/반$/, '')}`;
                    if (panelCodes.length === 0) return `${a.grade}-전체`;
                    const cn = lectureClassNameMap.get(`${a.grade}-${(a.subject || '').trim()}-${panelCodes[0]}`);
                    return cn || `${a.grade}-?`;
                  })();
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
                          activityType: a.activityType || '수행평가',
                        });
                        setShowEditDialog(true);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            {/* 반 배지 — 표와 동일한 초록 배지, "반" 글자 제거 */}
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: '#217346', color: '#ffffff', display: 'inline-block', lineHeight: 1.4 }}>
                              {panelClassLabel}
                            </span>
                            {/* 과목명 — 그룹코드(무지개 워드아트) + 과목명, 표와 동일한 서식 */}
                            <span style={{ fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3, fontSize: (a.subject || '').length > 6 ? 11 : (a.subject || '').length > 4 ? 12 : 14 }}>
                              {panelCodes.map((code: string, i: number) =>
                                renderGroupCode(code, i < panelCodes.length - 1 ? 2 : 3)
                              )}
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

          </div>{/* end mobile content card */}

        </div>{/* end inner card */}




        </div>{/* end right panel */}
        </div>{/* end content area */}
      </div>{/* end max-w wrapper */}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              수행평가 등록
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddSubmit} className="space-y-4 pt-3">
            {/* 활동 유형 선택 메뉴 */}
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                borderRadius: 12,
                padding: 4,
                gap: 4,
              }}
            >
              {(['수행평가', '기타 활동'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, activityType: type })}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 0.18s',
                    background: formData.activityType === type
                      ? (type === '수행평가' ? '#3b82f6' : '#7c3aed')
                      : 'transparent',
                    color: formData.activityType === type ? '#fff' : '#64748b',
                    boxShadow: formData.activityType === type ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  {type === '수행평가' ? '📝 수행평가' : '✨ 기타 활동'}
                </button>
              ))}
            </div>

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
              <label className="block text-xs font-semibold text-gray-500 mb-1">{formData.activityType === '기타 활동' ? '활동 내용 (주제/제목)' : '수행평가 내용 (주제/제목)'}</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={formData.activityType === '기타 활동' ? '예: 준비물, 실습, 생기부 활동 등등' : '예: 다항식의 계산 서술형 평가'}
                required
                rows={3}
                className="text-sm border-gray-200"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
                취소
              </Button>
              <Button type="submit" className="flex-1 text-white font-bold" disabled={createMutation.isPending}
                style={{ background: formData.activityType === '기타 활동' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#2563eb,#3b82f6)' }}
              >
                {createMutation.isPending ? '등록 중...' : '등록하기'}
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
            {/* 활동 유형 선택 메뉴 */}
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                borderRadius: 12,
                padding: 4,
                gap: 4,
              }}
            >
              {(['수행평가', '기타 활동'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, activityType: type })}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 0.18s',
                    background: formData.activityType === type
                      ? (type === '수행평가' ? '#3b82f6' : '#7c3aed')
                      : 'transparent',
                    color: formData.activityType === type ? '#fff' : '#64748b',
                    boxShadow: formData.activityType === type ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  {type === '수행평가' ? '📝 수행평가' : '✨ 기타 활동'}
                </button>
              ))}
            </div>

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
              <label className="block text-xs font-semibold text-gray-500 mb-1">{formData.activityType === '기타 활동' ? '활동 내용 (주제/제목)' : '수행평가 내용 (주제/제목)'}</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={formData.activityType === '기타 활동' ? '예: 준비물, 실습, 생기부 활동 등등' : '예: 다항식의 계산 서술형 평가'}
                required
                rows={3}
                className="text-sm border-gray-200"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowEditDialog(false)}>
                취소
              </Button>
              <Button type="submit" className="flex-1 text-white font-bold" disabled={updateMutation.isPending}
                style={{ background: formData.activityType === '기타 활동' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#4f46e5,#6366f1)' }}
              >
                {updateMutation.isPending ? '저장 중...' : '수정 완료'}
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
