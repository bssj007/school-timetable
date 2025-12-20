import { trpc } from "@/lib/trpc";
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


export default function Dashboard() {
  const { data: timetableData, isLoading: timetableLoading, refetch: refetchTimetable } = trpc.timetable.get.useQuery();
  const { data: assessments, isLoading: assessmentLoading } = trpc.assessment.list.useQuery();
  const createMutation = trpc.assessment.create.useMutation();
  const deleteMutation = trpc.assessment.delete.useMutation();
  const fetchTimetableMutation = trpc.timetable.fetchFromComcigan.useMutation();
  const utils = trpc.useUtils();

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


  // 시간표에서 고유한 과목 목록 추출 (창체, 채플 제외)
  const uniqueSubjects = useMemo(() => {
    if (!timetableData || !Array.isArray(timetableData)) return [];
    const subjects = new Set<string>();
    const excludedSubjects = ["창체", "채플"];

    timetableData.forEach((item: any) => {
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
      await utils.assessment.list.invalidate();
    } catch (error) {
      console.error("수행평가 생성 실패:", error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      console.log('handleDelete called with id:', id);
      const result = await deleteMutation.mutateAsync(id);
      console.log('Delete result:', result);
      await utils.assessment.list.invalidate();
      console.log('Invalidated assessment list');
    } catch (error) {
      console.error("수행평가 삭제 실패:", error);
    }
  };

  const handleFetchTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      toast.loading("시간표를 가져오는 중...");

      // Cloudflare Pages Functions 호출
      const response = await fetch(`/api/comcigan?type=timetable&schoolCode=${7530560}&grade=${timetableFormData.grade}&classNum=${timetableFormData.classNum}`);
      // 학교 검색 로직은 생략 (일단 성지고 코드 하드코딩 또는 추가 로직 필요)

      if (!response.ok) throw new Error("시간표 가져오기 실패");

      const result = await response.json();

      // 로컬 스토리지에 저장 (DB 대신)
      localStorage.setItem('cached_timetable', JSON.stringify(result));

      // 결과 처리 (기존 로직과 호환성 유지)
      // const result = await fetchTimetableMutation.mutateAsync({
      //   schoolName: timetableFormData.schoolName,
      //   grade: parseInt(timetableFormData.grade),
      //   classNum: parseInt(timetableFormData.classNum),
      // });

      toast.dismiss();
      toast.success(result.message || "시간표를 성공적으로 가져왔습니다!");

      // 시간표 데이터 새로고침
      await refetchTimetable();

      // 다이얼로그 닫기
      setIsDialogOpen(false);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : "시간표 가져오기 실패");
      console.error("시간표 가져오기 실패:", error);
    }
  };


  // 요일별로 시간표 데이터를 그룹화
  const weekdayNames = ["월", "화", "수", "목", "금"];
  const timetableByDay: Record<number, any[]> = {};

  if (timetableData && Array.isArray(timetableData)) {
    timetableData.forEach((item: any) => {
      if (!timetableByDay[item.weekday]) {
        timetableByDay[item.weekday] = [];
      }
      timetableByDay[item.weekday].push(item);
    });
  }

  // 수행평가 데이터를 날짜와 교시로 인덱싱
  const assessmentMap: Record<string, typeof assessments> = {};
  if (assessments) {
    assessments.forEach((assessment) => {
      const key = `${assessment.assessmentDate}-${assessment.classTime || ""}`;
      if (!assessmentMap[key]) {
        assessmentMap[key] = [];
      }
      assessmentMap[key].push(assessment);
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
                disabled={fetchTimetableMutation.isPending}
              >
                {fetchTimetableMutation.isPending ? (
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
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                      <th className="px-3 py-3 text-left font-bold text-gray-700 w-16">교시</th>
                      {weekdayNames.map((day) => (
                        <th key={day} className="px-3 py-3 text-center font-bold text-gray-700">
                          {day}요일
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 7].map((classTime) => (
                      <tr key={classTime} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-3 py-3 font-bold text-gray-700 bg-gray-50 text-center">
                          {classTime}
                        </td>
                        {weekdayNames.map((day, dayIndex) => {
                          const item = timetableByDay[dayIndex]?.find(
                            (t: any) => t.classTime === classTime
                          );
                          const assessmentKey = `${new Date().toISOString().split('T')[0]}-${classTime}`;
                          const dayAssessments = assessmentMap[assessmentKey] || [];

                          // 시간표의 과목과 수행평가 과목이 일치하는지 확인
                          const matchingAssessment = item && dayAssessments.find(
                            (a) => a.subject === item.subject
                          );
                          const hasAssessment = matchingAssessment !== undefined;

                          return (
                            <td
                              key={`${dayIndex}-${classTime}`}
                              className={`px-3 py-3 text-center border-r border-gray-200 ${hasAssessment ? "bg-blue-50" : ""
                                }`}
                            >
                              {item ? (
                                <div className="space-y-1">
                                  <div className={`font-bold ${hasAssessment ? "text-blue-700" : "text-gray-800"
                                    }`}>
                                    {item.subject}
                                  </div>
                                  {hasAssessment ? (
                                    <div className="text-xs text-blue-600">수행평가</div>
                                  ) : (
                                    <div className="text-xs text-gray-600">{item.teacher}</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-gray-300">-</div>
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

        {/* 오른쪽: 수행평가 추가 및 목록 */}
        <div className="space-y-4">
          {/* 수행평가 추가 폼 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-4 w-4" />
                수행평가 추가
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">날짜</label>
                  <Input
                    type="date"
                    value={formData.assessmentDate}
                    onChange={(e) =>
                      setFormData({ ...formData, assessmentDate: e.target.value })
                    }
                    required
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">과목</label>
                  <select
                    value={formData.subject}
                    onChange={(e) =>
                      setFormData({ ...formData, subject: e.target.value })
                    }
                    required
                    className="w-full px-2 py-2 border rounded-md text-sm"
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
                  <label className="block text-xs font-medium mb-1">내용</label>
                  <Textarea
                    placeholder="내용 입력"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    required
                    className="text-sm resize-none"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">교시</label>
                    <Input
                      type="number"
                      min="1"
                      max="8"
                      placeholder="1-8"
                      value={formData.classTime}
                      onChange={(e) =>
                        setFormData({ ...formData, classTime: e.target.value })
                      }
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">요일</label>
                    <select
                      value={formData.weekday}
                      onChange={(e) =>
                        setFormData({ ...formData, weekday: e.target.value })
                      }
                      className="w-full px-2 py-2 border rounded-md text-sm"
                    >
                      <option value="">선택</option>
                      <option value="0">월</option>
                      <option value="1">화</option>
                      <option value="2">수</option>
                      <option value="3">목</option>
                      <option value="4">금</option>
                    </select>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full text-sm"
                  disabled={createMutation.isPending}
                  size="sm"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin mr-1 h-3 w-3" />
                      추가 중...
                    </>
                  ) : (
                    "추가"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 수행평가 목록 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">수행평가 목록</CardTitle>
            </CardHeader>
            <CardContent>
              {assessments && assessments.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {assessments.map((assessment) => (
                    <div
                      key={assessment.id}
                      className="p-2 border rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-800 truncate">
                            {assessment.subject}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {assessment.assessmentDate}
                          </div>
                          <div className="text-xs text-gray-700 mt-1 line-clamp-2">
                            {assessment.content}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            console.log('Deleting assessment:', assessment.id);
                            handleDelete(assessment.id);
                          }}
                          disabled={deleteMutation.isPending}
                          className="h-6 w-6 p-0 flex-shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 text-sm py-4">
                  등록된 수행평가가 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
