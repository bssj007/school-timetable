
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useMemo } from "react";
import { Loader2, Trash2, Plus, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useUserConfig } from "@/contexts/UserConfigContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// 날짜를 YYYY-MM-DD 형식으로 변환
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
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
  const { schoolName, grade, classNum, isConfigured, setConfig } = useUserConfig();

  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const [selectedCell, setSelectedCell] = useState<{ weekday: number, classTime: number } | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewingAssessments, setViewingAssessments] = useState<AssessmentItem[]>([]);

  const [formData, setFormData] = useState({
    assessmentDate: "",
    subject: "",
    content: "",
    classTime: "",
    round: "1",
  });

  // 시간표 셀 클릭 핸들러
  const handleCellClick = (
    weekdayIdx: number,
    classTime: number,
    subject: string,
    date: Date,
    cellAssessments: AssessmentItem[]
  ) => {
    setSelectedCell({ weekday: weekdayIdx, classTime });

    if (cellAssessments.length > 0) {
      // 수행평가가 있으면 정보 다이얼로그 표시
      setViewingAssessments(cellAssessments);
      setShowViewDialog(true);
    } else {
      // 수행평가가 없으면 추가 다이얼로그 표시
      setFormData({
        assessmentDate: toDateString(date),
        subject: subject,
        content: "",
        classTime: classTime.toString(),
        round: "1",
      });
      setShowAddDialog(true);
    }
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
  });

  // 현재 주에 해당하는 수행평가만 필터링
  const assessments = useMemo(() => {
    if (!allAssessments) return [];
    const filtered = allAssessments.filter(a => isDateInWeek(a.dueDate, weekDates));
    console.log('[Assessments Filter]', {
      weekRange: `${toDateString(weekDates[0])} ~ ${toDateString(weekDates[4])}`,
      totalAssessments: allAssessments.length,
      filteredAssessments: filtered.length,
      filtered: filtered.map(a => ({ subject: a.subject, date: a.dueDate, classTime: a.classTime }))
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
      if (!res.ok) throw new Error('Failed to create');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success("수행평가가 등록되었습니다");
    },
    onError: () => toast.error("등록 실패")
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
    }
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            {schoolName || '학교'} {grade || '?'}-{classNum || '?'} 시간표
          </h1>
          <p className="text-gray-600">시간표와 수행평가를 한눈에 확인하세요</p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={grade || ""} onValueChange={(val) => setConfig({ grade: val })}>
            <SelectTrigger className="w-[80px]">
              <SelectValue placeholder="학년" />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((g) => (
                <SelectItem key={g} value={g.toString()}>{g}학년</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={classNum || ""} onValueChange={(val) => setConfig({ classNum: val })}>
            <SelectTrigger className="w-[80px]">
              <SelectValue placeholder="반" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((c) => (
                <SelectItem key={c} value={c.toString()}>{c}반</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={() => fetchFromComcigan.mutate()}
            disabled={fetchFromComcigan.isPending || !schoolName}
            variant="outline"
            size="sm"
          >
            {fetchFromComcigan.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            시간표 불러오기
          </Button>

          <Button
            onClick={() => window.location.href = '/api/kakao/login'}
            variant="default"
            size="sm"
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-900"
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C6.48 3 2 6.93 2 11.75c0 3.14 2.13 5.88 5.28 7.24-.22 1.02-.89 3.61-.92 3.87 0 .03-.03.17.09.23.12.07.29.04.29.04.39-.07 4.54-3.04 5.26-3.61 12 .38 12 .38 12-7.77 12-11.75C22 6.93 17.52 3 12 3z" />
            </svg>
            카카오 알림 연동
          </Button>
        </div>
      </div>

      <div>
        {/* 시간표 */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span>주간 시간표</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-normal text-gray-600 min-w-[100px] text-center">
                      {weekRangeText}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-50 w-16">교시</th>
                      {weekdayNames.map((day, idx) => (
                        <th key={day} className="border p-2 bg-gray-50">
                          <div>{day}</div>
                          <div className="text-xs text-gray-500 font-normal">
                            {formatDate(weekDates[idx])}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 7 }, (_, i) => i + 1).map((classTime) => (
                      <tr key={classTime}>
                        <td className="border p-2 text-center font-medium bg-gray-50">
                          {classTime}
                        </td>
                        {Array.from({ length: 5 }, (_, weekdayIdx) => {
                          const dayItems = timetableByDay[weekdayIdx] || [];
                          const item = dayItems.find((t) => t.classTime === classTime);
                          const currentDate = toDateString(weekDates[weekdayIdx]);

                          // 해당 날짜와 교시에 수행평가가 있는지 확인
                          const cellAssessments = assessments ? assessments.filter(a => {
                            const match = item &&
                              a.subject === item.subject &&
                              a.dueDate === currentDate &&
                              a.classTime === classTime &&
                              !a.isDone;

                            // 디버깅 로그
                            if (item && a.dueDate === currentDate) {
                              console.log('[Cell Match Debug]', {
                                currentDate,
                                classTime,
                                itemSubject: item.subject,
                                aSubject: a.subject,
                                aDueDate: a.dueDate,
                                aClassTime: a.classTime,
                                match
                              });
                            }

                            return match;
                          }) : [];

                          return (
                            <td
                              key={weekdayIdx}
                              onClick={() => item && handleCellClick(weekdayIdx, classTime, item.subject, weekDates[weekdayIdx], cellAssessments)}
                              className={`border p-2 text-center h-24 relative transition-colors cursor-pointer
                                ${cellAssessments.length > 0 ? "bg-blue-100 border-blue-300" : "hover:bg-gray-100"}
                                ${item ? "" : "cursor-default"}
                              `}
                            >
                              {item ? (
                                <div>
                                  <div className="font-bold text-gray-900">{item.subject}</div>
                                  <div className="text-xs text-gray-500 mt-1">{item.teacher}</div>
                                  {cellAssessments.length > 0 && (
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-blue-700">
                                        📝 수행평가!
                                      </div>
                                      <div className="flex flex-wrap gap-1 justify-center mt-1">
                                        {cellAssessments.map(a => (
                                          <span key={a.id} className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                                            {a.description || '평가'}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
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
          </Card>
        </div>

        {/* 수행평가 추가 다이얼로그 */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
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
                    onChange={(e) => setFormData({ ...formData, assessmentDate: e.target.value })}
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
                  className="bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  교시
                </label>
                <Input
                  value={formData.classTime ? `${formData.classTime}교시` : ""}
                  readOnly
                  className="bg-gray-100"
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
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="flex-1">
                  취소
                </Button>
                <Button type="submit" className="flex-1">
                  <Plus className="mr-2 h-4 w-4" />
                  추가하기
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* 수행평가 정보 다이얼로그 */}
        <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
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
                  <p className="text-gray-700 mb-2">{assessment.title}</p>
                  <div className="text-xs text-gray-500">
                    {assessment.dueDate}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowViewDialog(false)}>
                닫기
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 수행평가 목록 */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>이번 주 수행평가 ({weekRangeText})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assessments && assessments.length > 0 ? (
                assessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    className="flex flex-col p-4 border rounded-lg hover:shadow-md transition-shadow bg-white"
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
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                        onClick={() => handleDelete(assessment.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-gray-700 mb-2">{assessment.title}</p>
                    <div className="flex items-center gap-2 mt-auto">
                      {assessment.classTime && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                          {assessment.classTime}교시
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {assessment.dueDate}
                      </span>
                    </div>
                  </div>
                ))
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
      </div>
    </div>
  );
}
