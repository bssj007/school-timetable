
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
  const { schoolName, grade, classNum, isConfigured, setConfig, kakaoUser } = useUserConfig();

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
    const todayStr = toDateString(new Date());
    const cellDateStr = toDateString(date);
    const isPast = cellDateStr < todayStr;

    setSelectedCell({ weekday: weekdayIdx, classTime });

    if (cellAssessments.length > 0) {
      // 수행평가가 있으면 정보 다이얼로그 표시 (과거 내역도 조회는 가능)
      setViewingAssessments(cellAssessments);
      setShowViewDialog(true);
    } else {
      // 과거 날짜는 추가 불가
      if (isPast) {
        toast.error("지나간 날짜에는 수행평가를 추가할 수 없습니다.");
        return;
      }

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

  // ... (lines 128-447)

  // 오늘 날짜인지 확인
  const today = new Date();
  const todayStr = toDateString(today);
  const isToday = todayStr === currentDate;
  const isPast = currentDate < todayStr;

  // 해당 날짜와 교시에 수행평가가 있는지 확인
  const cellAssessments = assessments ? assessments.filter(a => {
    return item &&
      a.subject === item.subject &&
      a.dueDate === currentDate &&
      a.classTime === classTime &&
      !a.isDone;
  }) : [];

  // 배경색 결정: 수행평가가 있으면 파란색, 없고 오늘이면 연한 붉은색, 그 외는 기본
  const bgColor = cellAssessments.length > 0
    ? "bg-blue-100 border-blue-300"
    : isToday
      ? "bg-red-50 hover:bg-red-100"
      : "hover:bg-gray-100";

  // 과거 날짜 스타일
  const pastStyle = isPast ? "opacity-40 bg-gray-50 text-gray-400" : "";

  return (
    <td
      key={weekdayIdx}
      onClick={() => item && handleCellClick(weekdayIdx, classTime, item.subject, weekDates[weekdayIdx], cellAssessments)}
      className={`border p-1 md:p-2 text-center h-16 md:h-20 relative transition-colors cursor-pointer overflow-hidden
                                ${bgColor} ${pastStyle}
                                ${item ? "" : "cursor-default"}
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
                  <span key={a.id} className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded-full leading-none whitespace-nowrap ${isPast ? "bg-gray-300 text-gray-600" : "bg-blue-600 text-white"}`}>
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

  // ... (lines 497-613)

                      </div >
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
    {/* 과거 날짜가 아닐 때만 삭제 버튼 표시 */
      assessment.dueDate >= toDateString(new Date()) && (
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
      )
    }
  </div>

{/* 수행평가 목록 */ }
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
      </div >
    </div >
  );
}
