
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Route, Switch, useLocation, Link } from "wouter";
import { Loader2, Trash2, Plus, Download, ChevronLeft, ChevronRight, Pencil, LogOut, ArrowUp, ShieldAlert, AlertTriangle, Printer, Image as ImageIcon, ThumbsUp, X } from "lucide-react";
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
  isChanged?: boolean;
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
  votes?: string; // JSON array of votes
  isPostponed?: boolean;
  originalDueDate?: string;
  originalClassTime?: number;
  tempDueDate?: string;
  tempClassTime?: number;
  isAutoPredicted?: boolean | number;
  teacher?: string;
  classCode?: string;
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

// YYYY-MM-DD ➔ M/D 단축 포맷팅 (대시보드 카드 레이아웃 보호용)
function formatShortDateText(dateString?: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
  }
  return dateString;
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
  
  // Custom Orphan Relocation State
  const [relocatingAssessment, setRelocatingAssessment] = useState<AssessmentItem | null>(null);
  const [pendingRelocation, setPendingRelocation] = useState<{ date: string, classTime: number } | null>(null);
  const [isRelocatingUpdating, setIsRelocatingUpdating] = useState(false);


  // ... previous imports


  // ... existing code ...

  const [formData, setFormData] = useState({
    assessmentDate: "",
    subject: "",
    content: "",
    classTime: "",
    round: "1",
    teacher: "",
    classCode: "",
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

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const isIOS = typeof window !== 'undefined' ? /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) : false;
  const isSamsungBrowser = typeof window !== 'undefined' ?
    /SamsungBrowser/i.test(navigator.userAgent) ||
    (/Android/i.test(navigator.userAgent) && /SM-|SAMSUNG/i.test(navigator.userAgent) && !/Chrome\/[.0-9]* Mobile/i.test(navigator.userAgent)) // Catch edge cases where it's a Samsung device but not standard Chrome
    : false;
  const isInAppBrowser = typeof window !== 'undefined' ? /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|LINE/i.test(navigator.userAgent) : false;
  const isAndroid = typeof window !== 'undefined' ? /Android/i.test(navigator.userAgent) : false;
  const [hasPwaCookie, setHasPwaCookie] = useState(typeof document !== 'undefined' && document.cookie.includes('pwa_standalone=1'));

  useEffect(() => {
    const standsAlone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone) === true;
    setIsStandalone(standsAlone);

    // Immediately pick up the prompt if it was already captured in main.tsx
    // (Samsung Internet fires beforeinstallprompt very early, before React mounts)
    if ((window as any).__deferredPwaPrompt) {
      setDeferredPrompt((window as any).__deferredPwaPrompt);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|SamsungBrowser/i.test(navigator.userAgent);
      if (isMobile) {
        (window as any).__deferredPwaPrompt = e;
        setDeferredPrompt(e);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);


  const handleInstallClick = async () => {
    if (deferredPrompt) {
      setIsInstalling(true);
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setIsInstalling(false);
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // Do nothing: User requested no alternative instructions when installation fails or is bypassed.
    }
  };

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
  const [printTheme, setPrintTheme] = useState('color');
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
    setPrintTheme('color');
    setPrintWidth('9');
    setPrintHeight('11');
  };

  // PNG 다운로드 핸들러
  const handleDownloadPng = async () => {
    if (!timetableRef.current) return;

    // Close dialog first to ensure it's not in the way
    setShowPrintOptions(false);

    // Track download metric
    fetch('/api/action/download', { method: 'POST' }).catch(() => { });

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

    // Track print metric
    fetch('/api/action/print', { method: 'POST' }).catch(() => { });

    setTimeout(() => {
      window.print();
      resetPrintOptions();
    }, 100);
  };




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
    cellAssessments: AssessmentItem[],
    teacher: string = "",
    classCode: string = ""
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
          teacher: teacher,
          classCode: classCode,
        });
        setShowAddDialog(true);
      }
    }, 150);
  };

  // 1. 시간표 조회
  const { data: rawTimetableData, isLoading: timetableLoading, isFetching: isTimetableFetching, refetch: refetchTimetable } = useQuery({
    queryKey: ['timetable', schoolName, grade, classNum, weekDates[0].toISOString()],
    queryFn: async () => {
      if (!grade || !classNum) return [];
      try {
        const queryClassNum = (grade === "2" || grade === "3") ? "all" : classNum;
        const targetDate = toDateString(weekDates[0]);
        const response = await fetch(`/api/comcigan?type=timetable&grade=${grade}&classNum=${queryClassNum}&targetDate=${encodeURIComponent(targetDate)}`);
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
          (mappedData as any).originalDatasetId = result.originalDatasetId || result.datasetId;
          (mappedData as any).ipOverrideApplied = result.ipOverrideApplied;
          return mappedData;
        }
        const emptyArray = [] as TimetableItem[];
        (emptyArray as any).datasetId = result.datasetId;
        (emptyArray as any).originalDatasetId = result.originalDatasetId || result.datasetId;
        (emptyArray as any).ipOverrideApplied = result.ipOverrideApplied;
        return emptyArray;
      } catch (e) {
        console.error('Failed to fetch timetable', e);
        throw e;
      }
    },
    enabled: !!grade && !!classNum && !!schoolName,
    retry: true, // 무한 재시도
    retryDelay: 3000, // 3초 간격
    staleTime: 5000, // 5초 동안은 데이터를 신선한 상태로 유지하여, 캐싱 반영 및 UI 깜빡임 최소화
  });

  // Extract persistent datasetId for use in effects (fallback to actual timetable response)
  const datasetId = (rawTimetableData as any)?.originalDatasetId || (rawTimetableData as any)?.datasetId || '';

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

  // 2, 3학년 선택과목 완벽 입력 상태 확인 logic
  useEffect(() => {
    if (grade !== "2" && grade !== "3") {
      setIsElectiveEntered(true);
      setShowElectiveWarning(false);
      return;
    }

    if (!classNum || !studentNumber || !datasetId || !electiveConfigs) {
      // Still loading necessary contexts
      return;
    }

    // Determine the required groups from electiveConfigs for this grade
    const requiredGroups: string[] = Array.from(new Set(
      electiveConfigs
        .flatMap((c: any) => (c.classCode || "").split(","))
        .map((code: string) => code.trim())
        .filter(Boolean)
    )) as string[];
    
    // If no configs are found, block if it's required (but since we don't know, we'll assume not fully entered to be safe or maybe let it pass if setup is incomplete)
    if (requiredGroups.length === 0) {
      // Empty configs scenario: usually means electives aren't actively defined yet. Let pass?
      // Better to assume true to not block the Dashboard if the admin hasn't set anything up.
      setIsElectiveEntered(true);
      setShowElectiveWarning(false);
      return;
    }

    // Verify current profile
    const electives: Record<string, any> = currentProfile?.electives || {};
    
    // Check if every single required group has a valid subject selected
    const isFullyEntered = requiredGroups.every(group => electives[group] && electives[group].subject && electives[group].subject.trim() !== "");

    setIsElectiveEntered(isFullyEntered);
    setShowElectiveWarning(!isFullyEntered);

  }, [grade, classNum, studentNumber, datasetId, currentProfile, electiveConfigs]);

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
  // 각 시간(교시)별 다수결 그룹 계산

  const computedGroups = useMemo(() => {
    if (grade !== "2" && grade !== "3") {
      return {};
    }
    // 시간표 데이터 자체가 없으면 그룹 매핑도 없는 것이 정상입니다.
    if (!allClassesTimetable || allClassesTimetable.length === 0) {
      return {};
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
    queryKey: ['assessments', grade, classNum, datasetId],
    queryFn: async () => {
      if (!grade || !classNum) return [];
      try {
        const datasetQuery = datasetId ? `&dataset=${encodeURIComponent(datasetId)}` : '';
        const res = await fetch(`/api/assessment?grade=${grade}&classNum=${classNum}${datasetQuery}`);
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

  // 학생이 실제로 수강하는 과목 목록 계산 (수행평가 고아상태 필터링용)
  const myActualSubjects = useMemo(() => {
    const subjects = new Set<string>();
    
    // 1. 시간표 기반 수강 과목 수집
    for (let w = 0; w < 5; w++) {
      for (let c = 1; c <= 7; c++) {
        const item = (timetableData || []).find(t => t.weekday === w && t.classTime === c);
        const group = computedGroups[`${w}-${c}`];
        const electiveSelection = currentProfile?.electives?.[group];
        
        let displaySubject = item ? item.subject : null;
        
        if (group && electiveSelection) {
           const configEntry = (electiveConfigs || []).find((cfg: any) =>
             cfg.subject === electiveSelection.subject &&
             cfg.classCode?.split(",").map((s: string) => s.trim()).includes(group)
           );
           displaySubject = configEntry?.fullSubjectName || electiveSelection.subject || displaySubject;
        }

        if (displaySubject) {
           subjects.add(displaySubject.trim());
        }
      }
    }

    // 2. 시간표에 없더라도 학생이 명시적으로 선택한 선택과목은 모두 포함
    if (grade === "2" || grade === "3") {
      if (currentProfile?.electives) {
        Object.values(currentProfile.electives).forEach((sel: any) => {
          if (sel && sel.subject) {
            subjects.add(sel.subject.trim());
            if (sel.fullSubjectName) subjects.add(sel.fullSubjectName.trim());
            
            const configEntry = (electiveConfigs || []).find((cfg: any) => cfg.subject === sel.subject);
            if (configEntry?.fullSubjectName) subjects.add(configEntry.fullSubjectName.trim());
          }
        });
      }
    }

    return subjects;
  }, [timetableData, computedGroups, currentProfile, electiveConfigs, grade]);

  // 현재 주에 해당하는 수행평가만 필터링, 정렬 및 임시 연기(고아 처리)
  const assessments = useMemo(() => {
    if (!allAssessments) return [];

    // 1. Filter by Week
    let filtered = allAssessments.filter(a => {
      const effectiveDate = a.tempDueDate ? a.tempDueDate : a.dueDate;
      return isDateInWeek(effectiveDate, weekDates);
    });

    // 2. 학생이 듣지 않는 과목의 고아상태 등 수행평가 필터링 (2, 3학년)
    if (grade === "2" || grade === "3") {
      filtered = filtered.filter(a => {
        // 1차 필터: 아예 듣지 않는 과목(이름)이면 100% 탈락
        const baseSubject = a.subject.replace(/\s*\(.*$/, '').trim();
        if (!myActualSubjects.has(baseSubject)) return false;

        // 2차 필터: a.classCode가 명시된 경우, 이 학생의 elective 그룹이 포함되는지 직접 검증
        // 이동수업 수행평가는 subject 이름에 그룹이 없어도 classCode로만 구분됨
        if (a.classCode && a.classCode.trim()) {
          const allowedGroups = a.classCode.split(",").map((s: string) => s.trim()).filter(Boolean);
          if (allowedGroups.length > 0) {
            // 학생이 보유한 elective 그룹 목록 (currentProfile.electives의 키: "A", "B", ...)
            const myGroups = new Set<string>(Object.keys(currentProfile?.electives || {}));
            // 내 그룹 중 하나라도 allowedGroups에 포함되어야 함
            const hasMatch = allowedGroups.some(g => myGroups.has(g));
            if (!hasMatch) {
              return false; // 이 학생의 그룹이 대상 그룹에 없음 → 표시 안 함
            }
            // 그룹은 맞지만, 해당 그룹에서 선택한 과목이 수행평가 과목과 다른지 추가 검증
            const matchedGroup = allowedGroups.find(g => myGroups.has(g));
            if (matchedGroup) {
              const mySubjectInGroup = currentProfile?.electives?.[matchedGroup]?.subject;
              if (mySubjectInGroup) {
                const cfgEntry = (electiveConfigs || []).find((cfg: any) => cfg.subject === mySubjectInGroup);
                const fullSubj = cfgEntry?.fullSubjectName || mySubjectInGroup;
                if (baseSubject !== mySubjectInGroup.trim() && baseSubject !== fullSubj.trim()) {
                  return false; // 그룹은 같지만 그 그룹에서 내가 선택한 과목과 다름
                }
              }
            }
          }
        } else {
          // classCode가 없는 경우: 과목명의 "(C그룹)" 텍스트로 폴백 검증
          const groupMatch = a.subject.match(/\(([A-Z]그룹)/);
          if (groupMatch && groupMatch[1]) {
             const targetGroup = groupMatch[1];
             const mySelectedSubjectForGroup = currentProfile?.electives?.[targetGroup]?.subject;
             
             if (!mySelectedSubjectForGroup) {
                return false; // 해당 그룹에 아무 과목도 선택하지 않았다면 내 것이 아님
             }

             const configEntry = (electiveConfigs || []).find((cfg: any) => cfg.subject === mySelectedSubjectForGroup);
             const fullSubj = configEntry?.fullSubjectName || mySelectedSubjectForGroup;

             if (baseSubject !== mySelectedSubjectForGroup.trim() && baseSubject !== fullSubj.trim()) {
                return false; // 내 프로필의 그룹 배정 과목과, 수행평가의 실제 과목이 일치하지 않음
             }
          }
        }

        return true;
      });
    }


    // 날짜 범위를 벗어난 폴백 데이터셋을 보고 있을 경우, 고아(자동 임시 연기) 처리를 하지 않음
    const isOutOfBounds = (rawTimetableData as any)?.datasetId && (rawTimetableData as any)?.originalDatasetId && (rawTimetableData as any)?.datasetId !== (rawTimetableData as any)?.originalDatasetId;

    // 3. 고아 수행평가 임시 이동 처리 및 대시보드 UI를 위한 과목명 정리(Suffix 제거)
    const processed = filtered.map(a => {
      // 대시보드 UI에서는 (C그룹, 선생님) 등의 꼬리표를 제거하여 깔끔하게 표시
      const baseSubject = a.subject.replace(/\s*\(.*$/, '').trim();

      // 서버에서 계산된 수동 연기 및 자동 연기(자동 예측) 수행평가 반영
      if (a.tempDueDate && a.tempClassTime) {
        return {
           ...a,
           subject: baseSubject,
           isPostponed: true,
           originalDueDate: a.dueDate,
           originalClassTime: a.classTime,
           dueDate: a.tempDueDate,
           classTime: a.tempClassTime
        };
      }
      return { ...a, subject: baseSubject };
    });

    // 4. Sort: Date ASC -> Period (classTime) ASC
    processed.sort((a, b) => {
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      if (dateA !== dateB) return dateA - dateB;

      const periodA = a.classTime || 99;
      const periodB = b.classTime || 99;
      return periodA - periodB;
    });

    console.log('[Assessments Filter, Sort & Postpone]', {
      weekRange: `${toDateString(weekDates[0])} ~ ${toDateString(weekDates[4])}`,
      totalAssessments: allAssessments.length,
      processedAssessments: processed.length,
    });
    return processed;
  }, [allAssessments, weekDates, grade, myActualSubjects, timetableData, computedGroups, currentProfile]);

  // 3.5 수행평가 투표 데이터 (인라인 votes 필드에서 계산)
  const votesData = useMemo(() => {
    if (!assessments || assessments.length === 0) return { votes: {} as Record<string, { helpful: number; distrust: number }>, myVotes: {} as Record<string, string> };
    const votes: Record<string, { helpful: number; distrust: number }> = {};
    const myVotes: Record<string, string> = {};
    for (const a of assessments) {
      const aid = String(a.id);
      let votesArr: { g: number; c: number; s: number; v: string }[] = [];
      try { votesArr = JSON.parse(a.votes || '[]'); } catch { votesArr = []; }
      const helpful = votesArr.filter(x => x.v === 'helpful').length;
      const distrust = votesArr.filter(x => x.v === 'distrust').length;
      if (helpful > 0 || distrust > 0) votes[aid] = { helpful, distrust };
      // Find my vote
      if (grade && classNum && studentNumber) {
        const myVote = votesArr.find(x => x.g === parseInt(grade) && x.c === parseInt(classNum) && x.s === parseInt(studentNumber));
        if (myVote) myVotes[aid] = myVote.v;
      }
    }
    return { votes, myVotes };
  }, [assessments, grade, classNum, studentNumber]);

  const voteMutation = useMutation({
    mutationFn: async ({ assessmentId, vote }: { assessmentId: number; vote: 'helpful' | 'distrust' }) => {
      const myCurrentVote = votesData?.myVotes?.[String(assessmentId)];
      if (myCurrentVote === vote) {
        // Toggle off - send null vote
        await fetch('/api/assessment?action=vote', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assessmentId, grade: parseInt(grade), classNum: parseInt(classNum), studentNumber: parseInt(studentNumber), vote: null }),
        });
      } else {
        await fetch('/api/assessment?action=vote', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assessmentId, grade: parseInt(grade), classNum: parseInt(classNum), studentNumber: parseInt(studentNumber), vote }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
  });

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
          dataset: datasetId || '',
          teacher: data.teacher,
          classCode: data.classCode,
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
        body: JSON.stringify({
          ...data,
          dataset: datasetId || ''
        }),
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
        teacher: "",
        classCode: "",
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
      teacher: assessment.teacher || "",
      classCode: assessment.classCode || "",
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
        // 만약 이미 연기된 수행평가라면, dueDate로는 원본 날짜를 보존하고 tempDueDate를 수정합니다.
        dueDate: editingAssessment.originalDueDate || formData.assessmentDate,
        classTime: editingAssessment.originalClassTime || (formData.classTime ? parseInt(formData.classTime) : undefined),
        tempDueDate: editingAssessment.originalDueDate ? formData.assessmentDate : undefined,
        tempClassTime: editingAssessment.originalDueDate ? (formData.classTime ? parseInt(formData.classTime) : undefined) : undefined,
        isAutoPredicted: editingAssessment.originalDueDate ? 0 : undefined,
        description: formData.round ? `${formData.round}차` : "",
        teacher: formData.teacher,
        classCode: formData.classCode,
      });
    } catch (error) {
      console.error("수행평가 수정 실패:", error);
    }
  };

  const findNextSlotForSubject = (fromDateStr: string, fromClassTime: number, targetSubject: string) => {
    const fromDate = new Date(fromDateStr);
    let currentWeekday = fromDate.getDay() - 1; // 0=Mon, 4=Fri
    if (currentWeekday < 0 || currentWeekday > 4) currentWeekday = 0;
    
    // Scan up to 4 weeks ahead
    for (let weeksAhead = 0; weeksAhead < 4; weeksAhead++) {
      for (let w = 0; w < 5; w++) {
         if (weeksAhead === 0 && w < currentWeekday) continue;

         const daySlots = (timetableData || []).filter(t => t.weekday === w).sort((x, y) => x.classTime - y.classTime);
         
         for (const t of daySlots) {
             if (weeksAhead === 0 && w === currentWeekday && t.classTime <= fromClassTime) continue;

             const tGroup = computedGroups[`${w}-${t.classTime}`];
             const tElective = currentProfile?.electives?.[tGroup];
             const tSubject = tGroup && tElective ? (tElective.fullSubjectName || tElective.subject) : t.subject;
             
             if (tSubject?.trim() === targetSubject.trim()) {
                 const targetDate = new Date(fromDate);
                 const daysDiff = (weeksAhead * 7) + (w - currentWeekday);
                 targetDate.setDate(targetDate.getDate() + daysDiff);
                 
                 return {
                     date: toDateString(targetDate),
                     classTime: t.classTime
                 };
             }
         }
      }
    }
    return null;
  };

  const handleRelocationSubmit = async () => {
    if (!pendingRelocation || !relocatingAssessment) return;
    setIsRelocatingUpdating(true);
    try {
        const updatesToMake: any[] = [];
        const queue = [
            { assessment: relocatingAssessment, targetDate: pendingRelocation.date, targetTime: pendingRelocation.classTime }
        ];

        while (queue.length > 0) {
           const { assessment, targetDate, targetTime } = queue.shift()!;
           
           updatesToMake.push({
               ...assessment,
               dueDate: assessment.originalDueDate || assessment.dueDate,
               classTime: assessment.originalClassTime || assessment.classTime,
               tempDueDate: targetDate,
               tempClassTime: targetTime,
               isAutoPredicted: 0
           });

           // Find collider in allAssessments
           const collider = allAssessments?.find(a => {
               if (a.id === assessment.id) return false;
               if (a.isDone) return false; // Ignore completed assessments
               if (a.subject.trim() !== assessment.subject.trim()) return false;
               
               // Check if this assessment is already pending an update in this cascade
               const pendingUpdate = updatesToMake.find(u => u.id === a.id);
               const effectiveDate = pendingUpdate ? pendingUpdate.tempDueDate : (a.tempDueDate || a.dueDate);
               const effectiveTime = pendingUpdate ? pendingUpdate.tempClassTime : (a.tempClassTime || a.classTime);

               return effectiveDate === targetDate && effectiveTime === targetTime;
           });

           if (collider) {
               const nextSlot = findNextSlotForSubject(targetDate, targetTime, assessment.subject);
               if (nextSlot) {
                   queue.push({ assessment: collider, targetDate: nextSlot.date, targetTime: nextSlot.classTime });
               } else {
                   // Fallback if no slot found in 4 weeks
                   toast.warning(`[${assessment.subject}] 더 이상 배정할 다음 수업 시간이 없어 연쇄 연기가 중단되었습니다.`);
               }
           }
        }

        // Apply bulk updates
        for (const update of updatesToMake) {
             await updateMutation.mutateAsync(update);
        }
        
    } catch (e) {
       console.error("Relocation Error:", e);
       toast.error("연기 처리 중 오류가 발생했습니다.");
    } finally {
        setIsRelocatingUpdating(false);
        setRelocatingAssessment(null);
        setPendingRelocation(null);
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

  // 로딩이 5초 이상 지속되면 자동 오류 리포트 제출 및 1초 단위 업데이트
  const slowLoadReportIdRef = useRef<number | null>(null);
  const loadingStartRef = useRef<number | null>(null);
  const isReportingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isLoading) {
      if (loadingStartRef.current === null) {
        loadingStartRef.current = Date.now();
      }

      const interval = setInterval(async () => {
        if (!isLoading || loadingStartRef.current === null || isReportingRef.current) return;

        const elapsedMs = Date.now() - loadingStartRef.current;
        // 5초 이상부터 감지 시작
        if (elapsedMs >= 5000) {
          isReportingRef.current = true;
          const elapsedSec = Math.round(elapsedMs / 1000);
          const message = `[자동 리포트] 로딩 지연 감지: ${elapsedSec}초 경과 (시간표: ${timetableLoading ? '로딩중' : '완료'}, 수행평가: ${assessmentLoading ? '로딩중' : '완료'})`;

          if (slowLoadReportIdRef.current === null) {
             // 최초 리포트 생성
             try {
                const res = await fetch('/api/bug-reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ grade, classNum, studentNumber, message })
                });
                const data = await res.json();
                if (data.id) {
                    slowLoadReportIdRef.current = data.id;
                }
             } catch (e) { /* 실패 시 무시 */ }
          } else {
             // 이미 등록된 내역이 있다면 업데이트 (PATCH)
             try {
                await fetch('/api/bug-reports', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: slowLoadReportIdRef.current, message })
                });
             } catch (e) { /* 실패 시 무시 */ }
          }
          isReportingRef.current = false;
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      loadingStartRef.current = null;
      slowLoadReportIdRef.current = null; // 로딩 끝나면 리포트 ID도 리셋 (다음 로딩을 위해)
      isReportingRef.current = false;
    }
  }, [isLoading, grade, classNum, studentNumber, timetableLoading, assessmentLoading]);

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
  const isGradeAllowedToPrint = settings?.allow_print_by_grade?.includes(Number(grade)) ?? true;
  const shouldShowPrintButton = !((grade === "2" || grade === "3") && !isElectiveEntered) && isGradeAllowedToPrint;

  const gradeColors: Record<string, string> = {
    "1": "#a6ff00",
    "2": "#00ffcc",
    "3": "#fa32f0",
  };
  const currentGradeColor = grade ? gradeColors[grade] : undefined;
  const selectorStyle = currentGradeColor ? { borderColor: currentGradeColor, borderWidth: '2px' } : {};

  return (
    <div className="container max-w-5xl mx-auto px-2 md:px-4 py-4 md:py-2">
      {/* Global Status Banners */}
      {(settings?.is_whitelisted || (rawTimetableData as any)?.ipOverrideApplied) && (
        <div className="flex flex-col gap-2 mb-4">
          {settings?.is_whitelisted && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>[화이트리스트] 이 기기는 접속 제한 예외 처리되었습니다.</span>
            </div>
          )}
          {(rawTimetableData as any)?.ipOverrideApplied && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0" />
              <span>[강제 지정됨] {(rawTimetableData as any)?.ipOverrideApplied} Override된 데이터셋 ({(rawTimetableData as any)?.datasetId}) 표시 중</span>
            </div>
          )}
        </div>
      )}

      {/* New Top Bar (Replaces Navigation on Desktop) */}
      <div className="hidden md:flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <span
              dangerouslySetInnerHTML={{
                __html: settings?.site_title_html || '<span class="text-blue-600">수행 일정공유</span>'
              }}
            />
          </Link>
        </div>

        {/* Center: 시간표/급식표 segmented toggle */}
        <div className="flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5">
          <div className="px-5 py-1.5 rounded-full bg-white text-sm font-semibold text-gray-800 shadow-sm whitespace-nowrap">
            📅 시간표
          </div>
          <a
            href="/meal"
            className="px-5 py-1.5 rounded-full text-sm font-semibold text-gray-500 hover:text-orange-500 hover:bg-white/60 transition-all whitespace-nowrap"
          >
            🍱 급식표
          </a>
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

      <div className="flex items-stretch gap-2 md:hidden mb-3">
        {/* Left column: toggle (top) + title (bottom) */}
        <div className="flex flex-col justify-between gap-0.5 w-[130px] shrink-0">
          <div className="flex items-center gap-1">
            <div className="flex-1 flex items-center justify-center gap-0.5 px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200 whitespace-nowrap">
              시간표
            </div>
            <a
              href="/meal"
              className="flex-1 flex items-center justify-center gap-0.5 px-2 py-1 text-xs font-semibold rounded-full border border-orange-300 text-orange-500 hover:bg-orange-50 transition-colors whitespace-nowrap"
            >
              급식표
            </a>
          </div>
          <h1 className="text-xl font-bold whitespace-nowrap">
            {grade || '?'}-{classNum || '?'} 시간표
          </h1>
        </div>

        {/* Right column: selectors vertically centered */}
        <div className="flex items-center gap-[3px] shrink-0">
          <Select value={grade} onValueChange={(val) => setConfig({ grade: val, classNum, studentNumber })}>
            <SelectTrigger className="relative w-[80px] h-10 bg-white px-2 text-lg font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-1.5 [&>svg]:z-0" style={selectorStyle}>
              <SelectValue placeholder="학년" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1학년</SelectItem>
              <SelectItem value="2">2학년</SelectItem>
              <SelectItem value="3">3학년</SelectItem>
            </SelectContent>
          </Select>
          <Select value={classNum} onValueChange={(val) => setConfig({ grade, classNum: val, studentNumber })}>
            <SelectTrigger className="relative w-[70px] h-10 bg-white px-2 text-lg font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-1.5 [&>svg]:z-0" style={selectorStyle}>
              <SelectValue placeholder="반" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                <SelectItem key={num} value={num.toString()}>{num}반</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={studentNumber} onValueChange={(val) => setConfig({ grade, classNum, studentNumber: val })}>
            <SelectTrigger className="relative w-[70px] h-10 bg-white px-2 text-lg font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-1.5 [&>svg]:z-0" style={selectorStyle}>
              <SelectValue placeholder="번호" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 35 }, (_, i) => i + 1).map((num) => (
                <SelectItem key={num} value={num.toString()}>{num}번</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <div ref={timetableRef} id="timetable-container" className="group" data-print-theme={printTheme} data-print-font-size={settings?.print_subject_font_size || 'large'}>
                  {/* System Dataset Config UI (Debug) */}
                  {(rawTimetableData as any)?.debugTokens && settings?.comcigan_debug_overlay_enabled && (
                    <div className="print:hidden capturing:hidden text-[10px] md:text-xs text-gray-400 text-right mb-1 tracking-tight flex flex-wrap items-center justify-end gap-1 md:gap-2 pr-1">
                      <span className="text-blue-500 font-semibold text-xs border border-blue-200 bg-blue-50 px-1.5 py-0.5 rounded">현재 데이터셋: {(rawTimetableData as any)?.datasetId}{((rawTimetableData as any)?.originalDatasetId && (rawTimetableData as any)?.originalDatasetId !== (rawTimetableData as any)?.datasetId) ? ` (원본: ${(rawTimetableData as any)?.originalDatasetId})` : ''}</span>
                      <span className="hidden md:inline">|</span>
                      <span>1학년: {(rawTimetableData as any).debugTokens.override1 && (rawTimetableData as any).debugTokens.override1 !== '_auto_' ? '단독선택(O)' : '단독선택(X)'} / 기본FB{(rawTimetableData as any).debugTokens.fallback1 && (rawTimetableData as any).debugTokens.fallback1 !== '_auto_' ? '(O)' : '(X)'}</span>
                      <span className="hidden md:inline">|</span>
                      <span>2,3학년: {(rawTimetableData as any).debugTokens.override23 && (rawTimetableData as any).debugTokens.override23 !== '_auto_' ? '단독선택(O)' : '단독선택(X)'} / 기본FB{(rawTimetableData as any).debugTokens.fallback23 && (rawTimetableData as any).debugTokens.fallback23 !== '_auto_' ? '(O)' : '(X)'}</span>
                      {(rawTimetableData as any).debugTokens.isFallbackApplied && <span className="text-red-400 font-bold ml-1">(! Fallback 가동중)</span>}
                    </div>
                  )}

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
                        학번: {formattedStudentId}
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
                    <div className="relative w-full h-full">
                      <table className={`w-full min-h-full h-full border-collapse table-fixed transition-all duration-300 ${isElectiveMissingImmediate ? "blur-[3px] opacity-60 pointer-events-none select-none" : ""}`}>
                      <thead>
                        <tr>
                          <th className="border p-1 md:p-2 bg-gray-50 w-8 md:w-10 text-sm font-medium">교시</th>
                          {weekdayNames.map((day, idx) => {
                            const currentDate = toDateString(weekDates[idx]);
                            const todayStr = toDateString(new Date());
                            const isPast = currentDate < todayStr;

                            return (
                              <th key={day} className={`border p-1 md:p-2 bg-gray-50 ${isPast ? "opacity-70 print:!opacity-100 capturing:!opacity-100" : ""}`}>
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
                              const currentDate = toDateString(weekDates[weekdayIdx]);

                              const dayItems = timetableByDay[weekdayIdx] || [];
                              const item = dayItems.find((t) => t.classTime === classTime);

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

                                if (!matchSubject) return false;
                                if (a.subject.trim() !== matchSubject.trim()) return false;
                                if (a.dueDate !== currentDate) return false;
                                if (a.classTime !== classTime) return false;
                                if (a.isDone) return false;

                                // classCode 검증: 수행평가에 classCode(그룹)가 지정된 경우,
                                // 이 학생의 group이 해당 그룹 목록에 포함될 때만 표시한다.
                                // classCode가 없으면 전체 공통 수행평가이므로 그룹 무관하게 표시.
                                if (a.classCode && a.classCode.trim()) {
                                  const allowedGroups = a.classCode.split(",").map((s: string) => s.trim()).filter(Boolean);
                                  if (group && allowedGroups.length > 0 && !allowedGroups.includes(group)) {
                                    return false; // 이 학생의 그룹이 대상 그룹에 없음
                                  }
                                }

                                return true;
                              }) : [];

                              // 배경색 결정: 수행평가가 있으면 파란색(과거는 회색), 없고 오늘이면 연한 붉은색, 그 외는 기본
                              let bgColor = "bg-yellow-50 hover:bg-yellow-100";
                              let cellInlineStyle: React.CSSProperties | undefined;
                              if (includeAssessments && cellAssessments.length > 0) {
                                if (isPast) {
                                  bgColor = "bg-gray-200 border-gray-300";
                                } else if (settings?.assessment_timetable_color && votesData) {
                                  // Apply vote-based color to timetable cell
                                  const a = cellAssessments[0];
                                  const vi = votesData?.votes?.[String(a.id)];
                                  const net = vi ? (vi.helpful || 0) - (vi.distrust || 0) : 0;
                                  const blendHex = (base: string, mix: string, ratio: number) => {
                                    const p = (h: string) => { const x = h.replace('#',''); return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]; };
                                    const b = p(base), m = p(mix), r = ratio;
                                    return '#' + b.map((c, i) => Math.round(c*(1-r)+m[i]*r).toString(16).padStart(2,'0')).join('');
                                  };
                                  if (net > 0) {
                                    const mixColor = settings?.assessment_positive_color || '#22c55e';
                                    const ratio = Math.min(100, parseInt(settings?.assessment_positive_ratio || '30')) / 100;
                                    const scaled = Math.min(1, (vi?.helpful || 0) / 10) * ratio;
                                    cellInlineStyle = { backgroundColor: blendHex('#dbeafe', mixColor, scaled) };
                                    bgColor = "border-blue-300";
                                  } else if (net < 0) {
                                    const mixColor = settings?.assessment_negative_color || '#9ca3af';
                                    const ratio = Math.min(100, parseInt(settings?.assessment_negative_ratio || '40')) / 100;
                                    const scaled = Math.min(1, (vi?.distrust || 0) / 10) * ratio;
                                    cellInlineStyle = { backgroundColor: blendHex('#dbeafe', mixColor, scaled) };
                                    bgColor = "border-blue-300";
                                  } else {
                                    bgColor = "bg-blue-100 border-blue-300";
                                  }
                                } else {
                                  bgColor = "bg-blue-100 border-blue-300";
                                }

                                if (cellAssessments.some(a => a.isPostponed)) {
                                  bgColor = "bg-white border-red-300";
                                  cellInlineStyle = { 
                                    ...cellInlineStyle, 
                                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(239, 68, 68, 0.1) 10px, rgba(239, 68, 68, 0.1) 20px)' 
                                  };
                                }
                              } else if (isToday) {
                                bgColor = "bg-red-50 hover:bg-red-100 group-data-[print-theme=color]:print:!bg-yellow-50 group-data-[print-theme=color]:capturing:!bg-yellow-50 group-data-[print-theme=simple]:print:!bg-yellow-50 group-data-[print-theme=simple]:capturing:!bg-yellow-50";
                              }

                              if (item && item.isChanged && !cellInlineStyle && !isPast && cellAssessments.length === 0) {
                                const tColor = settings?.changed_class_tint_color || '#fef08a';
                                const tOpacity = settings?.changed_class_tint_opacity !== undefined ? parseFloat(settings.changed_class_tint_opacity) : 1.0;
                                const h = tColor.replace('#', '');
                                const r = parseInt(h.length === 3 ? h.slice(0, 1).repeat(2) : h.slice(0, 2), 16);
                                const g = parseInt(h.length === 3 ? h.slice(1, 2).repeat(2) : h.slice(2, 4), 16);
                                const b = parseInt(h.length === 3 ? h.slice(2, 3).repeat(2) : h.slice(4, 6), 16);
                                cellInlineStyle = { backgroundColor: `rgba(${r}, ${g}, ${b}, ${tOpacity})` };
                              }

                              // 과거 날짜 스타일
                              const pastStyle = isPast ? "opacity-70 bg-gray-50 text-gray-400 print:!opacity-100 group-data-[print-theme=color]:print:!bg-yellow-50 group-data-[print-theme=simple]:print:!bg-yellow-50 print:!text-gray-900 capturing:!opacity-100 group-data-[print-theme=color]:capturing:!bg-yellow-50 group-data-[print-theme=simple]:capturing:!bg-yellow-50 capturing:!text-gray-900" : "";

                              // 선택된 셀 스타일
                              const isSelected = selectedCell?.weekday === weekdayIdx && selectedCell?.classTime === classTime;
                              const selectionStyle = isSelected ? "ring-2 ring-blue-500 ring-inset z-10" : "";


                              // 빈교실/공강 확인 (시각적 효과 없음, 클릭만 막음)
                              const isSubjectDisabled = item && (!item.subject.trim() || ["빈교실", "공강", "창체", "자습", "동아리", "점심시간", "Empty", "Free"].some(ex => item.subject.trim().includes(ex)));

                              const group = computedGroups[`${weekdayIdx}-${classTime}`];
                              const electiveSelection = currentProfile?.electives?.[group];
                              let displaySubject = item ? item.subject : "-";
                              let displayTeacher = item ? item.teacher : "";
                              // displaySubject가 항상 문자열이도록 보장 (elective 데이터 손상 방어)

                              let isElectiveActive = false;
                              let isCancelledByFreePeriod = false;
                              let displayClassName = ""; // 반(반이름) 표시용
                              if (group && electiveSelection) {
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

                                // 반(className): electiveConfigs에서 group+subject로 조회
                                const configEntry = (electiveConfigs || []).find((c: any) =>
                                  c.subject === electiveSelection.subject &&
                                  c.classCode?.split(",").map((s: string) => s.trim()).includes(group)
                                );

                                displaySubject = configEntry?.fullSubjectName || electiveSelection.subject || displaySubject;

                                if (configEntry?.fullTeacherName) {
                                  displayTeacher = configEntry.fullTeacherName;
                                } else if (matchingSlot) {
                                  displayTeacher = matchingSlot.teacher;
                                } else if (electiveTeachers.length > 0) {
                                  displayTeacher = electiveTeachers[0];
                                } else {
                                  displayTeacher = item ? item.teacher : "";
                                }

                                let rawClassName = (configEntry as any)?.className || "";
                                try {
                                  const parsed = JSON.parse(rawClassName);
                                  displayClassName = parsed[group] || parsed["_global"] || "";
                                } catch (e) {
                                  // Fallback to legacy string if it wasn't JSON
                                  displayClassName = rawClassName;
                                }
                              } else {
                                // For non-elective regular subjects, try to find full name override
                                if (item && electiveConfigs) {
                                  const subjectMatch = electiveConfigs.find((c: any) => 
                                    c.subject === item.subject && 
                                    c.originalTeacher === item.teacher
                                  );
                                  if (subjectMatch && subjectMatch.fullTeacherName) {
                                    displayTeacher = subjectMatch.fullTeacherName;
                                  }
                                }
                              }

                              let relocationStyle = "";
                              if (relocatingAssessment) {
                                if (displaySubject.trim() === relocatingAssessment.subject.trim()) {
                                  if (pendingRelocation?.date === toDateString(weekDates[weekdayIdx]) && pendingRelocation?.classTime === classTime) {
                                     relocationStyle = "ring-4 ring-red-500 ring-inset z-20 shadow-lg scale-[1.02] transform !bg-red-50";
                                  } else {
                                     relocationStyle = "ring-2 ring-red-300 ring-inset cursor-pointer z-10 hover:bg-red-50 animate-pulse";
                                  }
                                } else {
                                  relocationStyle = "opacity-30 blur-[2px] pointer-events-none transition-all duration-300";
                                }
                              }

                              return (
                                <td
                                  key={weekdayIdx}
                                  id={`cell-${weekdayIdx}-${classTime}`}
                                  onClick={() => {
                                    if (relocatingAssessment) {
                                      if (displaySubject.trim() === relocatingAssessment.subject.trim()) {
                                        setPendingRelocation({ date: toDateString(weekDates[weekdayIdx]), classTime });
                                      }
                                      return; // 릴로케이션 모드에서는 일반 클릭 무시
                                    }
                                    if (item || isElectiveActive) {
                                      if (isSubjectDisabled && !isElectiveActive) {
                                        toast.error(`${item.subject}은(는) 선택할 수 없습니다.`);
                                        return;
                                      }
                                      if (!isPast || cellAssessments.length > 0) {
                                        const subjectToSave = displaySubject;
                                        const tToSave = displayTeacher || "";
                                        const cToSave = (isElectiveActive && group) ? group : "";
                                        handleCellClick(weekdayIdx, classTime, subjectToSave, weekDates[weekdayIdx], cellAssessments, tToSave, cToSave);
                                      }
                                    }
                                  }}
                                  className={`border p-1 md:p-2 text-center h-16 md:h-20 relative transition-all overflow-hidden
                                ${bgColor} ${pastStyle} ${selectionStyle} ${relocationStyle}
                                ${(item || isElectiveActive) && (!isPast || cellAssessments.length > 0) ? "cursor-pointer" : "cursor-default"}
                              `}
                                  style={cellInlineStyle}
                                >
                                  {isElectiveActive && group && (
                                    <div className={`absolute top-0 right-0 px-1 rounded-bl-md text-[9px] md:text-[10px] font-bold ${isPast ? "bg-gray-100 text-gray-400 print:!bg-orange-100 print:!text-orange-800 capturing:!bg-orange-100 capturing:!text-orange-800" : "bg-orange-100 text-orange-800"}`}>
                                      <span>{group}</span><span className="hidden md:inline">그룹</span>
                                    </div>
                                  )}
                                  <div className="flex flex-col items-center justify-center h-full min-h-0">
                                    {item || isElectiveActive ? (
                                      <>
                                        <div
                                          className={`font-bold leading-tight w-full px-1 ${isPast ? "text-gray-400 print:!text-gray-900 capturing:!text-gray-900" : "text-gray-900"} ${(displaySubject || "").length > 6 ? 'text-[9px] break-keep' : (displaySubject || "").length > 4 ? 'text-[11px]' : ''}`}
                                        >
                                          <span className={(displaySubject || "").length <= 4 ? "text-sm md:text-base" : ""}>
                                            {isCancelledByFreePeriod ? (
                                              <span className="print:flex print:flex-col print:items-center">
                                                <span className="line-through opacity-60 flex-shrink-0 whitespace-nowrap">{displaySubject}</span>
                                                <span className={`block md:inline mt-0.5 md:mt-0 md:ml-1 print:ml-0 text-xs font-normal ${isPast ? "text-gray-400 print:!text-blue-500 capturing:!text-blue-500" : "text-blue-500"} print:block print:mt-0.5 print:!text-[2.3cqh]`}>(공강)</span>
                                              </span>
                                            ) : (
                                              displaySubject?.includes("공강") && displaySubject !== "공강" ? (
                                                <span className="flex flex-col md:inline md:flex-row items-center">
                                                  <span>{displaySubject.replace("공강", "")}</span>
                                                  <span className="block md:inline md:ml-1">공강</span>
                                                </span>
                                              ) : (
                                                <span>{displaySubject}</span>
                                              )
                                            )}
                                          </span>
                                        </div>
                                        <div className="text-[10px] md:text-xs text-gray-500 mt-0.5 w-full px-1 flex flex-col md:flex-row print:flex-row print:flex-nowrap items-center md:justify-center print:justify-center overflow-hidden leading-tight md:leading-normal print:leading-tight">
                                          {!isCancelledByFreePeriod && displayTeacher ? (
                                            <span className="truncate shrink min-w-0 max-w-full print:text-[1.8cqh]">{displayTeacher}</span>
                                          ) : null}
                                          {(settings?.show_target_class_main_menu !== false && displayClassName) ? (
                                            <span className={`truncate shrink min-w-0 max-w-full font-medium text-gray-600 print:text-[1.8cqh] print:!text-gray-500 ${!isCancelledByFreePeriod && displayTeacher ? "md:ml-1.5 print:ml-1" : ""}`}>
                                              {displayClassName}
                                            </span>
                                          ) : null}
                                        </div>
                                        {includeAssessments && cellAssessments.length > 0 && (
                                          <div className="mt-0.5 flex-shrink-0">
                                            <div className="flex flex-wrap gap-0.5 justify-center">
                                              {cellAssessments.map(a => (
                                                <span key={a.id} className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded-full leading-none whitespace-nowrap ${isPast ? "bg-gray-400 text-white" : a.isPostponed ? "bg-white text-red-500 border border-red-500" : "bg-blue-600 text-white"} print:bg-gray-200 print:text-gray-700 print:text-[1cqh] print:px-0.5 print:py-0 print:border print:border-gray-400`}>
                                                  {a.description && a.description.includes("차") ? a.description : '평가'}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-gray-300 text-sm">-</span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                      </table>

                      {/* 특수일정 오버레이 (Absolute Table) */}
                      {settings?.special_schedules_enabled && (
                        <table aria-hidden="true" className={`absolute top-0 left-0 w-full min-h-full h-full border-collapse table-fixed pointer-events-none z-10 transition-all duration-300 ${isElectiveMissingImmediate ? "hidden" : ""}`}>
                          <thead>
                            <tr>
                              <th className="border-transparent p-1 md:p-2 bg-transparent w-8 md:w-10 text-sm font-medium"><div className="invisible">교시</div></th>
                              {weekdayNames.map((day, idx) => (
                                <th key={day} className="border-transparent bg-transparent p-1 md:p-2 font-medium w-1/5 relative">
                                  <div className="text-sm font-semibold invisible">{day}</div>
                                  <div className="text-[10px] md:text-xs font-normal invisible">
                                    {formatDate(weekDates[idx])}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: 7 }, (_, i) => i + 1).map((classTime) => (
                              <tr key={classTime}>
                                <td className="border-transparent bg-transparent p-1 md:p-2 text-center text-sm w-8 md:w-10 opacity-0">{classTime}</td>
                                {Array.from({ length: 5 }, (_, weekdayIdx) => {
                                  const currentDate = toDateString(weekDates[weekdayIdx]);
                                  const specialSchedule = settings?.special_schedules?.find((s: any) => 
                                    s.date === currentDate && (s.grade === 0 || s.grade.toString() === grade.toString())
                                  );

                                  if (specialSchedule) {
                                    if (classTime === 1) {
                                      const opacityRatio = (specialSchedule.opacity ?? 100) / 100;
                                      return (
                                        <td key={weekdayIdx} rowSpan={7} className="border-transparent p-0 align-middle text-center relative pointer-events-auto">
                                          <div className="absolute inset-0 z-[-1] mix-blend-multiply" style={{ backgroundColor: `rgba(253, 232, 232, ${opacityRatio})` }} />
                                          <div className={`relative z-10 w-full h-full flex flex-col items-center justify-center p-2 md:p-4 whitespace-pre-wrap font-black text-pink-700 leading-tight tracking-widest ${specialSchedule.fontSize}`}>
                                            {specialSchedule.text}
                                          </div>
                                        </td>
                                      );
                                    } else {
                                      return null;
                                    }
                                  }
                                  
                                  return <td key={weekdayIdx} className="border-transparent bg-transparent"></td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
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
                {settings?.allow_png_download !== false && (
                  <Button onClick={handleDownloadPng} className="w-full flex items-center justify-center gap-2 h-12">
                    <ImageIcon className="w-5 h-5" />
                    이미지(PNG)로 저장
                  </Button>
                )}
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
                    {assessment.classCode && (
                      <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full font-medium">
                        {assessment.classCode}그룹
                      </span>
                    )}
                    {assessment.teacher && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-medium">
                        {assessment.teacher}
                      </span>
                    )}
                    {!assessment.classCode && typeof assessment.subject === 'string' && assessment.subject.match(/\((.*?그룹.*?)\)$/) && (
                      <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full font-medium">
                        {assessment.subject.match(/\((.*?그룹.*?)\)$/)?.[1]}
                      </span>
                    )}
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
                <div className="flex justify-between items-end mt-2">
                  <div className="text-xs text-gray-500">
                    {assessment.dueDate}
                  </div>
                  {assessment.dueDate >= toDateString(new Date()) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-3 border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700 transition-colors font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRelocatingAssessment(assessment);
                        setShowViewDialog(false);
                      }}
                    >
                      날짜 바꾸기
                    </Button>
                  )}
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

      {/* 모바일 전용 PWA 앱 다운로드 버튼 (설치 상태 및 환경에 따라 상태 변경) */}
      {!isInAppBrowser && settings?.pwa_install_button_visible !== false && (
        <div className="md:hidden mt-6 mb-2 space-y-2">
          {/* App Download for Normal Browsers (Chrome, etc.) vs Add to Home Screen for Samsung/In-App */}
          {isSamsungBrowser ? (
            // For Samsung browsers: respect admin toggle from '미해결 문제' settings
            !hasPwaCookie && settings?.samsung_install_button_visible !== false && (
              <>
                <Button
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className={`w-full h-14 ${isInstalling ? 'bg-gray-300 text-gray-700' : 'bg-[#3DDC84] hover:bg-[#35c073] text-black'} font-bold text-lg rounded-xl shadow-md flex items-center justify-center gap-3 transition-transform active:scale-95`}
                >
                  {isInstalling ? (
                    <Loader2 className="w-7 h-7 animate-spin border-gray-500" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 outline-none">
                      <path d="M11 17h2v-6h-2v6Zm1-8q.425 0 .713-.288T13 8q0-.425-.288-.713T12 7q-.425 0-.713.288T11 8q0 .425.288.713T12 9Zm0 13q-2.075 0-3.9-.788t-3.175-2.137q-1.35-1.35-2.137-3.175T2 12q0-2.075.788-3.9t2.137-3.175q1.35-1.35 3.175-2.137T12 2q2.075 0 3.9.788t3.175 2.137q1.35 1.35 2.137 3.175T22 12q0 2.075-.788 3.9t-2.137 3.175q-1.35 1.35-3.175 2.137T12 22Z" />
                    </svg>
                  )}
                  <span>{isInstalling ? '설치 중...' : '홈 화면에 성지수행 추가'}</span>
                </Button>
              </>
            )
          ) : (
            // Normal PWA Prompt (Chrome, Safari, etc.)
            !hasPwaCookie && !isStandalone && (
              <>
                <Button
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className={`w-full h-14 ${isInstalling ? 'bg-gray-300 text-gray-700' : 'bg-[#3DDC84] hover:bg-[#35c073] text-black'} font-bold text-lg rounded-xl shadow-md flex items-center justify-center gap-3 transition-transform active:scale-95`}
                >
                  {isInstalling ? (
                    <Loader2 className="w-7 h-7 animate-spin border-gray-500" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0004.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.4158.4158 0 0 0-.1516-.5668.4144.4144 0 0 0-.5665.1517L17.11 8.9959a11.9701 11.9701 0 0 0-5.1102-1.1448c-1.8028 0-3.5134.4074-5.1106 1.1448L4.8385 5.4471A.4147.4147 0 0 0 4.272 5.2954a.4159.4159 0 0 0-.1516.5668l1.9972 3.4594C2.6224 11.2335.3418 14.8872.036 19.112h23.928c-.3058-4.2248-2.5864-7.8785-6.0825-9.7906" />
                    </svg>
                  )}
                  <span>{isInstalling ? '설치 중...' : '성지수행 앱 다운로드'}</span>
                </Button>
              </>
            )
          )}
        </div>
      )}
      {/* 수행평가 목록 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>
            <span>{weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : `${weekOffset}주 후`}</span> 수행평가 ({weekRangeText})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {assessments && assessments.filter(assessment => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const effDate = assessment.tempDueDate || assessment.dueDate;
              return new Date(effDate) >= today;
            }).length > 0 ? (
              assessments
                .filter(assessment => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const effDate = assessment.tempDueDate || assessment.dueDate;
                  return new Date(effDate) >= today;
                })
                .map((assessment) => {
                  const effDate = assessment.tempDueDate || assessment.dueDate;
                  const diffDate = Math.ceil((new Date(effDate).getTime() - new Date(toDateString(new Date())).getTime()) / (1000 * 60 * 60 * 24));
                  const dDay = diffDate === 0 ? "D-0" : diffDate > 0 ? `D-${diffDate}` : `D+${Math.abs(diffDate)}`;
                  const isToday = diffDate === 0;

                  // Compute card background based on vote reliability
                  const voteInfo = votesData?.votes?.[String(assessment.id)];
                  let cardBg = isToday ? '#fef2f2' : '#ffffff'; // default: red-50 or white
                  if (voteInfo && !isToday) {
                    const net = (voteInfo.helpful || 0) - (voteInfo.distrust || 0);
                    if (net > 0) {
                      // Positive: blend bg-white with positive color
                      const mixColor = settings?.assessment_positive_color || '#22c55e';
                      const ratio = Math.min(100, parseInt(settings?.assessment_positive_ratio || '30')) / 100;
                      const scaled = Math.min(1, (voteInfo.helpful || 0) / 10) * ratio;
                      const p = (h: string) => { const x = h.replace('#',''); return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]; };
                      const b = p('#ffffff'), m = p(mixColor);
                      cardBg = '#' + b.map((c, i) => Math.round(c*(1-scaled)+m[i]*scaled).toString(16).padStart(2,'0')).join('');
                    } else if (net < 0) {
                      // Negative: blend bg-white with negative color
                      const mixColor = settings?.assessment_negative_color || '#9ca3af';
                      const ratio = Math.min(100, parseInt(settings?.assessment_negative_ratio || '40')) / 100;
                      const scaled = Math.min(1, (voteInfo.distrust || 0) / 10) * ratio;
                      const p = (h: string) => { const x = h.replace('#',''); return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]; };
                      const b = p('#ffffff'), m = p(mixColor);
                      cardBg = '#' + b.map((c, i) => Math.round(c*(1-scaled)+m[i]*scaled).toString(16).padStart(2,'0')).join('');
                    }
                  }

                  return (
                    <div
                      key={assessment.id}
                      className={`border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full ${isToday ? 'border-red-200' : ''}`}
                      style={{ 
                        backgroundColor: cardBg,
                        backgroundImage: assessment.isPostponed ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(239, 68, 68, 0.05) 10px, rgba(239, 68, 68, 0.05) 20px)' : 'none'
                      }}
                      onClick={() => {
                        // Find the cell logic
                        const targetDate = new Date(assessment.tempDueDate || assessment.dueDate); // This might be string 'YYYY-MM-DD'
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
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1 flex-wrap mb-1">
                            <span className="font-bold text-lg text-blue-600">
                              {assessment.subject}
                            </span>
                            <span className="text-sm px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              {assessment.description}
                            </span>
                            {!assessment.isPostponed && (
                              <span className={`text-base font-bold ${isToday ? 'text-red-600' : 'text-gray-500'} ml-1`}>
                                {dDay}
                              </span>
                            )}
                          </div>
                          {assessment.isPostponed && Boolean(assessment.isAutoPredicted) && (
                            <div className="text-red-500 text-sm font-bold mt-0.5">
                              시간표 변경
                            </div>
                          )}
                        </div>
                        {grade && classNum && studentNumber && (
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                            <button
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                votesData?.myVotes?.[String(assessment.id)] === 'helpful'
                                  ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                                  : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600'
                              }`}
                              onClick={(e) => { voteMutation.mutate({ assessmentId: assessment.id, vote: 'helpful' }); e.currentTarget.blur(); }}
                              disabled={voteMutation.isPending}
                            >
                              <ThumbsUp className="w-4 h-4" />
                              <span>땡큐</span>
                              <span className="font-bold">{votesData?.votes?.[String(assessment.id)]?.helpful || 0}</span>
                            </button>
                            <button
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                votesData?.myVotes?.[String(assessment.id)] === 'distrust'
                                  ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                                  : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600'
                              }`}
                              onClick={(e) => { voteMutation.mutate({ assessmentId: assessment.id, vote: 'distrust' }); e.currentTarget.blur(); }}
                              disabled={voteMutation.isPending}
                            >
                              <X className="w-4 h-4" />
                              <span>가짜</span>
                              <span className="font-bold">{votesData?.votes?.[String(assessment.id)]?.distrust || 0}</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-gray-700 mb-2">{assessment.title}</p>
                      <div className="flex items-end justify-between mt-auto">
                        <div className={`flex text-sm text-gray-500 ${assessment.isPostponed ? 'flex-col items-start gap-1' : 'items-center'}`}>
                          {assessment.isPostponed ? (
                            <>
                              <div className="flex items-center">
                                <span className="line-through text-gray-400">{formatShortDateText(assessment.originalDueDate || assessment.dueDate)} {(assessment.originalClassTime || assessment.classTime)}교시</span>
                                <span className="mx-1 font-bold text-red-500">➔</span>
                              </div>
                              <div className="flex items-center">
                                <span className="font-bold text-red-600">{formatShortDateText(assessment.tempDueDate || assessment.dueDate)} {assessment.tempClassTime || assessment.classTime}교시</span>
                                {Boolean(assessment.isAutoPredicted) && (
                                  <span className="ml-1 text-xs text-orange-500 font-bold whitespace-nowrap">(자동예측)</span>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <span>{assessment.dueDate}</span>
                              <span className="mx-2">|</span>
                              <span>{assessment.classTime}교시</span>
                            </>
                          )}
                        </div>
                        {assessment.isPostponed && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs px-2 shadow-sm ml-2 shrink-0 pointer-events-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRelocatingAssessment(assessment);
                              setPendingRelocation(null);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            날짜 바꾸기
                          </Button>
                        )}
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
              <div className="flex flex-col gap-1 md:gap-2">
                <p
                  className="font-bold text-base md:text-xl leading-relaxed bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(to right, red, orange, green, blue, indigo, violet)' }}
                >
                  표의 칸을 클릭해서 수행평가를 추가하십쇼
                </p>
                <p className="text-sm md:text-base font-semibold text-green-600">
                  입력하면 큰 도움이 됩니다 ^^
                </p>
              </div>
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
      {/* Custom Relocation Action Bar */}
      {relocatingAssessment && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-red-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-4 z-[9999] animate-in slide-in-from-bottom-2 duration-300">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 leading-tight">
                  <span className="text-red-600">{relocatingAssessment.subject}</span> 임시 이동 날짜 선택
                </p>
                <p className="text-sm text-gray-500">
                  {pendingRelocation 
                    ? `선택됨: ${pendingRelocation.date} (${pendingRelocation.classTime}교시)` 
                    : "위 시간표에서 붉은 점선 칸 중 하나를 클릭해 임시 이동할 날짜를 직접 선택하세요."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button 
                variant="outline" 
                className="flex-1 md:flex-none hover:bg-gray-50"
                onClick={() => {
                  setRelocatingAssessment(null);
                  setPendingRelocation(null);
                }}
                disabled={isRelocatingUpdating}
              >
                취소
              </Button>
              <Button 
                className="flex-1 md:flex-none bg-red-600 hover:bg-red-700 text-white transition-colors"
                disabled={!pendingRelocation || isRelocatingUpdating || updateMutation.isPending}
                onClick={handleRelocationSubmit}
              >
                {(isRelocatingUpdating || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                적용
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* 선택과목 선택 다이얼로그 */}
      <ElectiveSelectionDialog
        isOpen={showElectiveDialog}
        grade={grade}
        classNum={classNum}
        studentNumber={studentNumber}
        datasetId={(rawTimetableData as any)?.datasetId || ''}
        forceManualMode={
          grade === '2'
            ? (settings?.elective_input_mode_grade2 ?? settings?.elective_input_mode) === 'manual'
            : (settings?.elective_input_mode_grade3 ?? settings?.elective_input_mode) === 'manual'
        }
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
