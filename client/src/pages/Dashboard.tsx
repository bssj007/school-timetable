
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Route, Switch, useLocation, Link } from "wouter";
import { Loader2, Trash2, Plus, Download, ChevronLeft, ChevronRight, Pencil, LogOut, ArrowUp, ShieldAlert, AlertTriangle, Printer, Image as ImageIcon } from "lucide-react";
import { toPng } from "html-to-image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useUserConfig } from "@/contexts/UserConfigContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ElectiveSelectionDialog from "@/components/ElectiveSelectionDialog";

// ????뺤쓽
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
  round?: number; // 李⑥닔 異붽?
}

// 二쇱쓽 ?쒖옉??怨꾩궛 (?붿슂??湲곗?)
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// ?좎쭨 ?щ㎎??function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 二쇨컙 ?좎쭨 諛곗뿴 ?앹꽦
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

// ?좎쭨瑜?YYYY-MM-DD ?뺤떇?쇰줈 蹂??(濡쒖뺄 ?쒓컙 湲곗?)
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ?좎쭨媛 ?뱀젙 二쇱뿉 ?랁븯?붿? ?뺤씤
function isDateInWeek(dateStr: string, weekDates: Date[]): boolean {
  const date = new Date(dateStr);
  const startDate = new Date(weekDates[0]);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(weekDates[4]);
  endDate.setHours(23, 59, 59, 999);

  return date >= startDate && date <= endDate;
}

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

  // ?몄뇙 / ?대낫?닿린 state
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [includeAssessments, setIncludeAssessments] = useState(true);
  const timetableRef = useRef<HTMLDivElement>(null);

  // PNG ?ㅼ슫濡쒕뱶 ?몃뱾??  const handleDownloadPng = async () => {
    if (!timetableRef.current) return;
    try {
      document.body.classList.add('capturing');
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await toPng(timetableRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        width: 800,
        height: 800,
      });
      document.body.classList.remove('capturing');
      const link = document.createElement('a');
      link.download = `${grade}?숇뀈_${classNum}諛??쒓컙??png`;
      link.href = dataUrl;
      link.click();
      toast.success("?쒓컙???대?吏媛 ??λ릺?덉뒿?덈떎.");
      setShowPrintOptions(false);
    } catch (err) {
      document.body.classList.remove('capturing');
      toast.error("?대?吏 ???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
    }
  };

  // ?몄뇙 ?몃뱾??  const handlePrint = () => {
    setShowPrintOptions(false);
    setTimeout(() => window.print(), 100);
  };

  // Extract datasetId early for use in effects
  const datasetId = (queryClient.getQueryData(['timetable', schoolName, grade, classNum]) as any)?.datasetId || '';

  // 2, 3?숇뀈 ?좏깮怨쇰ぉ ?ㅼ젙 ?뺤씤
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

  // 1. ?쒓컙??議고쉶
  // 1. ?쒓컙??議고쉶
  // ?쒓컙??? ?대┃ ?몃뱾??  const handleCellClick = (
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

    // ?좏깮 ?④낵瑜??꾪빐 ?곹깭 ?ㅼ젙
    setSelectedCell({ weekday: weekdayIdx, classTime });

    // ?쒓컖???쇰뱶諛깆쓣 ?꾪빐 ?쎄컙??吏?????ㅼ씠?쇰줈洹??ㅽ뵂
    setTimeout(() => {
      if (cellAssessments.length > 0) {
        // ?섑뻾?됯?媛 ?덉쑝硫??뺣낫 ?ㅼ씠?쇰줈洹??쒖떆 (怨쇨굅 ?댁뿭??議고쉶??媛??
        setViewingAssessments(cellAssessments);
        setShowViewDialog(true);
      } else {
        // 怨쇨굅 ?좎쭨??異붽? 遺덇?
        if (isPast) {
          toast.error("吏?섍컙 ?좎쭨?먮뒗 ?섑뻾?됯?瑜?異붽??????놁뒿?덈떎.");
          setSelectedCell(null);
          return;
        }

        // ?섑뻾?됯?媛 ?놁쑝硫?異붽? ?ㅼ씠?쇰줈洹??쒖떆
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

  // 1. ?쒓컙??議고쉶
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
    retry: true, // 臾댄븳 ?ъ떆??    retryDelay: 3000, // 3珥?媛꾧꺽
  });

  // 1.5 ?좏깮怨쇰ぉ ?곗씠??諛??꾨줈??議고쉶 (2, 3?숇뀈??
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
          } catch (e) { }
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

  // 5. ?ㅼ젙 議고쉶 (Public)
  const { data: settings } = useQuery({
    queryKey: ['publicSettings'],
    queryFn: async () => {
      const res = await fetch('/api/settings/public');
      if (!res.ok) return { hide_past_assessments: false };
      return res.json();
    },
    staleTime: 0, // ??긽 理쒖떊 ?ㅼ젙??媛?몄삤?꾨줉 (洹몃９ override ??利됱떆 諛섏쁺)
  });

  // 媛??쒓컙(援먯떆)蹂??ㅼ닔寃?洹몃９ 怨꾩궛
  // We keep track of the last successfully computed groups to prevent flickering during refetches.
  const lastValidGroupsRef = React.useRef<Record<string, string>>({});

  const computedGroups = useMemo(() => {
    if (grade !== "2" && grade !== "3") {
      lastValidGroupsRef.current = {};
      return {};
    }
    // ?쒓컙???곗씠???먯껜媛 ?놁쑝硫?留덉?留??좏슚媛??좎?
    if (!allClassesTimetable || allClassesTimetable.length === 0) {
      return lastValidGroupsRef.current;
    }

    const cellGroups: Record<string, string> = {};

    // electiveConfigs媛 ?덉쓣 ?뚮쭔 ?먮룞 媛먯? ?섑뻾
    if (electiveConfigs && electiveConfigs.length > 0) {
      const subjectTeacherToGroups = new Map<string, string[]>();
      const subjectToGroups = new Map<string, string[]>();

      electiveConfigs.forEach((c: any) => {
        const isFreePeriod = ["鍮덇탳??, "怨듦컯", "Empty", "Free"].some(k => (c.subject || "").includes(k));
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

    // Override??electiveConfigs ?좊Т? 臾닿??섍쾶 ??긽 ?곸슜
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

  // 2. 而댁떆媛꾩뿉???쒓컙??媛?몄삤湲?  const fetchFromComcigan = useMutation({
    mutationFn: async () => {
      if (!schoolName || !grade || !classNum) {
        throw new Error('?숆탳, ?숇뀈, 諛??뺣낫媛 ?꾩슂?⑸땲??);
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
        throw new Error('?쒓컙??媛?몄삤湲??ㅽ뙣');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data?.message || '?쒓컙?쒕? ?깃났?곸쑝濡?媛?몄솕?듬땲??');
      refetchTimetable();
    },
    onError: (error: Error) => {
      toast.error(error.message || '?쒓컙??媛?몄삤湲??ㅽ뙣');
    },
  });

  // 3. ?섑뻾?됯? 紐⑸줉 議고쉶
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

  // ?꾩옱 二쇱뿉 ?대떦?섎뒗 ?섑뻾?됯?留??꾪꽣留?諛??뺣젹
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

  // 4. ?섑뻾?됯? 異붽?
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.content,
          subject: data.subject,
          description: data.round ? `${data.round}李? : "",
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
      toast.success("?섑뻾?됯?媛 ?깅줉?섏뿀?듬땲??);
    },
    onError: (error) => toast.error(error.message || "?깅줉 ?ㅽ뙣")
  });

  // 5. ?섑뻾?됯? ??젣
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/assessment?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success("??젣?섏뿀?듬땲??);
      setSelectedCell(null);
    }
  });

  // 6. ?섑뻾?됯? ?섏젙
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
      toast.success("?섑뻾?됯?媛 ?섏젙?섏뿀?듬땲??);
      setShowEditDialog(false);
      setEditingAssessment(null);
      setSelectedCell(null);
    },
    onError: (error) => toast.error(error.message || "?섏젙 ?ㅽ뙣")
  });

  // ?쒓컙?쒖뿉??怨좎쑀??怨쇰ぉ 紐⑸줉 異붿텧
  const uniqueSubjects = useMemo(() => {
    if (!timetableData || !Array.isArray(timetableData)) return [];
    const subjects = new Set<string>();
    const excludedSubjects = ["李쎌껜", "梨꾪뵆"];

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
      setShowAddDialog(false); // ?ㅼ씠?쇰줈洹??リ린
      setSelectedCell(null); // ?좏깮 ? ?댁젣
    } catch (error) {
      console.error("?섑뻾?됯? ?앹꽦 ?ㅽ뙣:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("?뺣쭚 ??젣?섏떆寃좎뒿?덇퉴?")) return;
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error("?섑뻾?됯? ??젣 ?ㅽ뙣:", error);
    }
  };

  const handleEditClick = (assessment: AssessmentItem) => {
    setEditingAssessment(assessment);
    setFormData({
      assessmentDate: assessment.dueDate,
      subject: assessment.subject,
      content: assessment.title,
      classTime: assessment.classTime?.toString() || "",
      round: assessment.round?.toString() || "1",
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
        round: parseInt(formData.round || "1"),
      });
    } catch (error) {
      console.error("?섑뻾?됯? ?섏젙 ?ㅽ뙣:", error);
    }
  };

  // ?숇쾲 ?щ㎎ 怨꾩궛
  const formattedStudentId = useMemo(() => {
    if (!grade || !classNum || !studentNumber) return "";
    return `${grade}${classNum.padStart(1, '0')}${studentNumber.padStart(2, '0')}`;
  }, [grade, classNum, studentNumber]);

  // ?좏깮怨쇰ぉ ?붿빟 (?몄뇙 ?ㅻ뜑??
  const electiveSummary = useMemo(() => {
    if (!currentProfile?.electives) return "";
    return Object.entries(currentProfile.electives)
      .filter(([, sel]: [string, any]) => sel && (sel.subject || sel.fullSubjectName))
      .map(([group, sel]: [string, any]) => `${group}: ${sel.fullSubjectName || sel.subject}`)
      .join(", ");
  }, [currentProfile]);

  // ?붿씪蹂꾨줈 ?쒓컙???곗씠?곕? 洹몃９??  const weekdayNames = ["??, "??, "??, "紐?, "湲?];
  const timetableByDay: Record<number, TimetableItem[]> = {};

  if (timetableData && Array.isArray(timetableData)) {
    timetableData.forEach((item) => {
      if (!timetableByDay[item.weekday]) {
        timetableByDay[item.weekday] = [];
      }
      timetableByDay[item.weekday].push(item);
    });
  }

  const isLoading = timetableLoading || assessmentLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin mr-2" />
        濡쒕뱶 以?..
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">?ъ씠???먭? 以?/h2>
          <p className="text-gray-600 mb-6 whitespace-pre-wrap leading-relaxed">
            {settings?.maintenance_mode?.message || "?쒕쾭 ?덉젙???묒뾽??吏꾪뻾 以묒엯?덈떎.\n?좎떆 ???ㅼ떆 ?묒냽??二쇱꽭??"}
          </p>
          {settings?.maintenance_mode?.endTime && (
            <div className="py-2 px-4 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium">
              ?먭? 醫낅즺 ?덉젙: {new Date(settings.maintenance_mode.endTime).toLocaleString()}
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
      toast.success('?ㅻ쪟?좉퀬媛 ?꾩넚?섏뿀?듬땲??');
      setBugReportMessage('');
      setShowBugReportDialog(false);
    } catch {
      toast.error('?좉퀬 ?꾩넚???ㅽ뙣?덉뒿?덈떎.');
    } finally {
      setIsBugReportSending(false);
    }
  };

  const weekRangeText = `${formatDate(weekDates[0])} ~ ${formatDate(weekDates[4])}`;

  const isElectiveMissingImmediate = !isElectiveEntered && (grade === "2" || grade === "3") && !!classNum && !!studentNumber;
  const isElectiveMissing = isElectiveMissingImmediate && showElectiveWarning;

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
            <span className="text-blue-600">?섑뻾 ?쇱젙怨듭쑀</span>
          </Link>

        </div>

        <div className="flex items-center gap-2">
          {isBugReportEnabled && (
            <Button
              variant="default"
              size="sm"
              className="h-9 rounded-full px-4 font-bold text-xs bg-red-500 hover:bg-red-600 text-white"
              onClick={() => setShowBugReportDialog(true)}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              ?ㅻ쪟?좉퀬
            </Button>
          )}
          {kakaoUser ? (
            <div className="flex items-center gap-2 sm:gap-3 bg-gray-50 pr-1 pl-3 py-1 rounded-full border border-gray-100">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] text-gray-400 font-medium leading-none mb-1">移댁뭅???곕룞??/span>
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
                title="濡쒓렇?꾩썐"
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
                "媛쒕컻 以?
              ) : (
                <>
                  <img src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png" alt="Kakao" className="h-4 w-4 mr-2" />
                  移댁뭅???곕룞
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
            <DialogTitle>?ㅻ쪟?좉퀬</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">
              諛쒓껄???ㅻ쪟??臾몄젣?먯쓣 ?ㅻ챸??二쇱꽭??
            </p>
            <Textarea
              placeholder="?? ?쒓컙?쒖뿉??3援먯떆 怨쇰ぉ紐낆씠 ?섎せ ?쒖떆?⑸땲??"
              value={bugReportMessage}
              onChange={(e) => setBugReportMessage(e.target.value)}
              rows={4}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBugReportDialog(false)}>
                痍⑥냼
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={handleBugReportSubmit}
                disabled={isBugReportSending || !bugReportMessage.trim()}
              >
                {isBugReportSending ? '?꾩넚 以?..' : '?좉퀬 ?꾩넚'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-row justify-between items-center gap-2 md:gap-4 mb-6 md:hidden">
        <div>
          <h1 className="text-xl md:text-3xl font-bold whitespace-nowrap">
            {grade || '?'}-{classNum || '?'} ?쒓컙??          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="flex items-center gap-[6px] md:gap-2">
            <Select
              value={grade}
              onValueChange={(val) => setConfig({ grade: val, classNum, studentNumber })}
            >
              <SelectTrigger className="relative w-[80px] md:w-[90px] shrink min-w-[50px] h-9 md:h-10 bg-white px-2 text-lg md:text-sm font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-2 [&>svg]:z-0 md:[&>svg]:static" style={selectorStyle}>
                <SelectValue placeholder="?숇뀈" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1?숇뀈</SelectItem>
                <SelectItem value="2">2?숇뀈</SelectItem>
                <SelectItem value="3">3?숇뀈</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Select
                value={classNum}
                onValueChange={(val) => setConfig({ grade, classNum: val, studentNumber })}
              >
                <SelectTrigger className="relative w-[70px] md:w-[80px] shrink min-w-[45px] h-9 md:h-10 bg-white px-2 text-lg md:text-sm font-bold [&>span]:relative [&>span]:z-10 [&>span]:!line-clamp-none [&>svg]:absolute [&>svg]:right-2 [&>svg]:z-0 md:[&>svg]:static" style={selectorStyle}>
                  <SelectValue placeholder="諛? />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num}諛?                    </SelectItem>
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
                  <SelectValue placeholder="踰덊샇" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 35 }, (_, i) => i + 1).map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num}踰?                    </SelectItem>
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
          <div className="min-h-[400px] mt-8 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm rounded-2xl border-2 border-red-100 shadow-sm p-8 max-w-2xl mx-auto">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 text-center">?묎렐 ?쒗븳 ?덈궡</h3>
            <p className="text-gray-600 text-lg md:text-xl whitespace-pre-wrap text-center leading-relaxed font-medium">
              {settings?.restriction_reason || `${grade}?숇뀈 ?쒕퉬?ㅺ? ?쇱떆?곸쑝濡??쒗븳?섏뿀?듬땲??`}
            </p>
          </div>
        ) : (
          <Card className="py-1 gap-1 md:py-2 md:gap-2">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 md:py-4 md:px-3 relative">
              {/* Desktop Title */}
              <div className="hidden md:flex items-center gap-2 flex-1 min-w-0">
                <h1 className="text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                  {grade || '?'}-{classNum || '?'} ?쒓컙??                </h1>
                {(grade === "2" || grade === "3") && (
                  <div className="relative inline-block">
                    <Button
                      size="sm"
                      className={`h-10 text-sm ml-2 shrink-0 transition-all duration-300 bg-[#fc6603] hover:bg-[#e05a00] text-white ${isElectiveMissing ? "animate-pulse" : ""}`}
                      style={isElectiveMissing && currentGradeColor ? { border: `2px solid ${currentGradeColor}` } : {}}
                      onClick={() => setShowElectiveDialog(true)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      ?좏깮怨쇰ぉ ?섏젙
                    </Button>
                    {isElectiveMissing && (
                      <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 animate-bounce flex flex-col items-center ml-1">
                        <ArrowUp className="w-8 h-16 text-[#fc6603]" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ?대낫?닿린/?몄뇙 踰꾪듉 (Desktop) */}
              <Button
                variant="outline"
                size="sm"
                className="hidden md:flex h-10 text-sm whitespace-nowrap bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 no-print ml-2"
                onClick={() => setShowPrintOptions(true)}
              >
                <Printer className="w-4 h-4 mr-1" />
                ?대낫?닿린 / ?몄뇙
              </Button>

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
                      ?좏깮怨쇰ぉ
                    </Button>
                    {isElectiveMissing && (
                      <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 animate-bounce flex flex-col items-center">
                        <ArrowUp className="w-8 h-16 text-[#fc6603]" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Week Navigation */}
              <div className="flex flex-col items-center justify-center gap-1 w-full -translate-x-1 md:translate-x-0 md:w-auto shrink-0 z-10 relative">
                <div className="flex items-center gap-2 md:gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-10 h-8 p-0"
                    onClick={() => setWeekOffset(weekOffset - 1)}
                    disabled={weekOffset === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm md:text-sm font-normal text-gray-600 min-w-[80px] md:min-w-[90px] text-center">
                    {weekRangeText}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeekOffset(weekOffset + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <span className={`text-lg md:text-lg ${weekOffset === 0 ? "text-red-500 font-bold" : weekOffset >= 1 ? "text-blue-500 font-bold" : "text-black"}`}>
                  {weekOffset === 0 ? "?대쾲 二? : weekOffset === 1 ? "?ㅼ쓬 二? : `${weekOffset}二???}
                </span>
                {kakaoUser && (
                  <div className="md:hidden flex items-center justify-center gap-2 bg-green-50 text-green-700 px-3 py-1 mt-2 rounded-md border border-green-100 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-semibold">{kakaoUser.nickname}</span>
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
                    <SelectValue placeholder="?숇뀈" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1?숇뀈</SelectItem>
                    <SelectItem value="2">2?숇뀈</SelectItem>
                    <SelectItem value="3">3?숇뀈</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={classNum}
                  onValueChange={(val) => setConfig({ grade, classNum: val, studentNumber })}
                >
                  <SelectTrigger className="w-[90px] md:w-[100px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                    <SelectValue placeholder="諛? />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}諛?                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={studentNumber}
                  onValueChange={(val) => setConfig({ grade, classNum, studentNumber: val })}
                >
                  <SelectTrigger className="w-[90px] md:w-[100px] shrink min-w-[50px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium" style={selectorStyle}>
                    <SelectValue placeholder="踰덊샇" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 35 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}踰?                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-1 pb-1 md:px-2 md:pb-2">
              <div id="timetable-container" ref={timetableRef} className="bg-white">
                {/* ?몄뇙/PNG 罹≪쿂 ?꾩슜 ?ㅻ뜑 */}
                <div className="capture-only mb-3 p-2 border rounded-lg text-black">
                  <div className="flex justify-between items-center mb-1">
                    <h2 className="text-lg font-bold">{grade}?숇뀈 {classNum}諛??쒓컙??/h2>
                    <span className="text-[10px] text-gray-500">
                      諛쒗뻾: {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs">
                    <div><span className="font-bold">?숇쾲:</span> {formattedStudentId || `${grade}${classNum}${studentNumber?.padStart(2, '0')}`}</div>
                    {electiveSummary && <div><span className="font-bold">?좏깮:</span> {electiveSummary}</div>}
                  </div>
                </div>
                <div className="overflow-x-auto relative">
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
                          ?좏깮怨쇰ぉ???낅젰?섏꽭??                        </div>
                      </div>
                    </div>
                  )}

                  <table className={`w-full border-collapse table-fixed transition-all duration-300 ${isElectiveMissingImmediate ? "blur-[3px] opacity-60 pointer-events-none select-none" : ""}`}>
                    <thead>
                      <tr>
                        <th className="border p-1 md:p-2 bg-gray-50 w-8 md:w-10 text-sm font-medium">援먯떆</th>
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

                            // ?ㅻ뒛 ?좎쭨?몄? ?뺤씤
                            const today = new Date();
                            const todayStr = toDateString(today);
                            const isToday = todayStr === currentDate;
                            const isPast = currentDate < todayStr;

                            // ?대떦 ?좎쭨? 援먯떆???섑뻾?됯?媛 ?덈뒗吏 ?뺤씤
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

                            // 諛곌꼍??寃곗젙: ?섑뻾?됯?媛 ?덉쑝硫??뚮???怨쇨굅???뚯깋), ?녾퀬 ?ㅻ뒛?대㈃ ?고븳 遺됱??? 洹??몃뒗 湲곕낯
                            const bgColor = cellAssessments.length > 0
                              ? (isPast ? "bg-gray-200 border-gray-300" : "bg-blue-100 border-blue-300")
                              : isToday
                                ? "bg-red-50 hover:bg-red-100"
                                : "bg-yellow-50 hover:bg-yellow-100";

                            // 怨쇨굅 ?좎쭨 ?ㅽ???                            const pastStyle = isPast ? "opacity-70 bg-gray-50 text-gray-400" : "";

                            // ?좏깮??? ?ㅽ???                            const isSelected = selectedCell?.weekday === weekdayIdx && selectedCell?.classTime === classTime;
                            const selectionStyle = isSelected ? "ring-2 ring-blue-500 ring-inset z-10" : "";

                            // 鍮덇탳??怨듦컯 ?뺤씤 (?쒓컖???④낵 ?놁쓬, ?대┃留?留됱쓬)
                            const isSubjectDisabled = item && ["鍮덇탳??, "怨듦컯", "李쎌껜", "?먯뒿", "?숈븘由?, "?먯떖?쒓컙", "Empty", "Free"].some(ex => item.subject.trim().includes(ex));

                            const group = computedGroups[`${weekdayIdx}-${classTime}`];
                            const electiveSelection = currentProfile?.electives?.[group];
                            let displaySubject = item ? item.subject : "-";
                            let displayTeacher = item ? item.teacher : "";

                            let isElectiveActive = false;
                            let isCancelledByFreePeriod = false;
                            let displayClassName = ""; // 諛?諛섏씠由? ?쒖떆??                            if (group && electiveSelection) {
                              displaySubject = electiveSelection.fullSubjectName || electiveSelection.subject;
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

                              // ?좏깮怨쇰ぉ???녾퀬 鍮덇탳??怨듦컯留??덉쑝硫?痍⑥냼???쒖떆
                              const FREE_KEYWORDS = ["鍮덇탳??, "怨듦컯", "Empty", "Free"];
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

                              // 諛?className): electiveConfigs?먯꽌 group+subject濡?議고쉶
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
                                      toast.error(`${item.subject}?(?? ?좏깮?????놁뒿?덈떎.`);
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
                                    {group}<span className="hidden md:inline">洹몃９</span>
                                  </div>
                                )}
                                {item || isElectiveActive ? (
                                  <div className="flex flex-col items-center justify-center h-full min-h-0">
                                    <div
                                      className={`font-bold leading-tight w-full px-1 ${isPast ? "text-gray-400" : "text-gray-900"}`}
                                      style={{
                                        fontSize: displaySubject.length > 6 ? '9px' : displaySubject.length > 4 ? '11px' : undefined,
                                        wordBreak: displaySubject.length > 6 ? 'keep-all' : undefined,
                                      }}
                                    >
                                      <span className={displaySubject.length <= 4 ? "text-sm md:text-base" : ""}>
                                        {isCancelledByFreePeriod ? (
                                          <span>
                                            <span className="line-through opacity-60">{displaySubject}</span>
                                            <span className={`ml-1 text-xs font-normal ${isPast ? "text-gray-400" : "text-blue-500"}`}>(怨듦컯)</span>
                                          </span>
                                        ) : displaySubject}
                                      </span>
                                    </div>
                                    <div className="text-[10px] md:text-xs text-gray-500 mt-0.5 truncate w-full px-1">
                                      {displayClassName
                                        ? <>{displayClassName}{displayTeacher ? <span className="ml-1 opacity-60">{displayTeacher}</span> : null}</>
                                        : displayTeacher}
                                    </div>
                                    {cellAssessments.length > 0 && (
                                      <div className="mt-0.5 flex-shrink-0">
                                        <div className="flex flex-wrap gap-0.5 justify-center">
                                          {cellAssessments.map(a => (
                                            <span key={a.id} className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded-full leading-none whitespace-nowrap ${isPast ? "bg-gray-400 text-white" : "bg-blue-600 text-white"}`}>
                                              {a.description && a.description.includes("李?) ? a.description : '?됯?'}
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
            </CardContent>
          </Card>
        )}
      </div>

      {/* 異쒕젰 ?듭뀡 ?ㅼ씠?쇰줈洹?*/}
      <Dialog open={showPrintOptions} onOpenChange={setShowPrintOptions}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>異쒕젰 諛?????ㅼ젙</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">?섑뻾?됯? ?ы븿</label>
                <p className="text-xs text-gray-400">?쒓컙?쒖뿉 ?깅줉???섑뻾?됯?瑜??④퍡 ?쒖떆?⑸땲??</p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                checked={includeAssessments}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeAssessments(e.target.checked)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handleDownloadPng} className="bg-blue-600 hover:bg-blue-700 text-white">
                <ImageIcon className="w-4 h-4 mr-2" />
                PNG ???              </Button>
              <Button onClick={handlePrint} className="bg-green-600 hover:bg-green-700 text-white">
                <Printer className="w-4 h-4 mr-2" />
                ?몄뇙?섍린
              </Button>
            </div>
            <p className="text-[10px] text-center text-gray-400">* ?몄뇙 ??20cm 횞 20cm ?뺤궗媛곹삎?쇰줈 理쒖쟻?붾맗?덈떎.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ?섑뻾?됯? 異붽? ?ㅼ씠?쇰줈洹?*/}
      <Dialog open={showAddDialog} onOpenChange={(open: boolean) => {
        setShowAddDialog(open);
        if (!open) setSelectedCell(null);
      }
      }>
        <DialogContent className="sm:max-w-[500px]" aria-describedby="add-assessment-description">
          <DialogHeader>
            <DialogTitle>?섑뻾?됯? 異붽?</DialogTitle>
            <p id="add-assessment-description" className="text-sm text-gray-500 mt-1">
              ?좏깮??怨쇰ぉ???섑뻾?됯?瑜?異붽??⑸땲??            </p>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">?좎쭨</label>
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
                <label className="block text-sm font-medium mb-1">李⑥닔</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.round}
                  onChange={(e) => setFormData({ ...formData, round: e.target.value })}
                  required
                >
                  {[1, 2, 3, 4].map((r) => (
                    <option key={r} value={r.toString()}>{r}李?/option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                怨쇰ぉ
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
                援먯떆
              </label>
              <Input
                value={formData.classTime ? `${formData.classTime}援먯떆` : ""}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">?댁슜</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="?섑뻾?됯? ?댁슜 ?낅젰"
                required
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowAddDialog(false);
                setSelectedCell(null);
              }} className="flex-1">
                痍⑥냼
              </Button>
              <Button type="submit" className="flex-1">
                <Plus className="mr-2 h-4 w-4" />
                異붽??섍린
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog >

      {/* ?섑뻾?됯? ?섏젙 ?ㅼ씠?쇰줈洹?*/}
      < Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) setSelectedCell(null);
      }}>
        <DialogContent className="sm:max-w-[500px]" aria-describedby="edit-assessment-description">
          <DialogHeader>
            <DialogTitle>?섑뻾?됯? ?섏젙</DialogTitle>
            <p id="edit-assessment-description" className="text-sm text-gray-500 mt-1">
              ?섑뻾?됯? ?뺣낫瑜??섏젙?⑸땲??            </p>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">?좎쭨</label>
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
                <label className="block text-sm font-medium mb-1">李⑥닔</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.round}
                  onChange={(e) => setFormData({ ...formData, round: e.target.value })}
                  required
                >
                  {[1, 2, 3, 4].map((r) => (
                    <option key={r} value={r.toString()}>{r}李?/option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                怨쇰ぉ
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
                援먯떆
              </label>
              <Input
                value={formData.classTime ? `${formData.classTime}援먯떆` : ""}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">?댁슜</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="?섑뻾?됯? ?댁슜 ?낅젰"
                required
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowEditDialog(false);
                setSelectedCell(null);
              }} className="flex-1">
                痍⑥냼
              </Button>
              <Button type="submit" className="flex-1">
                ?섏젙?섍린
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog >

      {/* ?섑뻾?됯? ?뺣낫 ?ㅼ씠?쇰줈洹?*/}
      < Dialog open={showViewDialog} onOpenChange={(open) => {
        setShowViewDialog(open);
        if (!open) setSelectedCell(null);
      }}>
        <DialogContent className="sm:max-w-[500px]" aria-describedby="view-assessment-description">
          <DialogHeader>
            <DialogTitle>?섑뻾?됯? ?뺣낫</DialogTitle>
            <p id="view-assessment-description" className="text-sm text-gray-500 mt-1">
              ??援먯떆???깅줉???섑뻾?됯? 紐⑸줉?낅땲??            </p>
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
                        {assessment.classTime}援먯떆
                      </span>
                    )}
                  </div>
                  {/* 怨쇨굅 ?좎쭨媛 ?꾨땺 ?뚮쭔 ?섏젙/??젣 踰꾪듉 ?쒖떆 */}
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
              ?リ린
            </Button>
          </div>
        </DialogContent>
      </Dialog >

      {/* ?섑뻾?됯? 紐⑸줉 */}
      < Card className="mt-8" >
        <CardHeader>
          <CardTitle>{weekOffset === 0 ? "?대쾲 二? : weekOffset === 1 ? "?ㅼ쓬 二? : `${weekOffset}二???} ?섑뻾?됯? ({weekRangeText})</CardTitle>
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
                          <span>{assessment.classTime}援먯떆</span>
                        </div>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="col-span-full text-center py-12 text-gray-500">
                ?대쾲 二??깅줉???섑뻾?됯?媛 ?놁뒿?덈떎.
                <br />
                <span className="text-sm">?쒓컙?쒖뿉??怨쇰ぉ???대┃?섏뿬 異붽??섏꽭??</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="mt-2 flex justify-end">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600 hover:bg-transparent text-xs font-normal h-auto p-0">
            愿由ъ궗臾댁냼
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
                ?쒖쓽 移몄쓣 ?대┃?댁꽌 ?섑뻾?됯?瑜?異붽??섏떗??              </p>
              <Button
                size="lg"
                className="bg-orange-500 hover:bg-orange-600 text-white border-none w-full text-lg md:text-xl py-3 md:py-4 font-['Gungsuh',_serif]"
                onClick={() => setConfig({ instructionDismissedV2: true })}
              >
                ?댄빐??              </Button>
            </div>
          </div>
        )
      }
      {/* ?좏깮怨쇰ぉ ?좏깮 ?ㅼ씠?쇰줈洹?*/}
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
