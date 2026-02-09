
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TriangleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function FactoryReset() {
    const [, setLocation] = useLocation();
    const [confirmation, setConfirmation] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
    const [password, setPassword] = useState("");

    // Simple Admin Check (In a real app, use context or verify token, 
    // but here we just ask for password again or rely on session if we had one.
    // Given the design, we'll ask for the Admin Password again to be safe 
    // OR we can assume they passed it via state if we routed from Admin.
    // For safety, let's include a password field if we don't have a better way, 
    // OR just rely on the user knowing it since they are here.
    // Let's prompt for password to be ultra-safe.)

    const TARGET_PHRASE = "햇빛이 선명하게 나뭇잎을 핥고 있었다";

    const handleReset = async () => {
        if (confirmation !== TARGET_PHRASE) {
            toast.error("확인 문구가 일치하지 않습니다.");
            return;
        }

        if (!password) {
            toast.error("관리자 비밀번호를 입력해주세요.");
            return;
        }

        if (!confirm("정말로 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch("/api/admin/reset_db", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Admin-Password": password
                }
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Reset failed");
            }

            toast.success("초기화 완료. 메인 페이지로 이동합니다.");

            // Clear Cookies
            document.cookie.split(";").forEach((c) => {
                document.cookie = c
                    .replace(/^ +/, "")
                    .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });

            // Redirect
            setTimeout(() => {
                window.location.href = "/";
            }, 1000);

        } catch (error: any) {
            toast.error(error.message);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold text-red-600">데이터베이스 초기화</h1>
                    <p className="text-gray-500 text-sm">
                        모든 데이터가 영구적으로 삭제됩니다.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-mono text-gray-500 uppercase">Admin Password</label>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="font-mono border-0 border-b border-gray-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-red-500 transition-colors bg-transparent placeholder:text-gray-300"
                            placeholder="비밀번호 입력"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-mono text-gray-500 uppercase">Confirmation Message</label>
                        <div className="py-2 text-sm font-bold text-gray-800 select-all text-center">
                            {TARGET_PHRASE}
                        </div>
                        <Input
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            className="font-mono border-0 border-b border-gray-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-red-500 transition-colors bg-transparent placeholder:text-gray-300"
                            placeholder="위 문구를 그대로 입력하세요"
                        />
                    </div>
                </div>

                <div className="flex gap-4 pt-4">
                    <Button
                        variant="ghost"
                        className="flex-1 text-gray-400 hover:text-gray-600 hover:bg-transparent"
                        onClick={() => setLocation("/admin")}
                    >
                        취소
                    </Button>
                    <Button
                        variant="destructive"
                        className="flex-1 rounded-none bg-red-600 hover:bg-red-700"
                        disabled={confirmation !== TARGET_PHRASE || !password || isLoading}
                        onClick={handleReset}
                    >
                        {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : "초기화"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
