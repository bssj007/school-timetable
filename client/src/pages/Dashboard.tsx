
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo } from "react";
import { Loader2, Trash2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  dueDate: string; // ISO string
  isDone: number;
  // UI 매핑용 (DB에는 없음)
  assessmentDate?: string;
  classTime?: string;
}

export default function Dashboard() {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    assessmentDate: "",
    subject: "",
    content: "",
    classTime: "",
    weekday: "",
  });

  const [timetableFormData, setTimetableFormData] = useState({
    schoolName: "성지고등학교",
    grade: "1",
    classNum: "1",
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFetchingTimetable, setIsFetchingTimetable] = useState(false);

  // 1. 시간표 조회 (로컬 스토리지 + API 캐시)
  const { data: timetableData, isLoading: timetableLoading, refetch: refetchTimetable } = useQuery({
    queryKey: ['timetable'],
    queryFn: async () => {
      // 로컬 스토리지 우선 확인
      const cached = localStorage.getItem('cached_timetable');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // API 응답 구조: { data: [...] }
          if (parsed.data && Array.isArray(parsed.data)) return parsed.data as TimetableItem[];
          if (Array.isArray(parsed)) return parsed as TimetableItem[];
        } catch (e) {
          console.error('Failed to parse cached timetable', e);
        }
      }
      return [] as TimetableItem[];
    }
  });

  // 2. 수행평가 목록 조회 (D1 API)
  const { data: assessments, isLoading: assessmentLoading } = useQuery({
    queryKey: ['assessments'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/assessment');
        if (!res.ok) {
          if (res.status === 404) return [];
          throw new Error(`API Error: ${res.status}`);
        }
        return await res.json() as AssessmentItem[];
      } catch (e) {
        console.warn('Failed to fetch assessments:', e);
        return [] as AssessmentItem[];
      }
    }
  });

  // 3. 수행평가 추가 (D1 API)
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.content, // content를 title로 사용
          subject: data.subject,
          description: "",
          dueDate: data.assessmentDate,
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

  // 4. 수행평가 삭제 (D1 API)
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

  // 시간표에서 고유한 과목 목록 추출 (창체, 채플 제외)
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
      await createMutation.mutateAsync({
        assessmentDate: formData.assessmentDate,
        subject: formData.subject,
        content: formData.content,
        classTime: formData.classTime ? parseInt(formData.classTime) : undefined,
        weekday: formData.weekday ? parseInt(formData.weekday) : undefined,
      });
      setFormData({
        assessmentDate: "",
        subject: "",
        content: "",
        classTime: "",
        weekday: "",
      });
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

  const handleFetchTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFetchingTimetable(true);
    try {
      toast.loading("시간표를 가져오는 중...");

      // Cloudflare Pages Functions 호출
      // 성지고 코드: 7530560
      const response = await fetch(`/api/comcigan?type=timetable&schoolCode=7530560&grade=${timetableFormData.grade}&classNum=${timetableFormData.classNum}`);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "시간표 가져오기 실패");
      }

      // 로컬 스토리지에 저장 (DB 대신)
      localStorage.setItem('cached_timetable', JSON.stringify(result));

      toast.dismiss();
      toast.success("시간표를 성공적으로 가져왔습니다!");

      // 시간표 데이터 새로고침
      await refetchTimetable();

      // 다이얼로그 닫기
      setIsDialogOpen(false);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : "시간표 가져오기 실패");
      console.error("시간표 가져오기 실패:", error);
    } finally {
      setIsFetchingTimetable(false);
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

  // 수행평가 데이터를 날짜 매핑 (UI 표시용 로직 개선 필요)
  // 여기서는 간단히 날짜가 일치하면 표시하도록 함
  // 실제로는 시간표와 매핑하려면 요일/교시 정보가 필요하지만, D1 스키마에는 날짜만 있음.
  // 따라서 캘린더나 목록 형태로 보여주는 것이 적절함.
  // 현재 UI 구조상 시간표 셀에 표시하려면 날짜 계산이 필요.
  // (일단 기존 로직 유지하되, 날짜가 있으면 표시)

  const assessmentMap: Record<string, AssessmentItem[]> = {};
  /*
    TODO: 날짜 -> 요일/교시 매핑 로직이 필요함.
    현재는 D1 스키마에 classTime이 없으므로, 정확한 시간표 셀에 매핑하기 어려움.
    따라서 시간표 셀에는 '과목'이 일치하면 표시하거나, 별도 목록으로 보여줘야 함.
    여기서는 '과목' 기준으로 매핑을 시도하거나, 날짜가 이번주에 해당하면 표시하는 로직 필요.
    
    일단 기존 로직(날짜 문자열 직접 비교)은 작동하지 않을 수 있음.
    임시로 과목명 매핑을 사용하거나, 별도 렌더링.
  */

  const isLoading = timetableLoading || assessmentLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin mr-2" />
        로드 중...
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">성지고 1-1 시간표</h1>
          <p className="text-gray-600">시간표와 수행평가를 한눈에 확인하세요</p>
        </div>

        {/* 시간표 업데이트 버튼 */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              시간표 업데이트
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>시간표 가져오기</DialogTitle>
              <DialogDescription>
                컴시간알리미에서 최신 시간표를 가져옵니다.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFetchTimetable} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">학교 이름</label>
                <Input
                  type="text"
                  value={timetableFormData.schoolName}
                  onChange={(e) =>
                    setTimetableFormData({ ...timetableFormData, schoolName: e.target.value })
                  }
                  placeholder="예: 성지고등학교"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">학년</label>
                  <Input
                    type="number"
                    min="1"
                    max="3"
                    value={timetableFormData.grade}
                    onChange={(e) =>
                      setTimetableFormData({ ...timetableFormData, grade: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">반</label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={timetableFormData.classNum}
                    onChange={(e) =>
                      setTimetableFormData({ ...timetableFormData, classNum: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isFetchingTimetable}
              >
                {isFetchingTimetable ? (
                  <>
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    가져오는 중...
                  </>
                ) : (
                  "시간표 가져오기"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 왼쪽: 시간표 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>주간 시간표</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-50 w-16">교시</th>
                      {weekdayNames.map((day) => (
                        <th key={day} className="border p-2 bg-gray-50">
                          {day}
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
                        {Array.from({ length: 5 }, (_, i) => i + 1).map((weekday) => {
                          const dayItems = timetableByDay[weekday] || [];
                          const item = dayItems.find((t) => t.classTime === classTime);

                          // 현재는 시간표 셀에 직접 수행평가를 표시하는 로직이 복잡하여
                          // 과목이 일치하는 수행평가가 있으면 표시하도록 함
                          const relatedAssessment = assessments && assessments.length > 0
                            ? assessments.find(a =>
                              item && a.subject === item.subject && !a.isDone
                            )
                            : null;

                          return (
                            <td
                              key={weekday}
                              className={`border p-2 text-center h-24 relative hover:bg-gray-50 transition-colors ${relatedAssessment ? "bg-blue-50/50" : ""
                                }`}
                            >
                              {item ? (
                                <div>
                                  <div className="font-bold text-gray-900">
                                    {item.subject}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {item.teacher}
                                  </div>
                                  {relatedAssessment && (
                                    <div className="mt-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full inline-block truncate max-w-full">
                                      평가 있음
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

        {/* 오른쪽: 수행평가 관리 */}
        <div>
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>수행평가 추가</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">날짜</label>
                  <Input
                    type="date"
                    value={formData.assessmentDate}
                    onChange={(e) =>
                      setFormData({ ...formData, assessmentDate: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">과목</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.subject}
                    onChange={(e) =>
                      setFormData({ ...formData, subject: e.target.value })
                    }
                    required
                  >
                    <option value="">과목 선택</option>
                    {uniqueSubjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">내용</label>
                  <Textarea
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="수행평가 내용 입력"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  추가하기
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>수행평가 목록</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assessments && assessments.length > 0 ? (
                  assessments.map((assessment) => (
                    <div
                      key={assessment.id}
                      className="flex items-start justify-between p-4 border rounded-lg hover:shadow-sm transition-shadow bg-white"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-lg text-gray-900">
                            {assessment.subject}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {assessment.dueDate}
                          </span>
                        </div>
                        <p className="text-gray-700">{assessment.title}</p>
                        {assessment.description && (
                          <p className="text-gray-500 text-sm mt-1">{assessment.description}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(assessment.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    등록된 수행평가가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
