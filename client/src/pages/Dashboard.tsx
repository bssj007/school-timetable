
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Route, Switch, useLocation, Link } from "wouter";
import { Loader2, Trash2, Plus, Download, ChevronLeft, ChevronRight, Pencil, LogOut, ArrowUp } from "lucide-react";
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

// 타입 정의
interface TimetableItem {
  weekday: number;
  classTime: number;
  subject: string;
  teacher: string;
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

  // 2, 3학년 선택과목 설정 확인
  useEffect(() => {
    if ((grade === "2" || grade === "3") && classNum && studentNumber) {
      // Check if electives are already set
      fetch(`/api/electives?type=student&grade=${grade}&classNum=${classNum}&studentNumber=${studentNumber}`)
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
  }, [grade, classNum, studentNumber]);

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
  const { data: timetableData, isLoading: timetableLoading, refetch: refetchTimetable } = useQuery({
    queryKey: ['timetable', schoolName, grade, classNum],
    queryFn: async () => {
      if (!grade || !classNum) return [];
      try {
        const response = await fetch(`/api/comcigan?type=timetable&grade=${grade}&classNum=${classNum}`);
        if (!response.ok) {
          console.warn('Failed to fetch from Comcigan, returning empty');
          return [];
        }
        const result = await response.json();
        console.log('[Dashboard] Timetable data:', result);

        if (result.data && Array.isArray(result.data)) {
          return result.data.map((item: any) => ({
            ...item,
            weekday: item.weekday - 1
          })) as TimetableItem[];
        }
        return [] as TimetableItem[];
      } catch (e) {
        console.error('Failed to fetch timetable', e);
        return [] as TimetableItem[];
      }
    },
    enabled: !!grade && !!classNum && !!schoolName,
    retry: true, // 무한 재시도
    retryDelay: 3000, // 3초 간격
  });

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
        return [] as AssessmentItem[];
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

  // 5. 설정 조회 (Public)
  const { data: settings } = useQuery({
    queryKey: ['publicSettings'],
    queryFn: async () => {
      const res = await fetch('/api/settings/public');
      if (!res.ok) return { hide_past_assessments: false };
      return res.json();
    }
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

  const isLoading = timetableLoading || assessmentLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin mr-2" />
        로드 중...
      </div>
    );
  }

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
            <span className="text-blue-600">수행 일정공유</span>
          </Link>

        </div>

        <div className="flex items-center gap-2">
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
              className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 h-9 rounded-full px-4 font-bold text-xs"
              onClick={() => window.location.href = '/api/kakao/login'}
            >
              <img src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png" alt="Kakao" className="h-4 w-4 mr-2" />
              카카오 연동
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-row justify-between items-center gap-2 md:gap-4 mb-6 md:hidden">
        <div>
          <h1 className="text-xl md:text-3xl font-bold whitespace-nowrap">
            {grade || '?'}-{classNum || '?'} 시간표
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="flex items-center gap-[6px] md:gap-2">
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

          {kakaoUser && (
            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-md border border-green-100 h-10 text-sm ml-auto md:ml-0">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              카카오 알림 활성
            </div>
          )}
        </div>
      </div>

      {/* Desktop Header (Outside Card) */}


      <div>
        {/* 시간표 Card */}
        <div>
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
                      variant={isElectiveMissing ? "default" : "ghost"}
                      size="sm"
                      className={`font-bold text-sm px-3 h-10 transition-all duration-300 ${isElectiveMissing ? "bg-[#fc6603] hover:bg-[#e05a00] text-white animate-pulse" : "text-[#fc6603]"}`}
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
                  {weekOffset === 0 ? "이번 주" : weekOffset === 1 ? "다음 주" : `${weekOffset}주 후`}
                </span>
                {kakaoUser && (
                  <div className="md:hidden flex items-center justify-center gap-2 bg-green-50 text-green-700 px-3 py-1 mt-2 rounded-md border border-green-100 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-semibold">{kakaoUser.nickname}</span>
                  </div>
                )}
              </div>

              {/* Desktop Selectors */}
              <div className="hidden md:flex items-center gap-2 flex-1 justify-end min-w-0">
                <Select
                  value={grade}
                  onValueChange={(val) => setConfig({ grade: val, classNum, studentNumber })}
                >
                  <SelectTrigger className="w-[100px] shrink min-w-[50px] md:max-w-[100px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium [&>span]:relative [&>span]:z-10" style={selectorStyle}>
                    <SelectValue placeholder="학년" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1학년</SelectItem>
                    <SelectItem value="2">2학년</SelectItem>
                    <SelectItem value="3">3학년</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={classNum}
                  onValueChange={(val) => setConfig({ grade, classNum: val, studentNumber })}
                >
                  <SelectTrigger className="w-[90px] shrink min-w-[50px] md:max-w-[90px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium [&>span]:relative [&>span]:z-10" style={selectorStyle}>
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

                <Select
                  value={studentNumber}
                  onValueChange={(val) => setConfig({ grade, classNum, studentNumber: val })}
                >
                  <SelectTrigger className="w-[90px] shrink min-w-[50px] md:max-w-[90px] h-10 bg-white px-2 md:px-3 text-base md:text-lg font-medium [&>span]:relative [&>span]:z-10" style={selectorStyle}>
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
            </CardHeader>
            <CardContent className="px-1 pb-1 md:px-2 md:pb-2">
              <div className="overflow-x-auto relative">
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
                <table className={`w-full border-collapse table-fixed transition-all duration-300 ${isElectiveMissingImmediate ? "blur-[3px] opacity-60 pointer-events-none select-none" : ""}`}>
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
                            return item &&
                              a.subject.trim() === item.subject.trim() &&
                              a.dueDate === currentDate &&
                              a.classTime === classTime &&
                              !a.isDone;
                          }) : [];

                          // 배경색 결정: 수행평가가 있으면 파란색(과거는 회색), 없고 오늘이면 연한 붉은색, 그 외는 기본
                          const bgColor = cellAssessments.length > 0
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

                          return (
                            <td
                              key={weekdayIdx}
                              id={`cell-${weekdayIdx}-${classTime}`}
                              onClick={() => {
                                if (item) {
                                  if (isSubjectDisabled) {
                                    toast.error(`${item.subject}은(는) 선택할 수 없습니다.`);
                                    return;
                                  }
                                  if (!isPast || cellAssessments.length > 0) {
                                    handleCellClick(weekdayIdx, classTime, item.subject, weekDates[weekdayIdx], cellAssessments);
                                  }
                                }
                              }}
                              className={`border p-1 md:p-2 text-center h-16 md:h-20 relative transition-colors overflow-hidden
                                ${bgColor} ${pastStyle} ${selectionStyle}
                                ${item && (!isPast || cellAssessments.length > 0) ? "cursor-pointer" : "cursor-default"}
                              `}
                            >
                              {item ? (
                                <div className="flex flex-col items-center justify-center h-full min-h-0">
                                  <div className={`font-bold text-sm md:text-base leading-tight truncate w-full ${isPast ? "text-gray-400" : "text-gray-900"}`}>{item.subject}</div>
                                  <div className="text-[10px] md:text-xs text-gray-500 mt-0.5 truncate w-full">{item.teacher}</div>
                                  {cellAssessments.length > 0 && (
                                    <div className="mt-0.5 flex-shrink-0">
                                      <div className="flex flex-wrap gap-0.5 justify-center">
                                        {cellAssessments.map(a => (
                                          <span key={a.id} className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded-full leading-none whitespace-nowrap ${isPast ? "bg-gray-400 text-white" : "bg-blue-600 text-white"}`}>
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
            </CardContent>
          </Card >
        </div >

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
        </Card >
      </div >


      <div className="mt-2 flex justify-end">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600 hover:bg-transparent text-xs font-normal h-auto p-0">
            관리사무소
          </Button>
        </Link>
      </div>

      {/* Instruction Notification */}
      {showInstructionTooltip && !useUserConfig().instructionDismissedV2 && (
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
      )}
      {/* 선택과목 선택 다이얼로그 */}
      <ElectiveSelectionDialog
        isOpen={showElectiveDialog}
        grade={grade}
        classNum={classNum}
        studentNumber={studentNumber}
        onSaveSuccess={() => {
          setShowElectiveDialog(false);
          setIsElectiveEntered(true);
        }}
        onBack={() => {
          setShowElectiveDialog(false);
        }}
      />
    </div >
  );
}
