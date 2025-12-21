import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserConfig } from "@/hooks/useUserConfig";

export default function OnboardingDialog() {
    const { isConfigured, setConfig } = useUserConfig();
    const [formData, setFormData] = useState({ grade: "", classNum: "" });

    // 이미 설정되어 있다면 렌더링하지 않음
    // (App.tsx에서 조건부 렌더링할 수도 있지만, 여기서 자체적으로 null 반환도 가능)
    // 다만 hook 상태가 업데이트될 때 깜빡임을 방지하기 위해 open prop을 제어

    const isOpen = !isConfigured;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.grade && formData.classNum) {
            setConfig(formData);
        }
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>학년/반 설정</DialogTitle>
                    <DialogDescription>
                        시간표와 수행평가를 확인하기 위해 학년과 반을 설정해주세요.
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
