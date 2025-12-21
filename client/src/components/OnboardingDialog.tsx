import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/contexts/UserConfigContext";

export default function OnboardingDialog() {
    const { isConfigured, setConfig } = useUserConfig();
    const [formData, setFormData] = useState({ grade: "", classNum: "" });

    const isOpen = !isConfigured;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.grade && formData.classNum) {
            setConfig({
                schoolName: "부산성지고등학교",
                grade: formData.grade,
                classNum: formData.classNum
            });
        }
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>학년/반 설정</DialogTitle>
                    <DialogDescription>
                        부산성지고등학교 시간표를 확인하기 위해 학년과 반을 설정해주세요.
                        <br />
                        이 정보는 브라우저에 저장되어 다음 방문 시 유지됩니다.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
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
                    <Button type="submit" className="w-full">
                        설정 저장
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
