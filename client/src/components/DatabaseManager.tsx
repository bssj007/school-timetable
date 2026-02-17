import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Play, Database, RefreshCw, Trash2, Edit, Save, Settings, PlayCircle, ChevronDown, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface DatabaseManagerProps {
    adminPassword: string;
}

export default function DatabaseManager({ adminPassword }: DatabaseManagerProps) {
    const [tables, setTables] = useState<string[]>([]);
    const [activeTable, setActiveTable] = useState<string | null>(null);
    const [sql, setSql] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter tables
    const [showOthers, setShowOthers] = useState(false);
    const mainTables = tables.filter(t => !t.startsWith('_') && t !== 'sqlite_sequence');
    const otherTables = tables.filter(t => t.startsWith('_') || t === 'sqlite_sequence');

    // Edit State
    const [editingRow, setEditingRow] = useState<any | null>(null);
    const [editValues, setEditValues] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    // Settings State
    const [settings, setSettings] = useState({
        auto_delete_enabled: false,
        hide_past_assessments: false,
        retention_days_assessments: '30',
        retention_days_logs: '30',
        retention_days_others: '30'
    });
    const [isSettingsLoading, setIsSettingsLoading] = useState(false);
    const [isCleanupRunning, setIsCleanupRunning] = useState(false);



    // Search State
    const [searchQuery, setSearchQuery] = useState("");

    const filteredResults = results.filter(row => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return Object.values(row).some(val =>
            String(val).toLowerCase().includes(query)
        );
    });

    // Initial Load: List Tables
    useEffect(() => {
        fetchTables();
        fetchSettings();
    }, []);

    // Auto-Refresh Effect
    useEffect(() => {
        const interval = setInterval(() => {
            fetchTables(true);
            fetchSettings(true);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Auto-Save Effect (Debounced)
    useEffect(() => {
        // Skip initial load
        if (isSettingsLoading) return;

        const timer = setTimeout(() => {
            saveSettings(settings);
        }, 500);

        return () => clearTimeout(timer);
    }, [settings]);

    const updateSetting = (key: string, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const saveSettings = async (currentSettings: any) => {
        if (!currentSettings) return; // Guard
        try {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({
                    auto_delete_enabled: String(currentSettings.auto_delete_enabled),
                    hide_past_assessments: String(currentSettings.hide_past_assessments),
                    retention_days_assessments: String(currentSettings.retention_days_assessments),
                    retention_days_logs: String(currentSettings.retention_days_logs),
                    retention_days_others: String(currentSettings.retention_days_others)
                })
            });
            if (!res.ok) {
                console.error("Failed to auto-save settings");
                toast.error("설정 저장 실패");
            } else {
                // toast.success("설정 저장됨"); // 너무 자주 뜨지 않게 주석 처리
            }
        } catch (e) {
            console.error("Error auto-saving settings", e);
        }
    };

    const fetchTables = async (background = false) => {
        try {
            const res = await fetch("/api/admin/database", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({ action: "list_tables" })
            });
            const data = await res.json();
            if (data.tables) {
                setTables(data.tables);
            }
        } catch (e) {
            if (!background) toast.error("테이블 목록을 불러오지 못했습니다.");
        }
    };

    const runQuery = async (querySql: string, quiet = false) => {
        if (!querySql.trim()) return;
        setIsLoading(true);
        if (!quiet) {
            setError(null);
            setResults([]);
        }

        try {
            const res = await fetch("/api/admin/database", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({ action: "query", sql: querySql })
            });
            const data = await res.json();

            if (data.error) {
                if (!quiet) setError(data.error);
                toast.error("쿼리 실행 오류: " + data.error);
                return null;
            } else {
                if (!quiet) setResults(data.results || []);
                if (data.success && !quiet) toast.success("쿼리 실행 성공");
                return data;
            }
        } catch (e: any) {
            if (!quiet) setError(e.message);
            toast.error("요청 실패");
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const handleTableClick = (tableName: string) => {
        setActiveTable(tableName);
        const autoSql = `SELECT * FROM ${tableName} LIMIT 100`;
        setSql(autoSql);
        runQuery(autoSql);
    };

    const handleEditClick = (row: any) => {
        setEditingRow(row);
        setEditValues({ ...row });
    };

    const handleSaveEdit = async () => {
        if (!activeTable || !editingRow) return;

        // Determine PK
        const pkField = editingRow.id ? 'id' : (editingRow.ip ? 'ip' : null);
        const pkValue = pkField ? editingRow[pkField] : null;

        if (!pkField || !pkValue) {
            toast.error("Primary Key를 찾을 수 없어 수정할 수 없습니다.");
            return;
        }

        setIsSaving(true);
        try {
            // Construct UPDATE query
            const updates = [];
            const values = [];

            for (const key in editValues) {
                if (key === pkField) continue; // Don't update PK
                if (editValues[key] !== editingRow[key]) {
                    updates.push(`${key} = ?`);
                    values.push(editValues[key]);
                }
            }

            if (updates.length === 0) {
                toast.info("변경 사항이 없습니다.");
                setIsSaving(false);
                setEditingRow(null);
                return;
            }

            // Simple SQL construction (be careful with quotes for strings)
            // Note: This is a basic implementation. Ideally, the API would support bind parameters purely.
            const setClause = updates.map((u, i) => {
                const val = values[i];
                const formattedVal = val === null ? "NULL" : (typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val);
                return `${u.split('=')[0]} = ${formattedVal}`;
            }).join(", ");

            // Formatting PK Value (String needs quotes)
            const formattedPkValue = typeof pkValue === 'string' ? `'${pkValue}'` : pkValue;

            const updateSql = `UPDATE ${activeTable} SET ${setClause} WHERE ${pkField} = ${formattedPkValue}`;

            const result = await runQuery(updateSql, true); // true = quiet mode (don't clear results)

            if (result && result.success) {
                toast.success("수정되었습니다.");
                setEditingRow(null);
                // Refresh table
                runQuery(`SELECT * FROM ${activeTable} LIMIT 100`, false);
            }

        } catch (e: any) {
            console.error(e);
            toast.error("수정 중 오류 발생: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteRow = async (row: any) => {
        if (!confirm("정말로 이 항목을 삭제하시겠습니까?")) return;

        // Determine PK
        const pk = row.id || row.ip;
        if (!pk) {
            toast.error("삭제할 수 없는 항목입니다 (ID 없음).");
            return;
        }

        try {
            const res = await fetch(`/api/admin/database?table=${activeTable}&id=${pk}`, {
                method: "DELETE",
                headers: { "X-Admin-Password": adminPassword }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                toast.success("삭제되었습니다.");
                // Refresh
                runQuery(`SELECT * FROM ${activeTable} LIMIT 100`, true); // quiet refresh
            } else {
                toast.error("삭제 실패: " + data.error);
            }
        } catch (e: any) {
            toast.error("삭제 중 오류 발생: " + e.message);
        }
    };

    const handleTruncateTable = async (tableName: string) => {
        const userInput = prompt(`정말로 [${tableName}] 테이블의 모든 데이터를 삭제하시겠습니까?\n확인을 위해 'DELETE'를 입력하세요.`);
        if (userInput !== 'DELETE') {
            if (userInput) toast.error("입력값이 일치하지 않아 취소되었습니다.");
            return;
        }

        try {
            const res = await fetch(`/api/admin/database?table=${tableName}`, {
                method: "DELETE", // No ID = Truncate
                headers: { "X-Admin-Password": adminPassword }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                toast.success("테이블이 초기화되었습니다.");
                if (activeTable === tableName) {
                    runQuery(`SELECT * FROM ${activeTable} LIMIT 100`, false);
                }
            } else {
                toast.error("초기화 실패: " + data.error);
            }
        } catch (e: any) {
            toast.error("초기화 중 오류 발생: " + e.message);
        }
    };

    const handleDropTable = async (tableName: string) => {
        const userInput = prompt(`🔥 위험: [${tableName}] 테이블을 완전히 삭제(DROP)하시겠습니까?\n테이블 구조와 데이터가 모두 사라집니다.\n확인을 위해 'DROP'을 입력하세요.`);
        if (userInput !== 'DROP') {
            if (userInput) toast.error("입력값이 일치하지 않아 취소되었습니다.");
            return;
        }

        try {
            const res = await fetch(`/api/admin/database?table=${tableName}&mode=drop`, {
                method: "DELETE",
                headers: { "X-Admin-Password": adminPassword }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                toast.success(`[${tableName}] 테이블이 삭제되었습니다.`);
                fetchTables();
                if (activeTable === tableName) setActiveTable(null);
            } else {
                toast.error("삭제 실패: " + data.error);
            }
        } catch (e: any) {
            toast.error("삭제 중 오류 발생: " + e.message);
        }
    };

    const fetchSettings = async (background = false) => {
        if (!background) setIsSettingsLoading(true);
        try {
            const res = await fetch("/api/admin/settings", {
                headers: { "X-Admin-Password": adminPassword }
            });
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    // Default to TRUE if key is missing, specifically for auto-delete and delete-past
                    auto_delete_enabled: data.auto_delete_enabled !== 'false',
                    hide_past_assessments: data.hide_past_assessments === 'true',
                    retention_days_assessments: data.retention_days_assessments || '30',
                    retention_days_logs: data.retention_days_logs || '30',
                    retention_days_others: data.retention_days_others || '30'
                });
            }
        } catch (e) {
            if (!background) console.error("Failed to fetch settings", e);
        } finally {
            if (!background) setIsSettingsLoading(false);
        }
    };

    return (
        <div className="h-[calc(100vh-200px)] min-h-[600px] md:h-[700px] flex flex-col">
            {/* Main Content Area with Tabs */}
            <div className="flex-1 min-h-0">
                <Tabs defaultValue="manual" className="h-full flex flex-col">
                    <TabsList className="mb-2 w-full justify-start h-9">
                        <TabsTrigger value="manual" className="flex items-center gap-2 text-xs">
                            <Database className="w-3 h-3" /> 수동 관리
                        </TabsTrigger>
                        <TabsTrigger value="auto" className="flex items-center gap-2 text-xs">
                            <Settings className="w-3 h-3" /> 자동 관리
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="manual" className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 mt-0">
                        {/* Sidebar: Table List (Only shown in Manual Mode) */}
                        <Card className="w-full md:w-1/4 h-48 md:h-full flex flex-col flex-none border-0 shadow-none bg-transparent">
                            <div className="flex items-center justify-between py-1 px-1 mb-0">
                                <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                                    <Database className="w-3 h-3" /> 목록
                                </h3>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => handleTruncateTable('ALL')}
                                        title="전체 데이터 초기화"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fetchTables(false)}>
                                        <RefreshCw className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                            <CardContent className="flex-1 min-h-0 p-0">
                                <ScrollArea className="h-full">
                                    <div className="flex flex-col p-1 gap-1">
                                        {mainTables.map(t => (
                                            <div key={t} className="flex items-center gap-1 w-full group">
                                                <Button
                                                    variant={activeTable === t ? "secondary" : "ghost"}
                                                    className="justify-start font-mono text-xs h-7 px-2 flex-1 overflow-hidden text-ellipsis"
                                                    onClick={() => handleTableClick(t)}
                                                >
                                                    {t}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDropTable(t);
                                                    }}
                                                    title="테이블 삭제 (DROP)"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ))}

                                        {otherTables.length > 0 && (
                                            <div className="pt-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-between text-xs text-gray-500 h-6 px-2 hover:bg-gray-100"
                                                    onClick={() => setShowOthers(!showOthers)}
                                                >
                                                    <span>기타 ({otherTables.length})</span>
                                                    <ChevronDown className={`w-3 h-3 transition-transform ${showOthers ? 'rotate-180' : ''}`} />
                                                </Button>
                                                {showOthers && (
                                                    <div className="flex flex-col gap-1 mt-1 pl-2 border-l-2 border-gray-100 ml-1">
                                                        {otherTables.map(t => (
                                                            <Button
                                                                key={t}
                                                                variant={activeTable === t ? "secondary" : "ghost"}
                                                                className="justify-start font-mono text-xs h-7 px-2 w-full text-gray-500"
                                                                onClick={() => handleTableClick(t)}
                                                            >
                                                                {t}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        {/* Existing SQL Editor & Results */}
                        <div className="flex-1 flex flex-col gap-2 min-w-0">
                            <Card className="flex-none bg-gray-50 border shadow-sm">
                                <CardHeader className="py-1 px-3 border-b border-gray-100 min-h-[30px] flex justify-center">
                                    <CardTitle className="text-xs font-mono text-gray-500">SQL Editor</CardTitle>
                                </CardHeader>
                                <CardContent className="p-2">
                                    <Textarea
                                        value={sql}
                                        onChange={(e) => setSql(e.target.value)}
                                        className="font-mono text-xs min-h-[80px] mb-2 bg-white resize-none focus-visible:ring-1"
                                        placeholder="SELECT * FROM users..."
                                    />
                                    <div className="flex justify-between items-center">
                                        <div className="text-xs text-red-500 font-bold">{error}</div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setSql("")} className="bg-white h-7 text-xs">지우기</Button>
                                            <Button size="sm" onClick={() => runQuery(sql)} disabled={isLoading} className="h-7 text-xs">
                                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                                                Run Query
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="flex-1 min-h-0 flex flex-col">
                                <CardHeader className="py-2 px-3 border-b border-gray-100 min-h-[40px] flex flex-row items-center justify-between">
                                    <div className="flex items-center gap-2 w-full max-w-sm">
                                        <div className="relative w-full">
                                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                            <Input
                                                placeholder="결과 내 검색..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="h-7 text-xs pl-7 w-full bg-gray-50 focus:bg-white transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-400 font-mono ml-2 whitespace-nowrap">
                                        {results.length > 0 ? `${filteredResults.length} / ${results.length} rows` : '0 rows'}
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 min-h-0 p-0">
                                    {results.length > 0 ? (
                                        <ScrollArea className="h-full w-full">
                                            <div className="p-0">
                                                <Table>
                                                    <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                                                        <TableRow>
                                                            <TableHead className="w-[50px] text-center">Action</TableHead>
                                                            {Object.keys(results[0]).map(key => (
                                                                <TableHead key={key} className="whitespace-nowrap font-bold">{key}</TableHead>
                                                            ))}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {filteredResults.map((row, i) => (
                                                            <TableRow key={i}>
                                                                <TableCell className="text-center p-1">
                                                                    {(row.id || row.ip) && (
                                                                        <div className="flex gap-1">
                                                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500 hover:text-blue-700" onClick={() => handleEditClick(row)}>
                                                                                <Edit className="h-3 w-3" />
                                                                            </Button>
                                                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => handleDeleteRow(row)}>
                                                                                <Trash2 className="h-3 w-3" />
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                                {Object.values(row).map((val: any, j) => (
                                                                    <TableCell key={j} className="whitespace-nowrap max-w-[200px] truncate text-xs font-mono">
                                                                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                                    </TableCell>
                                                                ))}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            <ScrollBar orientation="horizontal" />
                                        </ScrollArea>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                                            데이터가 없습니다. SQL을 실행하세요.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="auto" className="flex-1 mt-0">
                        <Card>
                            <CardHeader>
                                <CardTitle>데이터 자동 삭제 설정</CardTitle>
                                <CardDescription>
                                    오래된 데이터를 자동으로 정리하여 DB 용량을 확보합니다. (매 1시간마다 실행됨)
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Label htmlFor="auto-delete" className="font-semibold">자동 삭제 기능 사용</Label>
                                        <Switch
                                            id="auto-delete"
                                            checked={settings.auto_delete_enabled}
                                            onCheckedChange={(checked) => updateSetting('auto_delete_enabled', checked)}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500">이 기능을 켜면 아래 설정에 따라 데이터가 주기적으로 삭제됩니다.</p>
                                </div>

                                <div className="space-y-6 border-l-2 border-gray-100 pl-6 ml-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-2 flex flex-col items-start text-left">
                                            <Label htmlFor="retention-assessments">수행평가 보관 기간 (일)</Label>
                                            <Input
                                                id="retention-assessments"
                                                type="number"
                                                value={settings.retention_days_assessments}
                                                onChange={(e) => updateSetting('retention_days_assessments', e.target.value)}
                                                disabled={!settings.auto_delete_enabled}
                                            />
                                        </div>
                                        <div className="space-y-2 flex flex-col items-start text-left">
                                            <Label htmlFor="retention-logs">접속 기록 보관 기간 (일)</Label>
                                            <Input
                                                id="retention-logs"
                                                type="number"
                                                value={settings.retention_days_logs}
                                                onChange={(e) => updateSetting('retention_days_logs', e.target.value)}
                                                disabled={!settings.auto_delete_enabled}
                                            />
                                        </div>
                                        <div className="space-y-2 flex flex-col items-start text-left">
                                            <Label htmlFor="retention-others">기타 사용자 보관 기간 (일)</Label>
                                            <Input
                                                id="retention-others"
                                                type="number"
                                                value={settings.retention_days_others}
                                                onChange={(e) => updateSetting('retention_days_others', e.target.value)}
                                                disabled={!settings.auto_delete_enabled}
                                            />
                                            <p className="text-[10px] text-gray-400">
                                                * 기타 사용자: 학년/반 정보가 없거나 브라우저 정보가 불분명한 사용자 (기본 30일)
                                            </p>
                                        </div>
                                    </div>


                                    <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg bg-gray-50 mt-4">
                                        <div className="flex flex-col space-y-1">
                                            <Label htmlFor="hide-past" className="font-semibold text-base">이미 끝난 수행평가 숨기기</Label>
                                            <span className="font-normal text-sm text-gray-500">
                                                마감일(Due Date)이 지난 수행평가를 학생들의 리스트 및 시간표에서 숨깁니다. (삭제되지 않음)
                                            </span>
                                        </div>
                                        <Switch
                                            id="hide-past"
                                            checked={settings.hide_past_assessments}
                                            onCheckedChange={(checked) => updateSetting('hide_past_assessments', checked)}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end text-xs text-gray-400 pt-4">
                                    {isSettingsLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 저장 중...</> : <><Save className="w-3 h-3 mr-1" /> 설정이 자동으로 저장됩니다.</>}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingRow} onOpenChange={(open) => !open && setEditingRow(null)}>
                <DialogContent className="max-w-[600px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>데이터 수정 ({activeTable})</DialogTitle>
                        <DialogDescription>
                            {editingRow?.id ? `ID: ${editingRow.id}` : (editingRow?.ip ? `IP: ${editingRow.ip}` : 'Unknown PK')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {editingRow && Object.keys(editingRow).map((key) => {
                            if (key === 'id') return null;
                            const isLongText = typeof editValues[key] === 'string' && editValues[key].length > 50;
                            return (
                                <div key={key} className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor={key} className="text-right font-mono text-xs">
                                        {key}
                                    </Label>
                                    <div className="col-span-3">
                                        {isLongText ? (
                                            <Textarea
                                                id={key}
                                                value={editValues[key] === null ? '' : editValues[key]}
                                                onChange={(e) => setEditValues({ ...editValues, [key]: e.target.value })}
                                                className="font-mono text-xs"
                                            />
                                        ) : (
                                            <Input
                                                id={key}
                                                value={editValues[key] === null ? '' : editValues[key]}
                                                onChange={(e) => setEditValues({ ...editValues, [key]: e.target.value })}
                                                className="font-mono text-xs"
                                            />
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingRow(null)}>취소</Button>
                        <Button onClick={handleSaveEdit} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            저장
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
