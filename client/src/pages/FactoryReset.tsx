
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
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Load password from session if available
    useState(() => {
        const stored = sessionStorage.getItem("adminPassword");
        if (stored) setPassword(stored);
    });

    const TARGET_PHRASE = "햇빛이 선명하게 나뭇잎을 핥고 있었다";

    const handleReset = async () => {
        if (confirmation !== TARGET_PHRASE) {
            toast.error("확인 문구가 일치하지 않습니다.");
            return;
        }

        if (!password) {
            toast.error("관리자 암호가 필요합니다.");
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
                },
                body: JSON.stringify({ confirmation })
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
                    <h1 className="text-3xl font-black text-red-600">데이터베이스 초기화</h1>
                    <p className="text-gray-900 font-medium">
                        모든 데이터가 영구적으로 삭제됩니다.
                    </p>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <div className="py-3 text-base font-bold text-black select-all text-center bg-gray-50 border border-gray-200 rounded-none">
                            {/* Target Phrase Display */}
                            {TARGET_PHRASE}
                        </div>
                        <Input
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            className="font-bold text-center border-2 border-gray-300 focus:border-red-500 rounded-none py-6 text-lg placeholder:text-gray-400 focus-visible:ring-0"
                            placeholder="위 문구를 그대로 입력하세요"
                        />
                    </div>

                    {/* Password Input (Only if not already in session, or just always show for safety/confirmation?) 
                        Let's show it so they know what password is being used, or allow changing it.
                    */}
                    <div className="space-y-2">
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="text-center border-gray-300 rounded-none"
                            placeholder="관리자 암호 입력"
                        />
                    </div>
                </div>

                <div className="flex gap-4 pt-4">
                    <Button
                        variant="outline"
                        className="flex-1 h-12 text-base font-medium border-2 hover:bg-gray-50 rounded-none"
                        onClick={() => setLocation("/admin")}
                    >
                        취소
                    </Button>
                    <Button
                        variant="destructive"
                        className="flex-1 h-12 text-base font-bold bg-red-600 hover:bg-red-700 shadow-md transform hover:scale-[1.02] transition-all rounded-none"
                        disabled={confirmation !== TARGET_PHRASE || !password || isLoading}
                        onClick={handleReset}
                    >
                        {isLoading ? (
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : "초기화 실행"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
