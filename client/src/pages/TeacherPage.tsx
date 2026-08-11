import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus, Calendar, Trash2, Edit, AlertCircle, Home, Search, X, ChevronsUpDown, Check, Download } from "lucide-react";
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

// Helper: Format date string YYYY-MM-DD to include day of week (e.g. 2026-08-12 (수))
function formatDateWithDay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m - 1, d);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = weekdays[dateObj.getDay()];
    return `${dateStr} (${dayOfWeek})`;
  }
  return dateStr;
}

// Helper: Check if assessment teacher matches current teacher
function matchTeacher(aTeacher?: string, targetTeacher?: string, rawTargetTeacher?: string): boolean {
  if (!aTeacher || !targetTeacher) return true;
  const cleanA = aTeacher.replace(/선생님$/, '').trim();
  const cleanTarget = targetTeacher.replace(/선생님$/, '').trim();
  const cleanRaw = (rawTargetTeacher || '').replace(/선생님$/, '').trim();
  if (!cleanA || !cleanTarget) return true;
  return cleanA === cleanTarget || (cleanRaw ? cleanA === cleanRaw : false);
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


export default function TeacherPage() {
  const queryClient = useQueryClient();
  
  // States
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(() => {
    return localStorage.getItem("teacher-page-selected-teacher") || "1";
  });
  const [openCombobox, setOpenCombobox] = useState(false);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  
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

  const targetDate = toDateString(weekDates[0]);

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

  // Fetch Elective Configurations for Grade 2 and 3 using their resolved datasets
  const { data: electiveConfigsG2 } = useQuery({
    queryKey: ['electiveConfigs-teacher', '2', g2DatasetType],
    queryFn: async () => {
      const res = await fetch(`/api/electives?grade=2&dataset=${g2DatasetType}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!g2DatasetType,
  });

  const { data: electiveConfigsG3 } = useQuery({
    queryKey: ['electiveConfigs-teacher', '3', g3DatasetType],
    queryFn: async () => {
      const res = await fetch(`/api/electives?grade=3&dataset=${g3DatasetType}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!g3DatasetType,
  });

  // Compute elective groups for Grade 2 and Grade 3
  const computedGroupsG2 = useMemo(() => {
    return getComputedGroupsForGrade('2', grade2Timetable?.data || [], electiveConfigsG2 || [], settings);
  }, [grade2Timetable?.data, electiveConfigsG2, settings]);

  const computedGroupsG3 = useMemo(() => {
    return getComputedGroupsForGrade('3', grade3Timetable?.data || [], electiveConfigsG3 || [], settings);
  }, [grade3Timetable?.data, electiveConfigsG3, settings]);

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
    queryKey: ['teacher-assessments', taughtClasses, weekOffset, g1DatasetType, g2DatasetType, g3DatasetType],
    queryFn: async () => {
      if (taughtClasses.length === 0) return [];
      
      const promises = taughtClasses.map(async (cls) => {
        let resolvedDataset = 'COMCIGAN';
        if (cls.grade === 1) {
          resolvedDataset = g1DatasetType;
        } else if (cls.grade === 2) {
          resolvedDataset = g2DatasetType;
        } else if (cls.grade === 3) {
          resolvedDataset = g3DatasetType;
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
    enabled: taughtClasses.length > 0 && !!g1DatasetType && !!g2DatasetType && !!g3DatasetType,
    staleTime: 5000,
    refetchInterval: 2000,
  });

  // Build class+group nav tabs for the right panel
  // Each tab = { grade, classNum, group } — moving class ABCD are split separately
  const classTabs = useMemo(() => {
    const tabs: { id: string; grade: number; classNum: number; group: string; label: string }[] = [];
    if (!selectedSchedule || !allAssessments) return tabs;

    const seenIds = new Set<string>();

    taughtClasses.forEach(({ grade, classNum }) => {
      const classAssessments = (allAssessments || []).filter(
        a => matchTeacher(a.teacher, teacherName, rawTeacherName) && a.grade === grade && (a.classNum === classNum || a.classNum === 0)
      );

      const groupsInAss = new Set<string>();
      classAssessments.forEach(a => {
        if (a.classCode && a.classCode.trim()) {
          a.classCode.split(',').map(s => s.trim()).filter(Boolean).forEach(g => groupsInAss.add(g));
        }
      });

      if (grade === 2) {
        for (let d = 1; d <= 5; d++) {
          const daySchedule = selectedSchedule[d];
          if (!daySchedule) continue;
          for (let p = 1; p < daySchedule.length; p++) {
            const val = daySchedule[p];
            const decoded = decodeCell(val);
            if (decoded && decoded.grade === grade && decoded.classNum === classNum) {
              const cellG = computedGroupsG2[`${d - 1}-${p}`];
              if (cellG) groupsInAss.add(cellG);
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
              const cellG = computedGroupsG3[`${d - 1}-${p}`];
              if (cellG) groupsInAss.add(cellG);
            }
          }
        }
      }

      if (groupsInAss.size > 0) {
        const sortedGroups = Array.from(groupsInAss).sort();
        sortedGroups.forEach(grp => {
          const id = `${grade}-${classNum}-${grp}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            tabs.push({ id, grade, classNum, group: grp, label: `${grade}-${classNum}(${grp})` });
          }
        });
        const baseId = `${grade}-${classNum}-`;
        if (!seenIds.has(baseId)) {
          seenIds.add(baseId);
          tabs.push({ id: baseId, grade, classNum, group: '', label: `${grade}-${classNum}반` });
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
  }, [taughtClasses, allAssessments, selectedSchedule, computedGroupsG2, computedGroupsG3, teacherName, rawTeacherName]);

  const [selectedTabId, setSelectedTabId] = useState<string>('');

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

  // Auto-select first tab
  useEffect(() => {
    if (classTabs.length > 0 && !classTabs.find(t => t.id === selectedTabId)) {
      setSelectedTabId(classTabs[0].id);
    }
  }, [classTabs]);

  const selectedTab = classTabs.find(t => t.id === selectedTabId) || classTabs[0] || null;

  // Filter assessments for selected tab & selected teacher
  const panelAssessments = useMemo(() => {
    if (!selectedTab || !allAssessments) return [];
    const { grade, classNum, group } = selectedTab;
    return allAssessments.filter(a => {
      if (!matchTeacher(a.teacher, teacherName, rawTeacherName)) return false;
      if (a.grade !== grade) return false;
      if (a.classNum !== classNum && a.classNum !== 0) return false;
      if (group) {
        if (a.classCode && a.classCode.trim()) {
          const allowedGroups = a.classCode.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (!allowedGroups.includes(group)) return false;
        }
      }
      return true;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [selectedTab, allAssessments, teacherName, rawTeacherName]);

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
      if (!matchTeacher(a.teacher, teacherName, rawTeacherName)) return false;
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
    <div className="w-full min-h-screen px-2 md:px-4 py-2 md:py-6 bg-slate-50/30">
      <div className="max-w-[1240px] mx-auto w-full">

        {/* ===== TOP SECTION: Title + Home Button ===== */}
        <div className="flex items-center justify-between gap-2 mb-2 md:mb-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg md:text-2xl font-extrabold text-gray-900 truncate leading-tight">
              <span className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 bg-clip-text text-transparent">교사용 수행평가 등록 시스템</span>
            </h1>
            <p className="hidden md:block text-gray-500 text-xs sm:text-sm mt-0.5">
              시간표에서 수업이 들어있는 칸을 클릭하여 수행평가를 간편하게 등록하고 관리할 수 있습니다.
            </p>
          </div>

          {/* Action buttons (PC Desktop Shortcut + Home Button) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* PC Only Desktop Shortcut Button */}
            <Button
              variant="outline"
              size="sm"
              className="hidden md:inline-flex rounded-full shadow-sm gap-1.5 text-xs md:text-sm bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              onClick={() => {
                downloadDesktopShortcut("교사용_수행평가_등록시스템");
                toast.success("바탕화면 바로가기(.url) 파일이 다운로드되었습니다. 다운로드된 파일을 바탕화면으로 옮겨서 사용하세요.");
              }}
              title="PC 바탕화면에 바로가기 파일 다운로드"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>바탕화면에 바로가기 추가</span>
            </Button>

            {/* Home button */}
            <Link href="/">
              <Button variant="outline" size="sm" className="rounded-full shadow-sm gap-1 shrink-0 h-8 text-xs md:text-sm px-2.5 md:px-3">
                <Home className="w-3.5 h-3.5" />
                <span className="md:hidden">학생 시간표</span>
                <span className="hidden md:inline">학생 시간표로 돌아가기</span>
              </Button>
            </Link>
          </div>
        </div>


        {/* ===== CONTENT AREA: flex-col on mobile (panel top, table bottom), flex-row on desktop ===== */}
        <div className="flex flex-col md:flex-row gap-4 xl:gap-6 items-start">

        {/* ===== TIMETABLE COLUMN: order-2 on mobile (bottom), order-1 on desktop (left) ===== */}
        <div className="w-full md:flex-1 md:max-w-[850px] min-w-0 flex flex-col order-2 md:order-1">

      {/* Main Timetable — Card wrapper */}
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          {isTimetableLoading ? (
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
            <div className="w-full overflow-x-auto">
              <table className="w-full table-fixed min-w-[340px]" style={{ borderCollapse: 'collapse', background: '#ffffff', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {/* Corner cell */}
                    <th style={{ width: 36, height: 26, background: '#f2f2f2', borderRight: '1px solid #d0d0d0', borderBottom: '1px solid #d0d0d0', position: 'sticky', top: 0, zIndex: 2 }} />
                    {weekdays.map((day, idx) => {
                      const dDate = weekDates[idx];
                      const todayStr = toDateString(new Date());
                      const isToday = toDateString(dDate) === todayStr;
                      const formattedD = `${dDate.getMonth() + 1}/${dDate.getDate()}`;
                      return (
                        <th
                          key={day}
                          style={{
                            height: 26,
                            background: isToday ? '#cee8d0' : '#f2f2f2',
                            borderRight: '1px solid #d0d0d0',
                            borderBottom: isToday ? '2px solid #217346' : '1px solid #d0d0d0',
                            color: isToday ? '#1a5c30' : '#595959',
                            fontWeight: 700,
                            fontSize: 11,
                            textAlign: 'center',
                            userSelect: 'none',
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
                            <span>{day}요일</span>
                            <span style={{ fontSize: 9, fontWeight: 500, opacity: 0.75 }}>{formattedD}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxPeriods }).map((_, periodIndex) => {
                    const p = periodIndex + 1;
                    return (
                      <tr key={p} className="h-[52px] md:h-[84px]">
                        {/* Row number cell — Excel row header */}
                        <td
                          className="h-[52px] md:h-[84px]"
                          style={{
                            width: 36,
                            background: '#f2f2f2',
                            borderRight: '1px solid #d0d0d0',
                            borderBottom: '1px solid #d0d0d0',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: 12,
                            color: '#595959',
                            userSelect: 'none',
                          }}
                        >
                          {p}
                        </td>
                        {weekdays.map((_, dayIndex) => {
                          const d = dayIndex + 1;
                          const val = selectedSchedule[d]?.[p];
                          const cellData = decodeCell(val);
                          const cellDateStr = toDateString(weekDates[dayIndex]);
                          const isToday = cellDateStr === toDateString(new Date());

                          // Resolve group
                          let cellGroup = "";
                          if (cellData) {
                            if (cellData.grade === 2) cellGroup = computedGroupsG2[`${dayIndex}-${p}`] || "";
                            else if (cellData.grade === 3) cellGroup = computedGroupsG3[`${dayIndex}-${p}`] || "";
                          }

                          // Assessments
                          const cellAssessments = cellData ? (allAssessments || []).filter(a => {
                            if (!matchTeacher(a.teacher, teacherName, rawTeacherName)) return false;
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

                          // Excel-style cell background:
                          const baseBg = isToday ? '#f0f9f2' : '#ffffff';
                          const classBg = hasAssessment
                            ? (isToday ? '#fdf2f8' : '#fff5f7')   // conditional format: soft light pink
                            : (isToday ? '#eaf7ed' : '#f7fdf8');  // class but no assessment: barely tinted
                          const cellBg = cellData ? classBg : baseBg;

                          return (
                            <td
                              key={d}
                              className="group h-[52px] md:h-[84px]"
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
                                      {cellData.grade}-{cellData.classNum}{cellGroup ? `(${cellGroup})` : ''}
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
                                      {cellData.subjectName}
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

      {/* ===== RIGHT PANEL: order-1 on mobile (top, compact), order-2 on desktop (right, sticky) ===== */}
      <div className="w-full md:w-[320px] xl:w-[360px] shrink-0 flex flex-col order-1 md:order-2 md:sticky md:top-4">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden flex flex-col md:max-h-[calc(100vh-2rem)]">
          {/* Panel Header: Title transformed into Teacher Picker + Integrated Week Navigator */}
          <div className="px-3.5 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex-shrink-0 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Teacher Picker Title Button */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {timetableData ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTeacherSearchQuery("");
                      setShowTeacherSelectModal(true);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-extrabold text-base sm:text-lg tracking-tight leading-tight transition-all duration-150 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer group max-w-full"
                  >
                    <span className="truncate">
                      {selectedTeacherId
                        ? `${teacherOptions.find(o => o.idx.toString() === selectedTeacherId)?.label || getTeacherDisplayName(timetableData.teachers[parseInt(selectedTeacherId, 10)], parseInt(selectedTeacherId, 10))} 선생님`
                        : "교사 선택"}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 text-indigo-200 group-hover:text-white shrink-0 transition-colors ml-0.5" />
                  </button>
                ) : (
                  <h2 className="text-lg font-extrabold tracking-tight leading-tight">
                    {teacherName ? `${teacherName} 선생님!` : '선생님!'}
                  </h2>
                )}
              </div>

              {/* Week navigation integrated inside Card Header */}
              <div className="flex items-center bg-white/15 hover:bg-white/20 transition-colors rounded-full p-0.5 border border-white/25 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-7 h-7 p-0 rounded-full text-white hover:bg-white/25 hover:text-white active:bg-white/40 disabled:opacity-40"
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  disabled={weekOffset <= -2}
                  title="이전 주"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-bold text-white px-2 min-w-[85px] sm:min-w-[95px] text-center select-none">
                  {weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : weekOffset < 0 ? `${Math.abs(weekOffset)}주 전` : `${weekOffset}주 후`} ({weekRangeText})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-7 h-7 p-0 rounded-full text-white hover:bg-white/25 hover:text-white active:bg-white/40 disabled:opacity-40"
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  disabled={weekOffset >= 8}
                  title="다음 주"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Class Navigation Tabs */}
          <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50">
            <div
              ref={tabContainerRef}
              onMouseDown={handleTabMouseDown}
              onMouseLeave={handleTabMouseLeave}
              onMouseUp={handleTabMouseUp}
              onMouseMove={handleTabMouseMove}
              className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide select-none cursor-grab active:cursor-grabbing"
              style={{ scrollbarWidth: 'none' }}
            >
              {classTabs.length === 0 ? (
                <span className="text-xs text-slate-400 py-1 px-2">담당 반 없음</span>
              ) : (
                classTabs.map(tab => (
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
                    {tab.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Assessment List */}
          <div className="overflow-y-auto px-4 py-2.5 max-h-[130px] md:max-h-[calc(100vh-200px)]">
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
              <div className="space-y-2">
                {panelAssessments.map(a => {
                  const dateObj = new Date(a.dueDate);
                  const mmdd = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                  const weekdayNames = ['일','월','화','수','목','금','토'];
                  const wd = weekdayNames[dateObj.getDay()];
                  return (
                    <div
                      key={a.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50/60 hover:border-indigo-200 transition-all duration-150 p-3 cursor-pointer"
                      onClick={() => {
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
                              {a.grade}-{a.classNum === 0 ? '전체' : a.classNum}반
                              {a.classCode ? ` (${a.classCode})` : ''}
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
                            <p className="text-[10px] text-slate-400 mt-0.5">{a.teacher} 선생님</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[11px] font-extrabold text-indigo-600">{mmdd}</div>
                          <div className="text-[9px] text-slate-400">{wd}요일</div>
                          {a.description && (
                            <div className="mt-1 text-[9px] bg-indigo-600 text-white rounded px-1 py-0.5 font-bold">
                              {a.description}
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

          {/* Panel Footer: count */}
          {!isAssessmentsLoading && (
            <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2 bg-slate-50">
              <p className="text-[10px] text-slate-400 font-medium text-center">
                총 {panelAssessments.length}건의 수행평가
              </p>
            </div>
          )}
        </div>
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
                <label className="block text-xs font-semibold text-gray-500 mb-1">날짜</label>
                <Input
                  value={formatDateWithDay(formData.assessmentDate)}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700 cursor-default"
                />
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
                <Input
                  value={formData.subject}
                  readOnly
                  className="bg-gray-50 font-bold text-sm text-gray-700 cursor-default"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">교시</label>
                <Input
                  value={formData.classTime ? `${formData.classTime}교시` : ""}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700 cursor-default"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">담당 교사</label>
                <Input
                  value={formData.teacher}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700 cursor-default"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">반/그룹 (이동수업)</label>
                <Input
                  value={formData.classCode || "공통"}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700 cursor-default"
                />
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
                <label className="block text-xs font-semibold text-gray-500 mb-1">날짜</label>
                <Input
                  value={formatDateWithDay(formData.assessmentDate)}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700 cursor-default"
                />
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
                <Input
                  value={formData.subject}
                  readOnly
                  className="bg-gray-50 font-bold text-sm text-gray-700 cursor-default"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">교시</label>
                <select
                  className="flex h-10 w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.classTime}
                  onChange={(e) => setFormData({ ...formData, classTime: e.target.value })}
                >
                  {Array.from({ length: 7 }).map((_, idx) => (
                    <option key={idx + 1} value={String(idx + 1)}>{idx + 1}교시</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">담당 교사</label>
                <Input
                  value={formData.teacher}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700 cursor-default"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">반/그룹 (이동수업)</label>
                <Input
                  value={formData.classCode || "공통"}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700 cursor-default"
                />
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
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-white">
                <span className="text-xl">📋</span>
                선생님 선택
              </DialogTitle>
            </DialogHeader>
            <p className="text-indigo-100 text-xs mt-1 font-medium">
              시간표 및 수행평가 목록을 조회할 선생님을 선택해 주세요.
            </p>
          </div>

          {/* Search Bar */}
          <div className="p-3 bg-slate-50 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="선생님 이름 또는 과목 검색..."
                value={teacherSearchQuery}
                onChange={(e) => setTeacherSearchQuery(e.target.value)}
                className="pl-9 pr-8 bg-white border-slate-200 text-sm h-10 rounded-xl focus-visible:ring-indigo-500"
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
          <div className="max-h-[340px] overflow-y-auto p-2 space-y-1">
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
