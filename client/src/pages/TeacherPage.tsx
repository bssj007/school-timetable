import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ChevronLeft, ChevronRight, Plus, Calendar, Trash2, Edit, AlertCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";

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
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
  });

  const { data: grade2Timetable } = useQuery({
    queryKey: ['timetable-all', '2', targetDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=2&classNum=all&targetDate=${encodeURIComponent(targetDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: grade3Timetable } = useQuery({
    queryKey: ['timetable-all', '3', targetDate],
    queryFn: async () => {
      const res = await fetch(`/api/comcigan?type=timetable&grade=3&classNum=all&targetDate=${encodeURIComponent(targetDate)}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
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
  const { data: timetableData, isLoading: isTimetableLoading, isError: isTimetableError, refetch: refetchTimetable, isFetching: isTimetableFetching } = useQuery<TeacherTimetableResponse>({
    queryKey: ['teacher-timetable'],
    queryFn: async () => {
      const res = await fetch('/api/comcigan?type=teacher_timetable');
      if (!res.ok) throw new Error("Failed to fetch teacher timetable");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
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
  const { data: allAssessments, isLoading: isAssessmentsLoading, refetch: refetchAssessments } = useQuery<AssessmentItem[]>({
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
    staleTime: 30 * 1000,
  });

  // Build class+group nav tabs for the right panel
  // Each tab = { grade, classNum, group } — moving class ABCD are split separately
  const classTabs = useMemo(() => {
    const tabs: { id: string; grade: number; classNum: number; group: string; label: string }[] = [];
    if (!selectedSchedule || !allAssessments) return tabs;

    const seenIds = new Set<string>();

    taughtClasses.forEach(({ grade, classNum }) => {
      const classAssessments = (allAssessments || []).filter(
        a => a.grade === grade && (a.classNum === classNum || a.classNum === 0)
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
  }, [taughtClasses, allAssessments, selectedSchedule, computedGroupsG2, computedGroupsG3]);

  const [selectedTabId, setSelectedTabId] = useState<string>('');

  // Auto-select first tab
  useEffect(() => {
    if (classTabs.length > 0 && !classTabs.find(t => t.id === selectedTabId)) {
      setSelectedTabId(classTabs[0].id);
    }
  }, [classTabs]);

  const selectedTab = classTabs.find(t => t.id === selectedTabId) || classTabs[0] || null;

  // Filter assessments for selected tab
  const panelAssessments = useMemo(() => {
    if (!selectedTab || !allAssessments) return [];
    const { grade, classNum, group } = selectedTab;
    return allAssessments.filter(a => {
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
  }, [selectedTab, allAssessments]);

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
    <div className="w-full min-h-screen px-2 md:px-4 py-4 md:py-6">
      <div className="flex gap-4 xl:gap-6 items-start">
      {/* ===== LEFT COLUMN: existing timetable ===== */}
      <div className="flex-1 min-w-0">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 flex items-center gap-2">
            👨‍🏫 <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">교사용 수행평가 등록 시스템</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            시간표에서 수업이 들어있는 칸을 클릭하여 수행평가를 간편하게 등록하고 관리할 수 있습니다.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm" className="rounded-full shadow-sm gap-2">
            <Home className="w-4 h-4" />
            학생 시간표로 돌아가기
          </Button>
        </Link>
      </div>

      {/* Control Card */}
      <Card className="mb-6 border-slate-100 bg-white/60 backdrop-blur-md shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-bold text-gray-700">관리 환경 설정</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-blue-600 rounded-full"
              onClick={() => {
                refetchTimetable();
                refetchAssessments();
              }}
              title="데이터 새로고침"
              disabled={isTimetableFetching}
            >
              <RefreshCw className={`w-4 h-4 ${isTimetableFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Week navigation */}
            <div className="flex items-center justify-center bg-gray-100/80 rounded-full p-1 border border-gray-200">
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 rounded-full hover:bg-white"
                onClick={() => setWeekOffset(weekOffset - 1)}
                disabled={weekOffset <= -2} // limit to past 2 weeks
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold text-gray-600 px-3 min-w-[100px] text-center">
                {weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : `${weekOffset}주 후`} ({weekRangeText})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 rounded-full hover:bg-white"
                onClick={() => setWeekOffset(weekOffset + 1)}
                disabled={weekOffset >= 8} // limit to 8 weeks in advance
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Teacher Select */}
            {timetableData && (
              <div className="w-full sm:w-60">
                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCombobox}
                      className="w-full justify-between bg-white rounded-full border-gray-200 shadow-sm text-sm font-semibold h-10 px-4 hover:bg-white"
                    >
                      <span>
                        {selectedTeacherId
                          ? `${teacherOptions.find(o => o.idx.toString() === selectedTeacherId)?.label || getTeacherDisplayName(timetableData.teachers[parseInt(selectedTeacherId, 10)], parseInt(selectedTeacherId, 10))} 선생님`
                          : "교사 선택"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="선생님 이름 검색..." className="h-9" />
                      <CommandList className="max-h-[250px]">
                        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                          {teacherOptions.map((opt) => {
                            const isSelected = selectedTeacherId === opt.idx.toString();
                            
                            return (
                              <CommandItem
                                key={opt.idx}
                                value={opt.label}
                                onSelect={() => {
                                  setSelectedTeacherId(opt.idx.toString());
                                  setOpenCombobox(false);
                                }}
                                className="flex items-center justify-between text-sm font-medium cursor-pointer"
                              >
                                <span>{opt.label} 선생님</span>
                                <Check
                                  className={cn(
                                    "h-4 w-4 text-blue-600",
                                    isSelected ? "opacity-100" : "opacity-0"
                                  )}
                                />
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Main Timetable Card */}
      <Card className="w-full shadow-sm overflow-hidden border-slate-100 bg-white">
        <CardContent className="p-0">
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
              <table className="w-full border-collapse bg-white table-fixed">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="w-8 md:w-10 h-8 md:h-10 bg-gray-50/60 text-gray-400 font-bold text-[10px] md:text-xs text-center border-r border-gray-100">교시</th>
                    {weekdays.map((day, idx) => {
                      const dDate = weekDates[idx];
                      const formattedD = `${dDate.getMonth() + 1}/${dDate.getDate()}`;
                      return (
                        <th key={day} className="h-8 md:h-10 bg-gray-50 text-gray-700 font-bold text-xs md:text-sm border-r border-gray-100 last:border-r-0">
                          <div className="flex flex-col items-center justify-center">
                            <span className="text-gray-900 text-xs md:text-sm">{day}요일</span>
                            <span className="text-[9px] md:text-[11px] text-gray-400 font-medium mt-0.5">{formattedD}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Array.from({ length: maxPeriods }).map((_, periodIndex) => {
                    const p = periodIndex + 1;
                    return (
                      <tr key={p} className="hover:bg-slate-50/40 transition-colors">
                        <td className="w-8 md:w-10 h-16 md:h-20 text-center font-extrabold text-xs md:text-lg text-gray-400 bg-gray-50/30 border-r border-gray-100">
                          {p}
                        </td>
                        {weekdays.map((_, dayIndex) => {
                          const d = dayIndex + 1;
                          const val = selectedSchedule[d]?.[p];
                          const cellData = decodeCell(val);
                          const cellDateStr = toDateString(weekDates[dayIndex]);
                          
                          // Resolve group for this cell
                          let cellGroup = "";
                          if (cellData) {
                            if (cellData.grade === 2) {
                              cellGroup = computedGroupsG2[`${dayIndex}-${p}`] || "";
                            } else if (cellData.grade === 3) {
                              cellGroup = computedGroupsG3[`${dayIndex}-${p}`] || "";
                            }
                          }
                          
                          // Find assessments for this slot
                          const cellAssessments = cellData ? (allAssessments || []).filter(a => {
                            if (a.grade !== cellData.grade) return false;
                            if (a.classNum !== cellData.classNum && a.classNum !== 0) return false;
                            if (a.dueDate !== cellDateStr) return false;
                            if (a.classTime !== p) return false;
                            
                            // Group check matching Dashboard.tsx
                            if (a.classCode && a.classCode.trim()) {
                              const allowedGroups = a.classCode.split(",").map((s: string) => s.trim()).filter(Boolean);
                              if (cellGroup && allowedGroups.length > 0 && !allowedGroups.includes(cellGroup)) {
                                return false;
                              }
                            }
                            return true;
                          }) : [];

                          return (
                            <td 
                              key={d} 
                              className={`border-r border-gray-100 last:border-r-0 p-1 md:p-1.5 align-top transition-all duration-200 relative group h-16 md:h-20
                                ${cellData ? 'cursor-pointer hover:bg-blue-50/20' : 'bg-gray-50/10'} 
                                ${cellAssessments.length > 0 ? 'bg-indigo-50/20 border-l-2 border-l-indigo-400' : ''}`}
                              onClick={() => cellData && handleCellClick(dayIndex, p, val)}
                            >
                              {cellData ? (
                                <div className="flex flex-col h-full justify-between gap-1">
                                  {/* Class & Subject */}
                                  <div className="flex flex-col gap-0.5 md:gap-1 items-start w-full">
                                    <span className="text-[8px] md:text-[10px] px-1 md:px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                                      {cellData.grade}-{cellData.classNum}{cellGroup ? `(${cellGroup})` : ''}
                                    </span>
                                    <span className={`font-bold text-slate-800 tracking-tight leading-tight truncate w-full ${(cellData.subjectName || "").length > 6 ? 'text-[8px] md:text-[10px] break-keep' : (cellData.subjectName || "").length > 4 ? 'text-[9px] md:text-[11px]' : 'text-[10px] md:text-sm'}`} title={cellData.subjectName}>
                                      {cellData.subjectName}
                                    </span>
                                  </div>
                                  
                                  {/* Assessments Badge */}
                                  {cellAssessments.length > 0 ? (
                                    <div className="mt-0.5 flex flex-col gap-0.5 items-stretch w-full">
                                      {cellAssessments.map(a => (
                                        <div 
                                          key={a.id}
                                          className="text-[8px] md:text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white font-semibold shadow-sm leading-tight flex items-center justify-between gap-1 w-full"
                                          title={`[${a.description || '수행'}] ${a.title}`}
                                        >
                                          <span className="truncate flex-1 text-left">{a.title}</span>
                                          <span className="shrink-0 text-[7px] md:text-[8px] bg-indigo-800/80 px-1 py-0.5 rounded font-bold whitespace-nowrap">
                                            {a.description && a.description.includes("차") ? a.description : '평가'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-auto flex items-center justify-center py-0.5">
                                      <span className="text-[9px] md:text-[10px] text-blue-500 font-bold flex items-center gap-0.5">
                                        <Plus className="w-2.5 h-2.5 md:w-3 md:h-3" /> 등록
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
        </CardContent>
      </Card>

      </div>{/* end left column */}

      {/* ===== RIGHT COLUMN: Assessment Viewer Panel ===== */}
      <div className="w-[320px] xl:w-[360px] shrink-0 flex flex-col" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 2rem)' }}>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden flex flex-col h-full" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
          {/* Panel Header */}
          <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-indigo-600 to-blue-500 text-white flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">📋</span>
              <h2 className="text-lg font-extrabold tracking-tight leading-tight">
                {teacherName ? `${teacherName} 선생님!` : '선생님!'}
              </h2>
            </div>
            <p className="text-indigo-100 text-xs font-medium">수행평가 전체 목록</p>
          </div>

          {/* Class Navigation Tabs */}
          <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50">
            <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
              {classTabs.length === 0 ? (
                <span className="text-xs text-slate-400 py-1 px-2">담당 반 없음</span>
              ) : (
                classTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedTabId(tab.id)}
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
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {isAssessmentsLoading ? (
              <div className="space-y-2 mt-2">
                {[1,2,3].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : panelAssessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <span className="text-3xl mb-2">📭</span>
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
      </div>{/* end right column */}

      </div>{/* end flex row */}

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
                  type="date"
                  value={formData.assessmentDate}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700"
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
                  className="bg-gray-50 font-bold text-sm text-gray-700"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">교시</label>
                <Input
                  value={formData.classTime ? `${formData.classTime}교시` : ""}
                  readOnly
                  className="bg-gray-50 font-medium text-sm text-gray-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">담당 교사</label>
                <Input
                  value={formData.teacher}
                  onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
                  placeholder="교사 이름"
                  required
                  className="font-medium text-sm border-gray-200"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">반/그룹 (이동수업)</label>
                <Input
                  value={formData.classCode}
                  onChange={(e) => setFormData({ ...formData, classCode: e.target.value })}
                  placeholder="예: A, B (공통이면 비워둠)"
                  className="font-medium text-sm border-gray-200"
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
                  type="date"
                  value={formData.assessmentDate}
                  onChange={(e) => setFormData({ ...formData, assessmentDate: e.target.value })}
                  required
                  className="font-medium text-sm text-gray-700 border-gray-200"
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
                  className="bg-gray-50 font-bold text-sm text-gray-700"
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
                  onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
                  placeholder="교사 이름"
                  required
                  className="font-medium text-sm border-gray-200"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">반/그룹 (이동수업)</label>
                <Input
                  value={formData.classCode}
                  onChange={(e) => setFormData({ ...formData, classCode: e.target.value })}
                  placeholder="예: A, B"
                  className="font-medium text-sm border-gray-200"
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
    </div>
  );
}
