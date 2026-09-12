
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TriangleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminPasswordCookie, clearAdminPasswordCookie } from "@/lib/adminCookie";
import { TestServerBadge, RealDbResetWarning, type EnvBindingInfo } from "@/components/TestServerBadge";

export default function FactoryReset() {
    const [, setLocation] = useLocation();
    const [confirmation, setConfirmation] = useState("");
    const [adminPasswordInput, setAdminPasswordInput] = useState("");
    const [isPasswordReadOnly, setIsPasswordReadOnly] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    // Verify admin login is present in cookie or session
    useEffect(() => {
        const stored = getAdminPasswordCookie() || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("adminPassword") : null);
        if (!stored) {
            // Redirect to admin login if not authenticated
            toast.error("관리자 로그인이 필요합니다.");
            setTimeout(() => setLocation("/admin"), 100);
        }
    }, [setLocation]);

    const [envInfo, setEnvInfo] = useState<EnvBindingInfo>(() => {
        if (typeof window !== "undefined" && (window as any).__ENV_INFO__) {
            return (window as any).__ENV_INFO__;
        }
        const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
        const isTestServer = host.includes('test') || host.includes('preview') || host === 'localhost' || host === '127.0.0.1';
        const isTestDb = Boolean((window as any)?.__TEST_DB_NAME__?.includes('test') || isTestServer);
        return {
            isTestServer,
            serverName: isTestServer ? 'school-timetable-testserver' : 'school-timetable',
            isTestDb,
            dbName: (window as any)?.__TEST_DB_NAME__ || (isTestDb ? 'school-timetable-testserver-db' : 'school-timetable-db'),
            isMismatch: isTestServer !== isTestDb,
        };
    });

    useEffect(() => {
        fetch('/api/settings/public')
            .then(res => res.json())
            .then(data => {
                if (data.env_info) {
                    setEnvInfo(data.env_info);
                } else if (data.is_test_server !== undefined) {
                    const isTestServer = Boolean(data.is_test_server);
                    const isTestDb = Boolean(data.is_test_db ?? (data.test_db_name ? data.test_db_name.includes('test') : isTestServer));
                    const serverName = data.server_name || (isTestServer ? 'school-timetable-testserver' : 'school-timetable');
                    const dbName = data.test_db_name || (isTestDb ? 'school-timetable-testserver-db' : 'school-timetable-db');
                    setEnvInfo({
                        isTestServer,
                        serverName,
                        isTestDb,
                        dbName,
                        isMismatch: isTestServer !== isTestDb,
                    });
                }
            })
            .catch(() => {});
    }, []);

    const TARGET_PHRASE = "햇빛이 선명하게 나뭇잎을 핥고 있었다";

    const handleReset = async () => {
        if (confirmation !== TARGET_PHRASE) {
            toast.error("확인 문구가 일치하지 않습니다.");
            return;
        }

        if (!adminPasswordInput.trim()) {
            toast.error("관리자 암호를 입력해주세요.");
            return;
        }

        // Additional warning if connected to real live DB
        if (!envInfo.isTestDb) {
            const confirmedRealDb = confirm(
                `🚨 [중요 경고: 실제 운영 DB 초기화]\n\n` +
                `현재 연결된 데이터베이스는 테스트용이 아닌 '실제 운영 DB(${envInfo.dbName || 'school-timetable-db'})'입니다.\n` +
                `초기화 시 실제 학생 시간표, 수행평가 등 모든 실제 서비스 데이터가 영구 파괴됩니다.\n\n` +
                `정말로 실제 운영 DB를 초기화하시겠습니까?`
            );
            if (!confirmedRealDb) {
                return;
            }
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
                    "X-Admin-Password": adminPasswordInput
                },
                body: JSON.stringify({
                    confirmation,
                    adminPassword: adminPasswordInput
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Reset failed");
            }

            toast.success("초기화 완료. 메인 페이지로 이동합니다.");

            // Clear Cookies
            clearAdminPasswordCookie();
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
            <div className="w-full max-w-sm space-y-6">
                {envInfo.isMismatch && (
                    <div className="w-full bg-yellow-100 border border-yellow-300 text-yellow-900 text-xs py-1.5 px-3 rounded font-semibold text-center flex items-center justify-center gap-1.5 shadow-sm">
                        <TriangleAlert className="h-3.5 w-3.5 text-yellow-700 shrink-0" />
                        <span>[환경 불일치] {envInfo.isTestServer ? `테스트 서버에 운영 DB 연결됨` : `운영 서버에 테스트 DB 연결됨`}</span>
                    </div>
                )}
                {(envInfo.isTestServer || envInfo.isTestDb) && (
                    <div className="flex justify-center">
                        <TestServerBadge envInfo={envInfo} />
                    </div>
                )}

                {/* Real DB Warning Box */}
                <RealDbResetWarning envInfo={envInfo} />

                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-black text-red-600">데이터베이스 초기화</h1>
                    <p className="text-gray-900 font-medium">
                        모든 데이터가 영구적으로 삭제됩니다.
                    </p>
                </div>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">확인 문구</label>
                        <div className="py-3 text-base font-bold text-black select-all text-center bg-gray-50 border border-gray-200 rounded-none">
                            {/* Target Phrase Display */}
                            {TARGET_PHRASE}
                        </div>
                        <Input
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-bold text-center border-2 border-gray-300 focus:border-red-500 rounded-none py-6 text-lg placeholder:text-gray-400 focus-visible:ring-0"
                            placeholder="위 확인 문구를 그대로 입력하세요"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">관리자 암호</label>
                        {/* Hidden decoy inputs to defeat browser autofill engines */}
                        <input type="text" className="hidden" tabIndex={-1} aria-hidden="true" autoComplete="off" />
                        <input type="password" className="hidden" tabIndex={-1} aria-hidden="true" autoComplete="off" />
                        <Input
                            type="password"
                            name="admin_reset_credential_disable_autofill"
                            autoComplete="new-password"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            readOnly={isPasswordReadOnly}
                            onFocus={(e) => {
                                setIsPasswordReadOnly(false);
                                e.target.removeAttribute("readonly");
                            }}
                            value={adminPasswordInput}
                            onChange={(e) => setAdminPasswordInput(e.target.value)}
                            className="font-bold text-center border-2 border-gray-300 focus:border-red-500 rounded-none py-6 text-lg placeholder:text-gray-400 focus-visible:ring-0"
                            placeholder="관리자 암호를 입력하세요"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && confirmation === TARGET_PHRASE && adminPasswordInput.trim() && !isLoading) {
                                    handleReset();
                                }
                            }}
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
                        disabled={confirmation !== TARGET_PHRASE || !adminPasswordInput.trim() || isLoading}
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
