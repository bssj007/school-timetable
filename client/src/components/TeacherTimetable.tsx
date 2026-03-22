import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TeacherTimetableResponse {
  success: boolean;
  teachers: string[];
  subjects: string[];
  timetable: any[];
}

export default function TeacherTimetable() {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("1");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<TeacherTimetableResponse>({
    queryKey: ['teacher-timetable'],
    queryFn: async () => {
      const res = await fetch('/api/comcigan?type=teacher_timetable');
      if (!res.ok) throw new Error("Failed to fetch teacher timetable");
      return res.json();
    },
    // Don't auto-refetch, but consider it somewhat fresh to avoid spamming
    staleTime: 5 * 60 * 1000, 
  });

  const decodeCell = (val: number) => {
    if (!val || val === 0) return null;
    
    // Decoding formula: (Subject * 1000) + (Grade * 100) + Class
    const classNum = val % 100;
    const grade = Math.floor(val / 100) % 10;
    const subjectId = Math.floor(val / 1000);
    
    const subjectName = data?.subjects?.[subjectId] || "알 수 없음";
    
    return { classNum, grade, subjectName };
  };

  const weekdays = ['월', '화', '수', '목', '금'];
  
  // Teachers array starts with '*' typically at index 0, so valid teachers start at 1
  const tId = parseInt(selectedTeacherId, 10);
  const selectedSchedule = data?.timetable?.[tId]; // Array of 6 (index 0=unknown, 1..5 for Mon..Fri)

  // Find max periods for this teacher (usually 7 for high school, but checking dynamically)
  let maxPeriods = 7;
  if (selectedSchedule) {
    for (let d = 1; d <= 5; d++) {
      if (selectedSchedule[d] && selectedSchedule[d].length - 1 > maxPeriods) {
        maxPeriods = selectedSchedule[d].length - 1;
      }
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xl">교사용 시간표 (실시간)</CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => refetch()} 
            disabled={isFetching}
            title="컴시간알리미에서 최신 데이터 다시 불러오기"
            className="h-8 w-8 text-gray-500 hover:text-blue-600"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {data && (
          <div className="w-full sm:w-64">
            <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
              <SelectTrigger className="w-full bg-white">
                <SelectValue placeholder="교사 선택" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {data.teachers.map((name, idx) => {
                  if (idx === 0) return null; // Skip index 0 '*'
                  return (
                    <SelectItem key={idx} value={idx.toString()}>
                      {name} 선생님
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[40px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : isError ? (
          <div className="text-center py-10 text-red-500 bg-red-50 rounded-lg">
            컴시간알리미 서버에서 데이터를 불러오는데 실패했습니다.
          </div>
        ) : data && selectedSchedule ? (
           <div className="overflow-x-auto w-full pb-6 print:overflow-visible">
            <table className="w-full min-w-[600px] border-collapse bg-white table-fixed">
              <thead>
                <tr>
                  <th className="w-16 h-12 border bg-gray-50/80 text-gray-400 font-medium text-sm">교시</th>
                  {weekdays.map((day) => (
                    <th key={day} className="h-12 border bg-gray-50 text-gray-700 font-bold text-base w-[calc((100%-4rem)/5)]">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: maxPeriods }).map((_, periodIndex) => {
                  const p = periodIndex + 1;
                  return (
                    <tr key={p} className="hover:bg-gray-50/50 transition-colors">
                      <td className="w-16 h-20 border text-center font-bold text-gray-400">
                        {p}
                      </td>
                      {weekdays.map((_, dayIndex) => {
                        const d = dayIndex + 1; // 1 to 5
                        const val = selectedSchedule[d]?.[p];
                        const cellData = decodeCell(val);
                        
                        return (
                          <td key={d} className={`border p-2 min-h-20 break-words align-top ${cellData ? 'bg-blue-50/30' : ''}`}>
                            {cellData ? (
                              <div className="flex flex-col items-center justify-center h-full gap-1 p-1">
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium text-center">
                                  {cellData.grade}학년 {cellData.classNum}반
                                </span>
                                <span className="font-bold text-[15px] text-blue-700 text-center tracking-tight leading-tight">
                                  {cellData.subjectName}
                                </span>
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
  );
}
