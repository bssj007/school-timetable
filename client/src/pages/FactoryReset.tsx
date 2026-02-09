
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
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
            <Card className="w-full max-w-md border-red-200 shadow-xl">
                <CardHeader className="bg-red-100/50 pb-4">
                    <div className="flex items-center gap-2 text-red-600 mb-2">
                        <TriangleAlert className="h-6 w-6" />
                        <CardTitle className="text-xl">데이터베이스 초기화 (Factory Reset)</CardTitle>
                    </div>
                    <CardDescription className="text-red-700 font-medium">
                        이 작업은 모든 데이터를 영구적으로 삭제합니다.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="space-y-4 text-sm text-gray-600 bg-white p-4 rounded-lg border border-red-100">
                        <p>
                            <strong>초기화 대상:</strong>
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>모든 수행평가 데이터</li>
                            <li>모든 사용자 접속 로그</li>
                            <li>모든 차단된 사용자</li>
                            <li>현재 브라우저의 모든 쿠키 및 로그인 정보</li>
                        </ul>
                        <p className="text-xs text-gray-500 mt-2">
                            * 관리자 비밀번호는 초기화되지 않습니다.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">관리자 비밀번호 확인</label>
                        <Input
                            type="password"
                            placeholder="Admin Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-white"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            아래 문구를 정확히 입력하세요:
                        </label>
                        <div className="p-2 bg-gray-100 rounded text-sm font-mono text-center select-all">
                            {TARGET_PHRASE}
                        </div>
                        <Input
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            placeholder="여기에 문구를 입력하세요"
                            className="bg-white"
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setLocation("/admin")}
                        >
                            취소
                        </Button>
                        <Button
                            variant="destructive"
                            className="w-full font-bold"
                            disabled={confirmation !== TARGET_PHRASE || !password || isLoading}
                            onClick={handleReset}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    초기화 중...
                                </>
                            ) : "초기화 실행"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
