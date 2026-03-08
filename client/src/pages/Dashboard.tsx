
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Route, Switch, useLocation, Link } from "wouter";
import { Loader2, Trash2, Plus, Download, ChevronLeft, ChevronRight, Pencil, LogOut, ArrowUp, ShieldAlert, AlertTriangle, Printer, Image as ImageIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { useUserConfig } from "@/contexts/UserConfigContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import ElectiveSelectionDialog from "@/components/ElectiveSelectionDialog";

// 타입 정의
interface TimetableItem {
  weekday: number;
  classTime: number;
  subject: string;
  teacher: string;
  class?: number;
}

interface AssessmentItem {
  id: number;
  title: string;
  subject: string;
  description: string;
  dueDate: string;
  isDone: number;
  classTime?: number;
  weekday?: number;
  round?: number; // 차수 추가
}

// 주의 시작일 계산 (월요일 기준)
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// 날짜 포맷팅
function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 주간 날짜 배열 생성
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

// 날짜를 YYYY-MM-DD 형식으로 변환 (로컬 시간 기준)
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 날짜가 특정 주에 속하는지 확인
function isDateInWeek(dateStr: string, weekDates: Date[]): boolean {
  const date = new Date(dateStr);
  const startDate = new Date(weekDates[0]);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(weekDates[4]);
  endDate.setHours(23, 59, 59, 999);

  return date >= startDate && date <= endDate;
}

// 컴포넌트 외부에 기본 인쇄 크기 상수 정의
const DEFAULT_PRINT_WIDTH = "9";
const DEFAULT_PRINT_HEIGHT = "11";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { schoolName, grade, classNum, isConfigured, setConfig, kakaoUser, studentNumber, refreshKakaoUser } = useUserConfig();

  const handleLogout = async () => {
    try {
      await fetch('/api/kakao/logout');
      await refreshKakaoUser();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const [weekOffset, setWeekOffset] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    return (day === 0 || day === 6) ? 1 : 0;
  });
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const [selectedCell, setSelectedCell] = useState<{ weekday: number, classTime: number } | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewingAssessments, setViewingAssessments] = useState<AssessmentItem[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<AssessmentItem | null>(null);


  // ... previous imports


  // ... existing code ...

  const [formData, setFormData] = useState({
    assessmentDate: "",
    subject: "",
    content: "",
    classTime: "",
    round: "1",
  });

  const [showElectiveDialog, setShowElectiveDialog] = useState(false);
  const [isElectiveEntered, setIsElectiveEntered] = useState<boolean>(true);
  const [showElectiveWarning, setShowElectiveWarning] = useState<boolean>(false);
  const [showInstructionTooltip, setShowInstructionTooltip] = useState<boolean>(false);
  const initialConfigRef = useRef(`${grade}-${classNum}-${studentNumber}`);
  // Track whether the instruction tooltip was visible before the elective dialog opened
  const tooltipWasVisibleRef = useRef(false);

  // Bug report state
  const [showBugReportDialog, setShowBugReportDialog] = useState(false);
  const [bugReportMessage, setBugReportMessage] = useState("");
  const [isBugReportSending, setIsBugReportSending] = useState(false);

  // 인쇄 / 내보내기 state
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printMode, setPrintMode] = useState<'select' | 'printer'>('select');
  const [includeAssessments, setIncludeAssessments] = useState(true);

  // Preset Constants
  const PRINT_PRESETS = [
    { id: 'desk', label: '책상용', width: '9', height: '11' },
    { id: 'pencil', label: '필통용', width: '9', height: '8' },
    { id: 'large', label: '대형', width: '17', height: '20' },
  ];
  const PRINT_THEMES = [
    { id: 'simple', label: '심플' },
    { id: 'color', label: '컬러' },
    { id: 'pink', label: '핫핑크' },
  ];
  const [printPreset, setPrintPreset] = useState<string>('desk');
  const [printTheme, setPrintTheme] = useState<string>('simple');
  const [printWidth, setPrintWidth] = useState<string>('9');
  const [printHeight, setPrintHeight] = useState<string>('11');
  const timetableRef = useRef<HTMLDivElement>(null);

  // Compute print scales relative to a standard printable A4 area (roughly 19cm x 27cm)
  const basePrintWidthCm = 19;
  const basePrintHeightCm = 27;
  const printScaleX = (parseFloat(printWidth) || basePrintWidthCm) / basePrintWidthCm;
  const printScaleY = (parseFloat(printHeight) || basePrintHeightCm) / basePrintHeightCm;

  const resetPrintOptions = () => {
    setPrintMode('select');
    setIncludeAssessments(true);
    setPrintPreset('desk');
    setPrintTheme('simple');
    setPrintWidth('9');
    setPrintHeight('11');
  };

  // PNG 다운로드 핸들러
  const handleDownloadPng = async () => {
    if (!timetableRef.current) return;

    // Close dialog first to ensure it's not in the way
    setShowPrintOptions(false);

    try {
      // Small delay to let dialog close animation finish
      await new Promise(r => setTimeout(r, 300));

      document.body.classList.add('capturing');
      // Extra delay for 'capturing' styles to apply
      await new Promise(r => setTimeout(r, 100));

      const dataUrl = await toPng(timetableRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        width: 800,
        height: 800,
        style: {
          margin: '0',
          padding: '30px',
        }
      });

      document.body.classList.remove('capturing');

      const link = document.createElement('a');
      link.download = `${grade}학년_${classNum}반_시간표.png`;
      link.href = dataUrl;
      link.click();

      toast.success("시간표 이미지가 저장되었습니다.");
      resetPrintOptions();
    } catch (err) {
      document.body.classList.remove('capturing');
      console.error("이미지 저장 실패:", err);
      toast.error("이미지 저장 중 오류가 발생했습니다.");
      resetPrintOptions();
    }
  };

  // 인쇄 핸들러
  const handlePrint = () => {
    setShowPrintOptions(false);
    setTimeout(() => {
      window.print();
      resetPrintOptions();
    }, 100);
  };


  // Extract datasetId early for use in effects
  const datasetId = (queryClient.getQueryData(['timetable', schoolName, grade, classNum]) as any)?.datasetId || '';

  // 2, 3학년 선택과목 설정 확인
  useEffect(() => {
    if ((grade === "2" || grade === "3") && classNum && studentNumber && datasetId) {
      // Check if electives are already set for this dataset
      fetch(`/api/electives?type=student&grade=${grade}&classNum=${classNum}&studentNumber=${studentNumber}&dataset=${datasetId}`)
        .then(res => res.json())
        .then(data => {
          // If no profile or no electives, show dialog
          if (!data || !data.electives || Object.keys(data.electives).length === 0) {
            setIsElectiveEntered(false);
            setShowElectiveWarning(true);
          } else {
            setIsElectiveEntered(true);
            setShowElectiveWarning(false);
          }
        })
        .catch(err => {
          console.error("Failed to check electives", err);
        });
    } else {
      setIsElectiveEntered(true);
      setShowElectiveWarning(false);
    }
  }, [grade, classNum, studentNumber, datasetId]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const isSetupComplete = isConfigured && (grade === "1" || isElectiveEntered);

    if (isSetupComplete) {
      timeoutId = setTimeout(() => {
        setShowInstructionTooltip(true);
      }, 4000);
    } else {
      setShowInstructionTooltip(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isConfigured, grade, isElectiveEntered]);

  // Hide instruction tooltip while the elective dialog is open, restore on close
  useEffect(() => {
    if (showElectiveDialog) {
      tooltipWasVisibleRef.current = showInstructionTooltip;
      if (showInstructionTooltip) setShowInstructionTooltip(false);
    } else {
      if (tooltipWasVisibleRef.current) setShowInstructionTooltip(true);
    }
  }, [showElectiveDialog]);

  // 1. 시간표 조회
  // 1. 시간표 조회
  // 시간표 셀 클릭 핸들러
  const handleCellClick = (
    weekdayIdx: number,
    classTime: number,
    subject: string,
    date: Date,
    cellAssessments: AssessmentItem[]
  ) => {
    const today = new Date();
    const todayStr = toDateString(today);
    const cellDateStr = toDateString(date);
    const isPast = cellDateStr < todayStr;

    // 선택 효과를 위해 상태 설정
    setSelectedCell({ weekday: weekdayIdx, classTime });

    // 시각적 피드백을 위해 약간의 지연 후 다이얼로그 오픈
    setTimeout(() => {
      if (cellAssessments.length > 0) {
        // 수행평가가 있으면 정보 다이얼로그 표시 (과거 내역도 조회는 가능)
        setViewingAssessments(cellAssessments);
        setShowViewDialog(true);
      } else {
        // 과거 날짜는 추가 불가
        if (isPast) {
          toast.error("지나간 날짜에는 수행평가를 추가할 수 없습니다.");
          setSelectedCell(null);
          return;
        }

        // 수행평가가 없으면 추가 다이얼로그 표시
        setFormData({
          assessmentDate: cellDateStr,
          subject: subject,
          content: "",
          classTime: classTime.toString(),
          round: "1",
        });
        setShowAddDialog(true);
      }
    }, 150);
  };

  // 1. 시간표 조회
  const { data: rawTimetableData, isLoading: timetableLoading, isFetching: isTimetableFetching, refetch: refetchTimetable } = useQuery({
    queryKey: ['timetable', schoolName, grade, classNum],
    queryFn: async () => {
      if (!grade || !classNum) return [];
      try {
        const queryClassNum = (grade === "2" || grade === "3") ? "all" : classNum;
        const response = await fetch(`/api/comcigan?type=timetable&grade=${grade}&classNum=${queryClassNum}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch from Comcigan: ${response.status}`);
        }
        const result = await response.json();
        console.log('[Dashboard] Timetable data:', result);

        if (result.data && Array.isArray(result.data)) {
          const mappedData = result.data.map((item: any) => ({
            ...item,
            weekday: item.weekday
          })) as TimetableItem[];
          // Attach datasetId for downstream queries
          (mappedData as any).datasetId = result.datasetId;
          return mappedData;
        }
        const emptyArray = [] as TimetableItem[];
        (emptyArray as any).datasetId = result.datasetId;
        return emptyArray;
      } catch (e) {
        console.error('Failed to fetch timetable', e);
        throw e;
      }
    },
    enabled: !!grade && !!classNum && !!schoolName,
    retry: true, // 무한 재시도
    retryDelay: 3000, // 3초 간격
  });

  // 1.5 선택과목 데이터 및 프로필 조회 (2, 3학년용)
  const { data: electiveConfigs, isFetching: isElectiveConfigsFetching } = useQuery({
    queryKey: ['electiveConfigs', grade, datasetId],
    queryFn: async () => {
      if ((grade !== "2" && grade !== "3") || !datasetId) return [];
      const res = await fetch(`/api/electives?grade=${grade}&dataset=${datasetId}`);
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`Failed to fetch elective configs: ${res.status}`);
      }
      return res.json();
    },
    enabled: (grade === "2" || grade === "3") && !!datasetId
  });

  const { data: studentProfile } = useQuery({
    queryKey: ['studentProfile', grade, classNum, studentNumber, datasetId],
    queryFn: async () => {
      if ((grade !== "2" && grade !== "3") || !classNum || !studentNumber || !datasetId) return null;
      const res = await fetch(`/api/electives?type=student&grade=${grade}&classNum=${classNum}&studentNumber=${studentNumber}&dataset=${datasetId}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Failed to fetch student profile: ${res.status}`);
      }
      const data = await res.json();
      if (data && data.electives) {
        if (typeof data.electives === 'string') {
          try {
            data.electives = JSON.parse(data.electives);
          } catch { }
        }
      }
      return data;
    },
    enabled: !!grade && !!classNum && !!studentNumber && (grade === "2" || grade === "3") && !!datasetId
  });

  const lastValidProfileRef = React.useRef<any>(null);
  const currentProfile = React.useMemo(() => {
    if (grade !== "2" && grade !== "3") {
      lastValidProfileRef.current = null;
      return null;
    }
    if (studentProfile !== undefined) {
      lastValidProfileRef.current = studentProfile;
      return studentProfile;
    }
    return lastValidProfileRef.current; // retain only if undefined (e.g. background fetch just started, though usually data stays populated)
  }, [studentProfile, grade]);

  const { timetableData, allClassesTimetable } = useMemo(() => {
    if (!rawTimetableData) return { timetableData: [], allClassesTimetable: [] };
    const all = rawTimetableData;
    const current = all.filter(t => !t.class || t.class.toString() === classNum.toString());
    return { timetableData: current, allClassesTimetable: all };
  }, [rawTimetableData, classNum]);

  // 5. 설정 조회 (Public)
  const { data: settings } = useQuery({
    queryKey: ['publicSettings'],
    queryFn: async () => {
      const res = await fetch('/api/settings/public');
      if (!res.ok) return { hide_past_assessments: false };
      return res.json();
    },
    staleTime: 0, // 항상 최신 설정을 가져오도록 (그룹 override 등 즉시 반영)
  });

  // 각 시간(교시)별 다수결 그룹 계산
  // We keep track of the last successfully computed groups to prevent flickering during refetches.
  const lastValidGroupsRef = React.useRef<Record<string, string>>({});

  const computedGroups = useMemo(() => {
    if (grade !== "2" && grade !== "3") {
      lastValidGroupsRef.current = {};
      return {};
    }
    // 시간표 데이터 자체가 없으면 마지막 유효값 유지
    if (!allClassesTimetable || allClassesTimetable.length === 0) {
      return lastValidGroupsRef.current;
    }

    const cellGroups: Record<string, string> = {};

    // electiveConfigs가 있을 때만 자동 감지 수행
    if (electiveConfigs && electiveConfigs.length > 0) {
      const subjectTeacherToGroups = new Map<string, string[]>();
      const subjectToGroups = new Map<string, string[]>();

      electiveConfigs.forEach((c: any) => {
        const isFreePeriod = ["빈교실", "공강", "Empty", "Free"].some(k => (c.subject || "").includes(k));
        if ((c.isMovingClass !== 0 || isFreePeriod) && c.classCode) {
          const codes = c.classCode.split(',').map((code: string) => code.trim()).filter(Boolean);
          const subj = c.subject.trim();

          // Optional fallback to just subject
          const existing = subjectToGroups.get(subj) || [];
          subjectToGroups.set(subj, Array.from(new Set([...existing, ...codes])));

          // Strict subject + teacher mapping
          // We must include BOTH originalTeacher and fullTeacherName, because
          // Comcigan usually provides a 2-character teacher name (originalTeacher).
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

    // Override는 electiveConfigs 유무와 무관하게 항상 적용
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

    lastValidGroupsRef.current = cellGroups;
    return cellGroups;
  }, [allClassesTimetable, electiveConfigs, grade, settings?.elective_group_overrides]);

  // 2. 컴시간에서 시간표 가져오기
  const fetchFromComcigan = useMutation({
    mutationFn: async () => {
      if (!schoolName || !grade || !classNum) {
        throw new Error('학교, 학년, 반 정보가 필요합니다');
      }

      const res = await fetch('/api/comcigan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolName,
          grade: parseInt(grade),
          classNum: parseInt(classNum),
        }),
      });

      if (!res.ok) {
        throw new Error('시간표 가져오기 실패');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data?.message || '시간표를 성공적으로 가져왔습니다!');
      refetchTimetable();
    },
    onError: (error: Error) => {
      toast.error(error.message || '시간표 가져오기 실패');
    },
  });

  // 3. 수행평가 목록 조회
  const { data: allAssessments, isLoading: assessmentLoading } = useQuery({
    queryKey: ['assessments', grade, classNum],
    queryFn: async () => {
      if (!grade || !classNum) return [];
      try {
        const res = await fetch(`/api/assessment?grade=${grade}&classNum=${classNum}`);
        if (!res.ok) {
          if (res.status === 404) return [];
          throw new Error(`API Error: ${res.status}`);
        }
        return await res.json() as AssessmentItem[];
      } catch (e) {
        console.warn('Failed to fetch assessments:', e);
        throw e;
      }
    },
    enabled: !!grade && !!classNum,
    refetchInterval: 2000,
  });

  // 현재 주에 해당하는 수행평가만 필터링 및 정렬
  const assessments = useMemo(() => {
    if (!allAssessments) return [];

    // 1. Filter by Week
    const filtered = allAssessments.filter(a => isDateInWeek(a.dueDate, weekDates));

    // 2. Sort: Date ASC -> Period (classTime) ASC
    filtered.sort((a, b) => {
      // Date Comparison
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      if (dateA !== dateB) return dateA - dateB;

      // Period Comparison (If same date)
      // Treat null/undefined classTime as larger (end of list)
      const periodA = a.classTime || 99;
      const periodB = b.classTime || 99;
      return periodA - periodB;
    });

    console.log('[Assessments Filter & Sort]', {
      weekRange: `${toDateString(weekDates[0])} ~ ${toDateString(weekDates[4])}`,
      totalAssessments: allAssessments.length,
      filteredAssessments: filtered.length,
      sorted: filtered.map(a => ({ subject: a.subject, date: a.dueDate, classTime: a.classTime }))
    });
    return filtered;
  }, [allAssessments, weekDates]);

  // 4. 수행평가 추가
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.content,
          subject: data.subject,
          description: data.round ? `${data.round}차` : "",
          dueDate: data.assessmentDate,
          grade: parseInt(grade),
          classNum: parseInt(classNum),
          classTime: data.classTime ? parseInt(data.classTime) : null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success("수행평가가 등록되었습니다");
    },
    onError: (error) => toast.error(error.message || "등록 실패")
  });

  // 5. 수행평가 삭제
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/assessment?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success("삭제되었습니다");
      setSelectedCell(null);
    }
  });

  // 6. 수행평가 수정
  const updateMutation = useMutation({
    mutationFn: async (data: AssessmentItem) => {
      const res = await fetch(`/api/assessment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success("수행평가가 수정되었습니다");
      setShowEditDialog(false);
      setEditingAssessment(null);
      setSelectedCell(null);
    },
    onError: (error) => toast.error(error.message || "수정 실패")
  });

  // 시간표에서 고유한 과목 목록 추출
  const uniqueSubjects = useMemo(() => {
    if (!timetableData || !Array.isArray(timetableData)) return [];
    const subjects = new Set<string>();
    const excludedSubjects = ["창체", "채플"];

    timetableData.forEach((item) => {
      if (item.subject && typeof item.subject === "string" && !excludedSubjects.includes(item.subject)) {
        subjects.add(item.subject);
      }
    });
    return Array.from(subjects).sort();
  }, [timetableData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      setFormData({
        assessmentDate: "",
        subject: "",
        content: "",
        classTime: "",
        round: "1",
      });
      setShowAddDialog(false); // 다이얼로그 닫기
      setSelectedCell(null); // 선택 셀 해제
    } catch (error) {
      console.error("수행평가 생성 실패:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error("수행평가 삭제 실패:", error);
    }
  };

  const handleEditClick = (assessment: AssessmentItem) => {
    setEditingAssessment(assessment);

    // Parse the stored sequence/round number back from the description ("1차" -> "1")
    let parsedRound = "1";
    if (assessment.description && assessment.description.includes("차")) {
      parsedRound = assessment.description.replace("차", "").trim();
    }

    setFormData({
      assessmentDate: assessment.dueDate,
      subject: assessment.subject,
      content: assessment.title,
      classTime: assessment.classTime?.toString() || "",
      round: parsedRound,
    });
    setShowViewDialog(false);
    setShowEditDialog(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssessment) return;

    try {
      await updateMutation.mutateAsync({
        ...editingAssessment,
        title: formData.content,
        dueDate: formData.assessmentDate,
        classTime: formData.classTime ? parseInt(formData.classTime) : undefined,
        description: formData.round ? `${formData.round}차` : "",
      });
    } catch (error) {
      console.error("수행평가 수정 실패:", error);
    }
  };

  // 요일별로 시간표 데이터를 그룹화
  const weekdayNames = ["월", "화", "수", "목", "금"];
  const timetableByDay: Record<number, TimetableItem[]> = {};

  if (timetableData && Array.isArray(timetableData)) {
    timetableData.forEach((item) => {
      if (!timetableByDay[item.weekday]) {
        timetableByDay[item.weekday] = [];
      }
      timetableByDay[item.weekday].push(item);
    });
  }

  // For print export (moved above early returns)
  const formattedStudentId = useMemo(() => {
    return `${grade}${classNum}${studentNumber?.padStart(2, '0') || '00'}`;
  }, [grade, classNum, studentNumber]);

  const electiveSummary = useMemo(() => {
    if (!currentProfile?.electives) return "";
    return Object.entries(currentProfile.electives)
      .filter(([_, e]: [string, any]) => e && e.subject)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, e]: [string, any]) => `${group}: ${e.subject}`)
      .join(", ");
  }, [currentProfile]);

  const isLoading = timetableLoading || assessmentLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin mr-2" />
        로드 중...
      </div>
    );
  }

  // Check Maintenance Mode First
  const isMaintenanceActive = Boolean(settings?.maintenance_mode?.active && !settings?.is_whitelisted);

  if (isMaintenanceActive) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 text-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-red-100 p-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">사이트 점검 중</h2>
          <p className="text-gray-600 mb-6 whitespace-pre-wrap leading-relaxed">
            {settings?.maintenance_mode?.message || "서버 안정화 작업이 진행 중입니다.\n잠시 후 다시 접속해 주세요."}
          </p>
          {settings?.maintenance_mode?.endTime && (
            <div className="py-2 px-4 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium">
              점검 종료 예정: {new Date(settings.maintenance_mode.endTime).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isRestricted = Boolean(settings?.restricted_grades?.includes(parseInt(grade)) && !settings?.is_whitelisted);
  const isKakaoRestricted = Boolean(settings?.kakao_login_restricted && !settings?.is_whitelisted);
  const isBugReportEnabled = Boolean(settings?.bug_report_enabled);

  const handleBugReportSubmit = async () => {
    if (!bugReportMessage.trim()) return;
    setIsBugReportSending(true);
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, classNum, studentNumber, message: bugReportMessage })
      });
      if (!res.ok) throw new Error();
      toast.success('오류신고가 전송되었습니다.');
      setBugReportMessage('');
      setShowBugReportDialog(false);
    } catch {
      toast.error('신고 전송에 실패했습니다.');
    } finally {
      setIsBugReportSending(false);
    }
  };

  const weekRangeText = `${formatDate(weekDates[0])} ~ ${formatDate(weekDates[4])}`;

  const isElectiveMissingImmediate = !isElectiveEntered && (grade === "2" || grade === "3") && !!classNum && !!studentNumber;
  const isElectiveMissing = isElectiveMissingImmediate && showElectiveWarning;
  const shouldShowPrintButton = !((grade === "2" || grade === "3") && !isElectiveEntered);

  const gradeColors: Record<string, string> = {
    "1": "#a6ff00",
    "2": "#00ffcc",
    "3": "#fa32f0",
  };
  const currentGradeColor = grade ? gradeColors[grade] : undefined;
  const selectorStyle = currentGradeColor ? { borderColor: currentGradeColor, borderWidth: '2px' } : {};

  return (
    <div className="container max-w-5xl mx-auto px-2 md:px-4 py-4 md:py-2">
      {/* New Top Bar (Replaces Navigation on Desktop) */}
      <div className="hidden md:flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl md:text-2xl font-bold flex items-center gap-2">
            {settings?.site_title_html ? (
              <span dangerouslySetInnerHTML={{ __html: settings.site_title_html }} />
            ) : (
              <span className="text-blue-600">수행 일정공유</span>
            )}
          </Link>

        </div>

        <div className="flex items-center gap-2">
          {shouldShowPrintButton && (
            <Button
              variant="outline"
              size="sm"
              className="hidden md:flex h-9 rounded-full px-4 font-bold text-xs gap-2 border-gray-200 hover:bg-gray-50 shadow-sm"
              onClick={() => setShowPrintOptions(true)}
            >
              <Printer className="w-4 h-4" />
              내보내기 / 인쇄
            </Button>
          )}
          {isBugReportEnabled && (
            <Button
              variant="default"
              size="sm"
              className="h-9 rounded-full px-4 font-bold text-xs bg-red-500 hover:bg-red-600 text-white"
              onClick={() => setShowBugReportDialog(true)}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              오류신고
            </Button>
          )}
          {kakaoUser ? (
            <div className="flex items-center gap-2 sm:gap-3 bg-gray-50 pr-1 pl-3 py-1 rounded-full border border-gray-100">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] text-gray-400 font-medium leading-none mb-1">카카오 연동됨</span>
                <span className="text-sm font-bold text-gray-800 leading-none">{kakaoUser.nickname}</span>
              </div>
              <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                <AvatarImage src={kakaoUser.thumbnailImage} alt={kakaoUser.nickname} />
                <AvatarFallback className="bg-blue-100 text-blue-600 text-xs font-bold">
                  {kakaoUser.nickname ? kakaoUser.nickname.substring(0, 1) : 'U'}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                onClick={handleLogout}
                title="로그아웃"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              disabled={isKakaoRestricted}
              className={`h-9 rounded-full px-4 font-bold text-xs ${isKakaoRestricted ? 'bg-gray-200 text-gray-500 opacity-70 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'}`}
              onClick={() => {
                if (!isKakaoRestricted) {
                  window.location.href = '/api/kakao/login';
                }
              }}
            >
              {isKakaoRestricted ? (
                "개발 중"
              ) : (
                <>
                  <img src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png" alt="Kakao" className="h-4 w-4 mr-2" />
                  카카오 연동
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Bug Report Dialog */}
      <Dialog open={showBugReportDialog} onOpenChange={setShowBugReportDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>오류신고</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">
              발견한 오류나 문제점을 설명해 주세요.
            </p>
            <Textarea
              placeholder="예) 시간표에서 3교시 과목명이 잘못 표시됩니다."
              value={bugReportMessage}
              onChange={(e) => setBugReportMessage(e.target.value)}
              rows={4}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBugReportDialog(false)}>
                취소
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={handleBugReportSubmit}
                disabled={isBugReportSending || !bugReportMessage.trim()}
              >
                {isBugReportSending ? '전송 중...' : '신고 전송'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-row justify-between items-center gap-2 md:gap-4 mb-6 md:hidden">
        <div>
          <h1 className="text-xl md:text-3xl font-bold whitespace-nowrap">
            {grade || '?'}-{classNum || '?'} 시간표
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 justify-end">
          <div className="flex items-center gap-[4px] md:gap-2">
            <Select
              value={grade}
              onValueChange={(val) => setConfig({ grade: val, classNum, studentNumber })}
            >
              <SelectTrigger className="relative w-[80px] md:w-[90px] shrink min-w-[50px] h-9 md:h-10 bg-white px-2 text-lg md:text-sm font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-2 [&>svg]:z-0 md:[&>svg]:static" style={selectorStyle}>
                <SelectValue placeholder="학년" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1학년</SelectItem>
                <SelectItem value="2">2학년</SelectItem>
                <SelectItem value="3">3학년</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Select
                value={classNum}
                onValueChange={(val) => setConfig({ grade, classNum: val, studentNumber })}
              >
                <SelectTrigger className="relative w-[70px] md:w-[80px] shrink min-w-[45px] h-9 md:h-10 bg-white px-2 text-lg md:text-sm font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-2 [&>svg]:z-0 md:[&>svg]:static" style={selectorStyle}>
                  <SelectValue placeholder="반" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num}반
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Select
                value={studentNumber}
                onValueChange={(val) => setConfig({ grade, classNum, studentNumber: val })}
              >
                <SelectTrigger className="relative w-[70px] md:w-[80px] shrink min-w-[45px] h-9 md:h-10 bg-white px-2 text-lg md:text-sm font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-2 [&>svg]:z-0 md:[&>svg]:static" style={selectorStyle}>
                  <SelectValue placeholder="번호" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 35 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num}번
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>


        </div>
      </div>

      {/* Desktop Header (Outside Card) */}


      <div>
        {/* Visit Restriction Overlay (Completely Replaces Timetable Card) */}
        {isRestricted ? (
          <div className="w-full flex flex-col pt-2 md:pt-4">
            {/* Preserved Desktop Selectors during Restriction */}
            <div className="hidden md:flex items-center gap-2 justify-center mb-6">
              <Select value={grade} onValueChange={(val) => setConfig({ grade: val, classNum, studentNumber })}>
                <SelectTrigger className="w-[100px] md:w-[110px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                  <SelectValue placeholder="학년" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1"><span>1학년</span></SelectItem>
                  <SelectItem value="2"><span>2학년</span></SelectItem>
                  <SelectItem value="3"><span>3학년</span></SelectItem>
                </SelectContent>
              </Select>
              <Select value={classNum} onValueChange={(val) => setConfig({ grade, classNum: val, studentNumber })}>
                <SelectTrigger className="w-[90px] md:w-[100px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                  <SelectValue placeholder="반" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}><span>{num}반</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={studentNumber} onValueChange={(val) => setConfig({ grade, classNum, studentNumber: val })}>
                <SelectTrigger className="w-[90px] md:w-[100px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                  <SelectValue placeholder="번호" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 35 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}><span>{num}번</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Restricted Message Card */}
            <div className="min-h-[400px] flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm rounded-2xl border-2 border-red-100 shadow-sm p-8 max-w-2xl mx-auto w-full">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
                <ShieldAlert className="w-10 h-10" />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 text-center">접근 제한 안내</h3>
              <p className="text-gray-600 text-lg md:text-xl whitespace-pre-wrap text-center leading-relaxed font-medium">
                {settings?.restriction_reason || `${grade}학년 서비스가 일시적으로 제한되었습니다.`}
              </p>
            </div>
          </div>
        ) : (
          <Card className="py-1 gap-1 md:py-2 md:gap-2">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 md:py-4 md:px-3 relative">
              {/* Desktop Title */}
              <div className="hidden md:flex items-center gap-2 flex-1 min-w-0">
                <h1 className="text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                  {grade || '?'}-{classNum || '?'} 시간표
                </h1>
                {(grade === "2" || grade === "3") && (
                  <div className="relative inline-block">
                    <Button
                      size="sm"
                      className={`h-10 text-sm ml-2 shrink-0 transition-all duration-300 bg-[#fc6603] hover:bg-[#e05a00] text-white ${isElectiveMissing ? "animate-pulse" : ""}`}
                      style={isElectiveMissing && currentGradeColor ? { border: `2px solid ${currentGradeColor}` } : {}}
                      onClick={() => setShowElectiveDialog(true)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      선택과목 수정
                    </Button>
                    {isElectiveMissing && (
                      <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 animate-bounce flex flex-col items-center ml-1">
                        <ArrowUp className="w-8 h-16 text-[#fc6603]" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile Elective Edit Button */}
              {(grade === "2" || grade === "3") && (
                <div className="absolute left-0 -translate-x-[10px] top-0 bottom-0 w-[calc(50%-75px)] flex items-center justify-center md:hidden z-20 pointer-events-none">
                  <div className="pointer-events-auto relative">
                    <Button
                      size="sm"
                      className={`font-bold text-sm px-3 h-10 transition-all duration-300 bg-[#fc6603] hover:bg-[#e05a00] text-white ${isElectiveMissing ? "animate-pulse" : ""}`}
                      style={isElectiveMissing && currentGradeColor ? { border: `2px solid ${currentGradeColor}` } : {}}
                      onClick={() => setShowElectiveDialog(true)}
                    >
                      선택과목
                    </Button>
                    {isElectiveMissing && (
                      <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 animate-bounce flex flex-col items-center">
                        <ArrowUp className="w-8 h-16 text-[#fc6603]" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mobile Print Button */}
              {shouldShowPrintButton && (
                <div className="absolute right-0 top-0 bottom-0 w-[calc(50%-75px)] flex items-center justify-end md:hidden z-20 pointer-events-none">
                  <div className="pointer-events-auto relative mr-1 md:mr-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 px-3 gap-1 font-bold text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setShowPrintOptions(true)}
                      title="내보내기 / 인쇄"
                    >
                      <Printer className="w-4 h-4 text-gray-500" />
                      <span>인쇄/저장</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Week Navigation */}
              <div className="flex flex-col items-center justify-center gap-1 w-full -translate-x-1 md:translate-x-0 md:w-auto shrink-0 z-10 relative">
                <div className="flex items-center gap-0 md:gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-10 h-8 p-0"
                    onClick={() => setWeekOffset(weekOffset - 1)}
                    disabled={weekOffset === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm md:text-sm font-normal text-gray-600 min-w-[80px] md:min-w-[90px] text-center px-1">
                    {weekRangeText}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-10 h-8 p-0"
                    onClick={() => setWeekOffset(weekOffset + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <span className={`text-lg md:text-lg ${weekOffset === 0 ? "text-red-500 font-bold" : weekOffset >= 1 ? "text-blue-500 font-bold" : "text-black"}`}>
                  <span>{weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : `${weekOffset}주 후`}</span>
                </span>
                {kakaoUser && (
                  <div className="md:hidden flex items-center justify-center gap-2 bg-green-50 text-green-700 px-3 py-1 mt-2 rounded-md border border-green-100 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-semibold"><span>{kakaoUser.nickname}</span></span>
                  </div>
                )}
              </div>

              {/* Desktop Selectors */}
              <div className="hidden md:flex items-center gap-2 flex-1 justify-end min-w-0 md:ml-[3px]">

                <Select
                  value={grade}
                  onValueChange={(val) => setConfig({ grade: val, classNum, studentNumber })}
                >
                  <SelectTrigger className="w-[100px] md:w-[110px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                    <SelectValue placeholder="학년" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1"><span>1학년</span></SelectItem>
                    <SelectItem value="2"><span>2학년</span></SelectItem>
                    <SelectItem value="3"><span>3학년</span></SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={classNum}
                  onValueChange={(val) => setConfig({ grade, classNum: val, studentNumber })}
                >
                  <SelectTrigger className="w-[90px] md:w-[100px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                    <SelectValue placeholder="반" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        <span>{num}반</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={studentNumber}
                  onValueChange={(val) => setConfig({ grade, classNum, studentNumber: val })}
                >
                  <SelectTrigger className="w-[90px] md:w-[100px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                    <SelectValue placeholder="번호" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 35 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        <span>{num}번</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-1 pb-1 md:px-2 md:pb-2">
              <div id="print-wrapper" style={{
                '--print-width': `${parseFloat(printWidth) || 10}cm`,
                '--print-height': `${parseFloat(printHeight) || 10}cm`
              } as React.CSSProperties}>
                <style type="text/css" media="print">
                  {`
                    @page {
                      size: ${parseFloat(printWidth) || 10}cm ${parseFloat(printHeight) || 10}cm;
                      margin: 0;
                    }
                  `}
                </style>
                <div ref={timetableRef} id="timetable-container" data-print-theme={printTheme}>
                  {/* Print Capture Header */}
                  <div className="capture-only mb-1.5 p-1.5 border rounded-md text-black flex flex-col gap-0.5">
                    <div className="flex justify-between items-end border-b pb-0.5 mb-0.5">
                      <div className="text-sm font-bold leading-none">
                        {grade}학년 {classNum}반 {studentNumber || '?'}번
                      </div>
                      <div className="text-[10px] text-gray-600 leading-none">
                        발급일자: {new Date().toLocaleDateString('ko-KR')} (수행평가는 출력 시점 기준)
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-xs font-medium leading-none">
                        이름 (학번): _______________ ({formattedStudentId})
                      </div>
                      {grade !== "1" && (
                        <div className="text-[10px] text-gray-700 leading-none truncate max-w-[50%] text-right">
                          {electiveSummary || "선택과목 미설정"}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto relative h-full flex flex-col">
                    {/* Select Electives Warning Overlay */}
                    {isElectiveMissingImmediate && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                        <div
                          className="absolute inset-0 rounded-lg pointer-events-none"
                          style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.08) 10px, rgba(0,0,0,0.08) 20px)' }}
                        ></div>
                        <div className="relative text-center bg-white px-8 py-5 rounded-xl shadow-lg border-2 border-red-200 pointer-events-auto flex flex-col gap-2">
                          <div className="text-red-500 text-lg md:text-2xl tracking-wide">
                            [{grade}{classNum}{studentNumber?.padStart(2, '0')}]
                          </div>
                          <div className="text-black text-base md:text-xl">
                            선택과목을 입력하세요
                          </div>
                        </div>
                      </div>
                    )}

                    <table className={`w-full min-h-full h-full border-collapse table-fixed transition-all duration-300 ${isElectiveMissingImmediate ? "blur-[3px] opacity-60 pointer-events-none select-none" : ""}`}>
                      <thead>
                        <tr>
                          <th className="border p-1 md:p-2 bg-gray-50 w-8 md:w-10 text-sm font-medium">교시</th>
                          {weekdayNames.map((day, idx) => {
                            const currentDate = toDateString(weekDates[idx]);
                            const todayStr = toDateString(new Date());
                            const isPast = currentDate < todayStr;

                            return (
                              <th key={day} className={`border p-1 md:p-2 bg-gray-50 ${isPast ? "opacity-70" : ""}`}>
                                <div className="text-sm font-semibold">{day}</div>
                                <div className="text-[10px] md:text-xs text-gray-500 font-normal">
                                  {formatDate(weekDates[idx])}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 7 }, (_, i) => i + 1).map((classTime) => (
                          <tr key={classTime}>
                            <td className="border p-1 md:p-2 text-center font-medium bg-gray-50 text-sm w-8 md:w-10">
                              {classTime}
                            </td>
                            {Array.from({ length: 5 }, (_, weekdayIdx) => {
                              const dayItems = timetableByDay[weekdayIdx] || [];
                              const item = dayItems.find((t) => t.classTime === classTime);
                              const currentDate = toDateString(weekDates[weekdayIdx]);

                              // 오늘 날짜인지 확인
                              const today = new Date();
                              const todayStr = toDateString(today);
                              const isToday = todayStr === currentDate;
                              const isPast = currentDate < todayStr;

                              // 해당 날짜와 교시에 수행평가가 있는지 확인
                              const cellAssessments = assessments ? assessments.filter(a => {
                                if (settings?.hide_past_assessments && isPast) return false;

                                // Check item subject if it exists, otherwise check if group is active
                                const group = computedGroups[`${weekdayIdx}-${classTime}`];
                                const electiveSelection = currentProfile?.electives?.[group];
                                const matchSubject = group && electiveSelection ? (electiveSelection.fullSubjectName || electiveSelection.subject) : (item ? item.subject : null);

                                return matchSubject &&
                                  a.subject.trim() === matchSubject.trim() &&
                                  a.dueDate === currentDate &&
                                  a.classTime === classTime &&
                                  !a.isDone;
                              }) : [];

                              // 배경색 결정: 수행평가가 있으면 파란색(과거는 회색), 없고 오늘이면 연한 붉은색, 그 외는 기본
                              const bgColor = (includeAssessments && cellAssessments.length > 0)
                                ? (isPast ? "bg-gray-200 border-gray-300" : "bg-blue-100 border-blue-300")
                                : isToday
                                  ? "bg-red-50 hover:bg-red-100"
                                  : "bg-yellow-50 hover:bg-yellow-100";

                              // 과거 날짜 스타일
                              const pastStyle = isPast ? "opacity-70 bg-gray-50 text-gray-400" : "";

                              // 선택된 셀 스타일
                              const isSelected = selectedCell?.weekday === weekdayIdx && selectedCell?.classTime === classTime;
                              const selectionStyle = isSelected ? "ring-2 ring-blue-500 ring-inset z-10" : "";

                              // 빈교실/공강 확인 (시각적 효과 없음, 클릭만 막음)
                              const isSubjectDisabled = item && ["빈교실", "공강", "창체", "자습", "동아리", "점심시간", "Empty", "Free"].some(ex => item.subject.trim().includes(ex));

                              const group = computedGroups[`${weekdayIdx}-${classTime}`];
                              const electiveSelection = currentProfile?.electives?.[group];
                              let displaySubject = item ? item.subject : "-";
                              let displayTeacher = item ? item.teacher : "";
                              // displaySubject가 항상 문자열이도록 보장 (elective 데이터 손상 방어)

                              let isElectiveActive = false;
                              let isCancelledByFreePeriod = false;
                              let displayClassName = ""; // 반(반이름) 표시용
                              if (group && electiveSelection) {
                                displaySubject = electiveSelection.fullSubjectName || electiveSelection.subject || displaySubject;
                                isElectiveActive = true;

                                const electiveTeachers = electiveSelection.teacher
                                  ? electiveSelection.teacher.split(",").map((t: string) => t.trim()).filter(Boolean)
                                  : [];
                                const slotItems = allClassesTimetable.filter(
                                  t => t.weekday === weekdayIdx && t.classTime === classTime
                                );

                                const matchingSlot = slotItems.find(
                                  t => t.subject.trim() === electiveSelection.subject.trim()
                                );

                                // 선택과목이 없고 빈교실/공강만 있으면 취소선 표시
                                const FREE_KEYWORDS = ["빈교실", "공강", "Empty", "Free"];
                                const hasFreePeriodSlot = slotItems.some(t =>
                                  FREE_KEYWORDS.some(k => t.subject.trim().includes(k))
                                );
                                if (!matchingSlot && hasFreePeriodSlot) {
                                  isCancelledByFreePeriod = true;
                                }

                                if (matchingSlot) {
                                  displayTeacher = matchingSlot.teacher;
                                } else if (electiveTeachers.length > 0) {
                                  displayTeacher = electiveTeachers[0];
                                } else {
                                  displayTeacher = item ? item.teacher : "";
                                }

                                // 반(className): electiveConfigs에서 group+subject로 조회
                                const configEntry = (electiveConfigs || []).find((c: any) =>
                                  c.subject === electiveSelection.subject &&
                                  c.classCode?.split(",").map((s: string) => s.trim()).includes(group)
                                );
                                displayClassName = (configEntry as any)?.className || "";
                              }

                              return (
                                <td
                                  key={weekdayIdx}
                                  id={`cell-${weekdayIdx}-${classTime}`}
                                  onClick={() => {
                                    if (item || isElectiveActive) {
                                      if (isSubjectDisabled && !isElectiveActive) {
                                        toast.error(`${item.subject}은(는) 선택할 수 없습니다.`);
                                        return;
                                      }
                                      if (!isPast || cellAssessments.length > 0) {
                                        handleCellClick(weekdayIdx, classTime, displaySubject, weekDates[weekdayIdx], cellAssessments);
                                      }
                                    }
                                  }}
                                  className={`border p-1 md:p-2 text-center h-16 md:h-20 relative transition-colors overflow-hidden
                                ${bgColor} ${pastStyle} ${selectionStyle}
                                ${(item || isElectiveActive) && (!isPast || cellAssessments.length > 0) ? "cursor-pointer" : "cursor-default"}
                              `}
                                >
                                  {isElectiveActive && group && (
                                    <div className={`absolute top-0 right-0 px-1 rounded-bl-md text-[9px] md:text-[10px] font-bold ${isPast ? "bg-gray-100 text-gray-400" : "bg-orange-100 text-orange-800"}`}>
                                      <span>{group}</span><span className="hidden md:inline">그룹</span>
                                    </div>
                                  )}
                                  {item || isElectiveActive ? (
                                    <div className="flex flex-col items-center justify-center h-full min-h-0">
                                      <div
                                        className={`font-bold leading-tight w-full px-1 ${isPast ? "text-gray-400" : "text-gray-900"} ${(displaySubject || "").length > 6 ? 'text-[9px] break-keep' : (displaySubject || "").length > 4 ? 'text-[11px]' : ''}`}
                                      >
                                        <span className={(displaySubject || "").length <= 4 ? "text-sm md:text-base" : ""}>
                                          {isCancelledByFreePeriod ? (
                                            <span>
                                              <span className="line-through opacity-60">{displaySubject}</span>
                                              <span className={`ml-1 text-xs font-normal ${isPast ? "text-gray-400" : "text-blue-500"}`}>(공강)</span>
                                            </span>
                                          ) : <span>{displaySubject}</span>}
                                        </span>
                                      </div>
                                      <div className="text-[10px] md:text-xs text-gray-500 mt-0.5 truncate w-full px-1">
                                        {displayClassName
                                          ? <><span>{displayClassName}</span>{displayTeacher ? <span className="ml-1 opacity-60">{displayTeacher}</span> : null}</>
                                          : <span>{displayTeacher}</span>}
                                      </div>
                                      {includeAssessments && cellAssessments.length > 0 && (
                                        <div className="mt-0.5 flex-shrink-0">
                                          <div className="flex flex-wrap gap-0.5 justify-center">
                                            {cellAssessments.map(a => (
                                              <span key={a.id} className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded-full leading-none whitespace-nowrap ${isPast ? "bg-gray-400 text-white" : "bg-blue-600 text-white"} print:bg-gray-200 print:text-gray-700 print:text-[1cqh] print:px-0.5 print:py-0 print:border print:border-gray-400`}>
                                                {a.description && a.description.includes("차") ? a.description : '평가'}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-300 text-sm">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Print Options Dialog */}
      <Dialog open={showPrintOptions} onOpenChange={(open) => {
        setShowPrintOptions(open);
        if (open) {
          resetPrintOptions();
        } else {
          setTimeout(resetPrintOptions, 300);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>시간표 내보내기</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {printMode === 'select' ? (
              <>
                <Button onClick={handleDownloadPng} className="w-full flex items-center justify-center gap-2 h-12">
                  <ImageIcon className="w-5 h-5" />
                  이미지(PNG)로 저장
                </Button>
                <Button onClick={() => setPrintMode('printer')} variant="outline" className="w-full flex items-center justify-center gap-2 h-12">
                  <Printer className="w-5 h-5" />
                  프린터로 출력
                </Button>

                <div className="flex items-center space-x-2 mt-4 bg-gray-50 border rounded-lg p-3">
                  <Checkbox
                    id="include-assessments"
                    checked={includeAssessments}
                    onCheckedChange={(checked) => setIncludeAssessments(!!checked)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="include-assessments"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      수행평가 일정 포함
                    </label>
                    <p className="text-xs text-gray-500">
                      * 현재 보고 있는 주차 기준으로 표기됩니다.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2 justify-center mb-4">
                  {PRINT_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setPrintPreset(preset.id);
                        setPrintWidth(preset.width);
                        setPrintHeight(preset.height);
                      }}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${printPreset === preset.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-4 items-center">
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium">가로 크기 (cm)</label>
                    <Input
                      type="number"
                      value={printWidth}
                      onChange={(e) => {
                        setPrintWidth(e.target.value);
                        setPrintPreset('custom');
                      }}
                      step="0.1"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium">세로 크기 (cm)</label>
                    <Input
                      type="number"
                      value={printHeight}
                      onChange={(e) => {
                        setPrintHeight(e.target.value);
                        setPrintPreset('custom');
                      }}
                      step="0.1"
                    />
                  </div>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium">디자인 테마</label>
                    <div className="flex bg-gray-100 rounded-lg p-1 border">
                      {PRINT_THEMES.map(theme => (
                        <button
                          key={theme.id}
                          onClick={() => setPrintTheme(theme.id)}
                          className={`flex-1 flex items-center justify-center py-1.5 text-xs font-bold rounded-md transition-colors ${printTheme === theme.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          {theme.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={() => setPrintMode('select')} className="flex-1 h-12">
                    이전
                  </Button>
                  <Button onClick={handlePrint} className="flex-[2] h-12 flex items-center justify-center gap-2">
                    <Printer className="w-5 h-5" />
                    인쇄하기
                  </Button>
                </div>
                <p className="text-xs font-medium text-gray-500 text-center mt-2 flex flex-col items-center">
                  <span className="text-red-500 mt-1">* 수동으로 숫자를 조절하여 여백을 맞출 수 있습니다.</span>
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 수행평가 추가 다이얼로그 */}
      < Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) setSelectedCell(null);
      }
      }>
        <DialogContent className="sm:max-w-[500px]" aria-describedby="add-assessment-description">
          <DialogHeader>
            <DialogTitle>수행평가 추가</DialogTitle>
            <p id="add-assessment-description" className="text-sm text-gray-500 mt-1">
              선택한 과목에 수행평가를 추가합니다
            </p>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">날짜</label>
                <Input
                  type="date"
                  value={formData.assessmentDate}
                  readOnly
                  tabIndex={-1}
                  className="bg-gray-100 focus:ring-0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">차수</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.round}
                  onChange={(e) => setFormData({ ...formData, round: e.target.value })}
                  required
                >
                  {[1, 2, 3, 4].map((r) => (
                    <option key={r} value={r.toString()}>{r}차</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                과목
              </label>
              <Input
                value={formData.subject}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                교시
              </label>
              <Input
                value={formData.classTime ? `${formData.classTime}교시` : ""}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">내용</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="수행평가 내용 입력"
                required
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowAddDialog(false);
                setSelectedCell(null);
              }} className="flex-1">
                취소
              </Button>
              <Button type="submit" className="flex-1">
                <Plus className="mr-2 h-4 w-4" />
                추가하기
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog >

      {/* 수행평가 수정 다이얼로그 */}
      < Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) setSelectedCell(null);
      }}>
        <DialogContent className="sm:max-w-[500px]" aria-describedby="edit-assessment-description">
          <DialogHeader>
            <DialogTitle>수행평가 수정</DialogTitle>
            <p id="edit-assessment-description" className="text-sm text-gray-500 mt-1">
              수행평가 정보를 수정합니다
            </p>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">날짜</label>
                <Input
                  type="date"
                  value={formData.assessmentDate}
                  readOnly
                  tabIndex={-1}
                  className="bg-gray-100 focus:ring-0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">차수</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.round}
                  onChange={(e) => setFormData({ ...formData, round: e.target.value })}
                  required
                >
                  {[1, 2, 3, 4].map((r) => (
                    <option key={r} value={r.toString()}>{r}차</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                과목
              </label>
              <Input
                value={formData.subject}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                교시
              </label>
              <Input
                value={formData.classTime ? `${formData.classTime}교시` : ""}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">내용</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="수행평가 내용 입력"
                required
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowEditDialog(false);
                setSelectedCell(null);
              }} className="flex-1">
                취소
              </Button>
              <Button type="submit" className="flex-1">
                수정하기
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog >

      {/* 수행평가 정보 다이얼로그 */}
      < Dialog open={showViewDialog} onOpenChange={(open) => {
        setShowViewDialog(open);
        if (!open) setSelectedCell(null);
      }}>
        <DialogContent className="sm:max-w-[500px]" aria-describedby="view-assessment-description">
          <DialogHeader>
            <DialogTitle>수행평가 정보</DialogTitle>
            <p id="view-assessment-description" className="text-sm text-gray-500 mt-1">
              이 교시에 등록된 수행평가 목록입니다
            </p>
          </DialogHeader>
          <div className="space-y-4">
            {viewingAssessments.map((assessment) => (
              <div
                key={assessment.id}
                className="p-4 border rounded-lg bg-gray-50"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-lg text-gray-900">
                      {assessment.subject}
                    </span>
                    {assessment.description && (
                      <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                        {assessment.description}
                      </span>
                    )}
                    {assessment.classTime && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {assessment.classTime}교시
                      </span>
                    )}
                  </div>
                  {/* 과거 날짜가 아닐 때만 수정/삭제 버튼 표시 */}
                  {assessment.dueDate >= toDateString(new Date()) && (
                    <div className="flex bg-gray-100 rounded-md">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 h-8 w-8"
                        onClick={() => handleEditClick(assessment)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <div className="w-px bg-gray-200"></div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                        onClick={() => {
                          handleDelete(assessment.id);
                          setShowViewDialog(false);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                  }
                </div>
                <p className="text-gray-700 mb-2">{assessment.title}</p>
                <div className="text-xs text-gray-500">
                  {assessment.dueDate}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => {
              setShowViewDialog(false);
              setSelectedCell(null);
            }}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog >

      {/* 수행평가 목록 */}
      < Card className="mt-8" >
        <CardHeader>
          <CardTitle>{weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : `${weekOffset}주 후`} 수행평가 ({weekRangeText})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {assessments && assessments.filter(assessment => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return new Date(assessment.dueDate) >= today;
            }).length > 0 ? (
              assessments
                .filter(assessment => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return new Date(assessment.dueDate) >= today;
                })
                .map((assessment) => {
                  const diffDate = Math.ceil((new Date(assessment.dueDate).getTime() - new Date(toDateString(new Date())).getTime()) / (1000 * 60 * 60 * 24));
                  const dDay = diffDate === 0 ? "D-0" : diffDate > 0 ? `D-${diffDate}` : `D+${Math.abs(diffDate)}`;
                  const isToday = diffDate === 0;

                  return (
                    <div
                      key={assessment.id}
                      className={`border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${isToday ? 'bg-red-50 border-red-200' : 'bg-white'}`}
                      onClick={() => {
                        // Find the cell logic
                        const targetDate = new Date(assessment.dueDate); // This might be string 'YYYY-MM-DD'
                        // We need to find which column (weekday) and row (classTime) this corresponds to.
                        // However, viewingAssessments are "this week's" assessments, so they should be on the screen.
                        // But wait, the assessments list is "This Week's".

                        // Let's find the weekday index.
                        // assessment.weekday might be available if we joined it, but currently AssessmentItem has weekday optional.
                        // Actually, we can calculate weekday from date.
                        const aDate = new Date(assessment.dueDate);
                        const day = aDate.getDay(); // 0(Sun) - 6(Sat). 
                        const weekdayIdx = day === 0 ? 6 : day - 1; // 0(Mon) - 4(Fri). Adjust for Sunday (0) and Saturday (6) if needed, assuming Mon-Fri.

                        // Check if weekday is valid (Mon-Fri) and classTime exists
                        if (weekdayIdx >= 0 && weekdayIdx <= 4 && assessment.classTime) {
                          const cellId = `cell-${weekdayIdx}-${assessment.classTime}`;
                          const element = document.getElementById(cellId);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            element.classList.add('highlight-cell');
                            setTimeout(() => {
                              element.classList.remove('highlight-cell');
                            }, 2000);
                          }
                        }
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg text-blue-600">
                            {assessment.subject}
                          </span>
                          <span className="text-sm px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                            {assessment.description}
                          </span>
                          <span className={`text-sm font-bold ${isToday ? 'text-red-600' : 'text-gray-500'}`}>
                            {dDay}
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-700 mb-2">{assessment.title}</p>
                      <div className="flex items-center gap-2 mt-auto">
                        <div className="flex items-center text-sm text-gray-500">
                          <span>{assessment.dueDate}</span>
                          <span className="mx-2">|</span>
                          <span>{assessment.classTime}교시</span>
                        </div>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="col-span-full text-center py-12 text-gray-500">
                이번 주 등록된 수행평가가 없습니다.
                <br />
                <span className="text-sm">시간표에서 과목을 클릭하여 추가하세요.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="mt-2 flex justify-end">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600 hover:bg-transparent text-xs font-normal h-auto p-0">
            관리사무소
          </Button>
        </Link>
      </div>

      {/* Instruction Notification */}
      {
        showInstructionTooltip && !showElectiveDialog && !useUserConfig().instructionDismissedV2 && (
          <div className="fixed bottom-4 right-4 z-[9999] bg-white dark:bg-gray-800 border border-orange-200 shadow-lg rounded-lg p-6 md:p-8 max-w-[90vw] md:max-w-xl animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="flex flex-col gap-4 md:gap-6">
              <p
                className="font-bold text-base md:text-xl leading-relaxed bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)' }}
              >
                표의 칸을 클릭해서 수행평가를 추가하십쇼
              </p>
              <Button
                size="lg"
                className="bg-orange-500 hover:bg-orange-600 text-white border-none w-full text-lg md:text-xl py-3 md:py-4 font-['Gungsuh',_serif]"
                onClick={() => setConfig({ instructionDismissedV2: true })}
              >
                이해함
              </Button>
            </div>
          </div>
        )
      }
      {/* 선택과목 선택 다이얼로그 */}
      <ElectiveSelectionDialog
        isOpen={showElectiveDialog}
        grade={grade}
        classNum={classNum}
        studentNumber={studentNumber}
        datasetId={(rawTimetableData as any)?.datasetId || ''}
        forceManualMode={settings?.elective_input_mode === 'manual'}
        onSaveSuccess={() => {
          setShowElectiveDialog(false);
          setIsElectiveEntered(true);
          // Restore tooltip if it was visible before the dialog
          if (tooltipWasVisibleRef.current) setShowInstructionTooltip(true);
        }}
        onBack={() => {
          setShowElectiveDialog(false);
          // Restore tooltip if it was visible before the dialog
          if (tooltipWasVisibleRef.current) setShowInstructionTooltip(true);
        }}
      />
    </div>
  );
}
