import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

interface SchoolSearchResult {
    code: number;
    region: string;
    name: string;
}

export default function OnboardingDialog() {
    const { isConfigured, setConfig } = useUserConfig();
    const [step, setStep] = useState<'school' | 'class'>('school');
    const [schoolKeyword, setSchoolKeyword] = useState("");
    const [selectedSchool, setSelectedSchool] = useState<SchoolSearchResult | null>(null);
    const [formData, setFormData] = useState({ grade: "", classNum: "" });

    // 학교 검색
    const { data: schools, isLoading: searchingSchools, refetch } = useQuery({
        queryKey: ['searchSchools', schoolKeyword],
        queryFn: async () => {
            if (!schoolKeyword || schoolKeyword.length < 2) return [];
            const res = await fetch(`/api/trpc/timetable.searchSchools?input=${encodeURIComponent(JSON.stringify({ schoolName: schoolKeyword }))}`);
            if (!res.ok) throw new Error('Failed to search schools');
            const data = await res.json();
            return data.result.data as SchoolSearchResult[];
        },
        enabled: false // 수동 refetch
    });

    const isOpen = !isConfigured;

    const handleSchoolSearch = () => {
        if (schoolKeyword.length >= 2) {
            refetch();
        }
    };

    const handleSchoolSelect = (school: SchoolSearchResult) => {
        setSelectedSchool(school);
        setStep('class');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedSchool && formData.grade && formData.classNum) {
            setConfig({
                schoolName: selectedSchool.name,
                grade: formData.grade,
                classNum: formData.classNum
            });
        }
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-[500px]" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>
                        {step === 'school' ? '학교 검색' : '학년/반 설정'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'school'
                            ? '재학 중인 학교를 검색하세요. 검색어를 입력하고 검색 버튼을 클릭하세요.'
                            : '시간표를 확인할 학년과 반을 설정해주세요.'}
                    </DialogDescription>
                </DialogHeader>

                {step === 'school' ? (
                    <div className="space-y-4 pt-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="학교 이름 입력 (예: 부산성지고등학교)"
                                value={schoolKeyword}
                                onChange={(e) => setSchoolKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSchoolSearch()}
                            />
                            <Button onClick={handleSchoolSearch} disabled={searchingSchools || schoolKeyword.length < 2}>
                                {searchingSchools ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            </Button>
                        </div>

                        {schools && schools.length > 0 && (
                            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                                {schools.map((school) => (
                                    <button
                                        key={school.code}
                                        onClick={() => handleSchoolSelect(school)}
                                        className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0 transition-colors"
                                    >
                                        <div className="font-medium">{school.name}</div>
                                        <div className="text-sm text-gray-500">{school.region}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {schools && schools.length === 0 && schoolKeyword.length >= 2 && !searchingSchools && (
                            <div className="text-center py-8 text-gray-500">
                                검색 결과가 없습니다.
                            </div>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500">선택한 학교</div>
                            <div className="font-medium">{selectedSchool?.name}</div>
                            <div className="text-sm text-gray-500">{selectedSchool?.region}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="grade" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    학년
                                </label>
                                <Input
                                    id="grade"
                                    type="number"
                                    min="1"
                                    max="3"
                                    placeholder="1"
                                    value={formData.grade}
                                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="classNum" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    반
                                </label>
                                <Input
                                    id="classNum"
                                    type="number"
                                    min="1"
                                    max="20"
                                    placeholder="1"
                                    value={formData.classNum}
                                    onChange={(e) => setFormData({ ...formData, classNum: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setStep('school');
                                    setSelectedSchool(null);
                                }}
                                className="flex-1"
                            >
                                이전
                            </Button>
                            <Button type="submit" className="flex-1">
                                시작하기
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
