import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock, Settings, Eye, EyeOff } from "lucide-react";

export default function Admin() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const checkPasswordMutation = useMutation({
        mutationFn: async (password: string) => {
            const res = await fetch("/api/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                return true;
            } else {
                throw new Error(data.message || data.error || "Invalid password");
            }
        },
        onSuccess: () => {
            setIsAuthenticated(true);
            toast.success("관리자 로그인 성공");
        },
        onError: (error) => {
            toast.error(error.message || "로그인 실패");
            setPassword("");
        },
    });

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        checkPasswordMutation.mutate(password);
    };

    if (!isAuthenticated) {
        return (
            <div className="container max-w-md mx-auto px-4 py-20">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl text-center flex items-center justify-center gap-2">
                            <Lock className="h-6 w-6" />
                            관리사무소
                        </CardTitle>
                        <CardDescription className="text-center">
                            관리자 암호를 입력하세요
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="암호"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-gray-500" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-gray-500" />
                                    )}
                                    <span className="sr-only">
                                        {showPassword ? "암호 숨기기" : "암호 보기"}
                                    </span>
                                </Button>
                            </div>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={checkPasswordMutation.isPending}
                            >
                                {checkPasswordMutation.isPending ? "확인 중..." : "입장하기"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container max-w-4xl mx-auto px-4 py-8">
            <div className="flex items-center gap-3 mb-8">
                <Settings className="h-8 w-8 text-gray-700" />
                <h1 className="text-3xl font-bold">관리사무소</h1>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>사이트 데이터 관리</CardTitle>
                        <CardDescription>
                            여기에서 사이트의 주요 데이터를 수정할 수 있습니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="p-12 text-center text-gray-500 border-2 border-dashed rounded-lg">
                            데이터 관리 기능을 준비 중입니다.
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
