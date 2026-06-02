import React, { useState, useMemo, useEffect } from 'react';
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
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [activeDayTab, setActiveDayTab] = useState<number>(() => {
    const today = new Date();
    const day = today.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    if (day === 0 || day === 6) return 0;
    return day - 1;
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

  const tId = parseInt(selectedTeacherId, 10);
  const teacherName = timetableData?.teachers?.[tId] || "";
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
      const res = await fetch(`/api/assessment?id=${id}`, {
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
    <div className="container max-w-5xl mx-auto px-4 py-6">
      
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
                <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                  <SelectTrigger className="w-full bg-white rounded-full border-gray-200 shadow-sm text-sm font-semibold">
                    <SelectValue placeholder="교사 선택" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {timetableData.teachers.map((name, idx) => {
                      if (idx === 0) return null; // Skip '*'
                      return (
                        <SelectItem key={idx} value={idx.toString()} className="font-medium text-sm">
                          {name} 선생님
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
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
            <>
              {/* Desktop Table Grid View */}
              <div className="hidden md:block overflow-x-auto w-full">
                <table className="w-full min-w-[750px] border-collapse bg-white table-fixed">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="w-16 h-12 bg-gray-50/60 text-gray-400 font-bold text-xs text-center border-r border-gray-100">교시</th>
                      {weekdays.map((day, idx) => {
                        const dDate = weekDates[idx];
                        const formattedD = `${dDate.getMonth() + 1}/${dDate.getDate()}`;
                        return (
                          <th key={day} className="h-14 bg-gray-50 text-gray-700 font-bold text-sm border-r border-gray-100 last:border-r-0">
                            <div className="flex flex-col items-center justify-center">
                              <span className="text-gray-900">{day}요일</span>
                              <span className="text-[11px] text-gray-400 font-medium mt-0.5">{formattedD}</span>
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
                          <td className="w-16 h-24 text-center font-extrabold text-gray-400 bg-gray-50/30 border-r border-gray-100">
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
                                className={`border-r border-gray-100 last:border-r-0 p-1.5 align-top transition-all duration-200 relative group
                                  ${cellData ? 'cursor-pointer hover:bg-blue-50/20' : 'bg-gray-50/10'} 
                                  ${cellAssessments.length > 0 ? 'bg-indigo-50/20 border-l-2 border-l-indigo-400' : ''}`}
                                onClick={() => cellData && handleCellClick(dayIndex, p, val)}
                              >
                                {cellData ? (
                                  <div className="flex flex-col h-full justify-between min-h-[5.5rem]">
                                    {/* Class & Subject */}
                                    <div className="flex flex-col gap-1 items-start">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                                        {cellData.grade}-{cellData.classNum}{cellGroup ? ` (${cellGroup})` : ''}
                                      </span>
                                      <span className="font-bold text-[13px] text-slate-800 tracking-tight leading-tight">
                                        {cellData.subjectName}
                                      </span>
                                    </div>
                                    
                                    {/* Assessments Badge */}
                                    {cellAssessments.length > 0 ? (
                                      <div className="mt-2 space-y-1">
                                        {cellAssessments.map(a => (
                                          <div 
                                            key={a.id}
                                            className="text-[10px] px-1.5 py-1 rounded bg-indigo-600 text-white font-semibold truncate shadow-sm flex items-center justify-between"
                                            title={`[${a.description || '수행'}] ${a.title}`}
                                          >
                                            <span className="truncate">{a.title}</span>
                                            <span className="text-[8px] bg-indigo-800 px-1 py-0.5 rounded ml-1 shrink-0">{a.description || '평가'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-auto flex items-center justify-center py-1">
                                        <span className="text-[10px] text-blue-500 font-bold flex items-center gap-1">
                                          <Plus className="w-3 h-3" /> 등록
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

              {/* Mobile Timeline View */}
              <div className="block md:hidden p-4 space-y-4 bg-slate-50/50">
                {/* Day Tab Selector */}
                <div className="flex bg-gray-100/80 p-1.5 rounded-xl border border-gray-200 gap-1">
                  {weekdays.map((day, idx) => {
                    const isActive = activeDayTab === idx;
                    const dDate = weekDates[idx];
                    const formattedD = `${dDate.getMonth() + 1}/${dDate.getDate()}`;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setActiveDayTab(idx)}
                        className={`flex-1 py-2 px-1 rounded-lg text-center transition-all duration-200 ${
                          isActive
                            ? 'bg-white text-blue-600 shadow-sm font-bold scale-[1.02] border border-slate-100'
                            : 'text-gray-500 hover:text-gray-800 text-xs font-semibold'
                        }`}
                      >
                        <div className="text-sm">{day}</div>
                        <div className={`text-[10px] ${isActive ? 'text-blue-400 font-bold' : 'text-gray-400'} font-normal mt-0.5`}>
                          {formattedD}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Vertical Chronological Period Timeline */}
                <div className="space-y-3">
                  {Array.from({ length: maxPeriods }).map((_, periodIndex) => {
                    const p = periodIndex + 1;
                    const val = selectedSchedule[activeDayTab + 1]?.[p];
                    const cellData = decodeCell(val);
                    const cellDateStr = toDateString(weekDates[activeDayTab]);

                    // Resolve group
                    let cellGroup = "";
                    if (cellData) {
                      if (cellData.grade === 2) {
                        cellGroup = computedGroupsG2[`${activeDayTab}-${p}`] || "";
                      } else if (cellData.grade === 3) {
                        cellGroup = computedGroupsG3[`${activeDayTab}-${p}`] || "";
                      }
                    }

                    // Find assessments for this slot
                    const cellAssessments = cellData ? (allAssessments || []).filter(a => {
                      if (a.grade !== cellData.grade) return false;
                      if (a.classNum !== cellData.classNum && a.classNum !== 0) return false;
                      if (a.dueDate !== cellDateStr) return false;
                      if (a.classTime !== p) return false;
                      if (a.classCode && a.classCode.trim()) {
                        const allowedGroups = a.classCode.split(",").map((s: string) => s.trim()).filter(Boolean);
                        if (cellGroup && allowedGroups.length > 0 && !allowedGroups.includes(cellGroup)) {
                          return false;
                        }
                      }
                      return true;
                    }) : [];

                    return (
                      <div
                        key={p}
                        onClick={() => cellData && handleCellClick(activeDayTab, p, val)}
                        className={`flex items-stretch rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all duration-200 active:scale-[0.98] ${
                          cellData ? 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/5' : 'opacity-50 bg-gray-50/40'
                        } ${
                          cellAssessments.length > 0 ? 'border-l-4 border-l-indigo-500 bg-indigo-50/10' : ''
                        }`}
                      >
                        {/* Left: Period Badge */}
                        <div className="flex flex-col items-center justify-center border-r border-slate-100 pr-3.5 mr-3.5 min-w-[50px] shrink-0">
                          <span className="text-2xl font-extrabold text-slate-700">{p}</span>
                          <span className="text-[10px] text-slate-400 font-semibold mt-0.5">교시</span>
                        </div>

                        {/* Right: Content */}
                        <div className="flex-1 flex flex-col justify-between min-h-[4rem] gap-2">
                          {cellData ? (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-col items-start gap-1">
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                                    {cellData.grade}학년 {cellData.classNum}반{cellGroup ? ` (${cellGroup}그룹)` : ''}
                                  </span>
                                  <h4 className="font-extrabold text-[15px] text-slate-800 tracking-tight leading-tight">
                                    {cellData.subjectName}
                                  </h4>
                                </div>

                                {/* Click Indicator */}
                                {cellAssessments.length === 0 && (
                                  <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-lg shrink-0 flex items-center gap-0.5">
                                    <Plus className="w-3.5 h-3.5" /> 등록
                                  </span>
                                )}
                              </div>

                              {/* Performance Assessments */}
                              {cellAssessments.length > 0 && (
                                <div className="space-y-1.5 mt-1 border-t border-slate-100/60 pt-2">
                                  {cellAssessments.map(a => (
                                    <div
                                      key={a.id}
                                      className="flex items-center justify-between gap-2 bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg shadow-sm text-xs font-semibold"
                                    >
                                      <span className="truncate">{a.title}</span>
                                      <span className="shrink-0 text-[10px] bg-indigo-800 px-1.5 py-0.5 rounded font-bold">
                                        {a.description || '수행'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center h-full text-slate-400 text-xs italic py-2">
                              수업 없음 (공강)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

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
