import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Play, Database, RefreshCw, Trash2, Edit, Save, Settings, PlayCircle } from "lucide-react";
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

    // Edit State
    const [editingRow, setEditingRow] = useState<any | null>(null);
    const [editValues, setEditValues] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    // Settings State
    const [settings, setSettings] = useState({
        auto_delete_enabled: false,
        retention_days_assessments: '30',
        retention_days_logs: '30',
        delete_past_assessments: false
    });
    const [isSettingsLoading, setIsSettingsLoading] = useState(false);
    const [isCleanupRunning, setIsCleanupRunning] = useState(false);

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
        // Don't set global loading state for auto-save to avoid flickering
        // setIsSettingsLoading(true); 
        try {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({
                    auto_delete_enabled: String(currentSettings.auto_delete_enabled),
                    retention_days_assessments: String(currentSettings.retention_days_assessments),
                    retention_days_logs: String(currentSettings.retention_days_logs),
                    delete_past_assessments: String(currentSettings.delete_past_assessments)
                })
            });
            if (!res.ok) {
                console.error("Failed to auto-save settings");
            }
        } catch (e) {
            console.error("Error auto-saving settings", e);
        } finally {
            // setIsSettingsLoading(false);
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
                // Filter out internal tables (starting with _)
                setTables(data.tables.filter((t: string) => !t.startsWith('_') && t !== 'sqlite_sequence'));
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
        if (!activeTable || !editingRow || !editingRow.id) return;

        setIsSaving(true);
        try {
            // Construct UPDATE query
            const updates = [];
            const values = [];

            for (const key in editValues) {
                if (key === 'id') continue; // Don't update ID
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

            const updateSql = `UPDATE ${activeTable} SET ${setClause} WHERE id = ${editingRow.id}`;

            const result = await runQuery(updateSql, true); // rue = quiet mode (don't clear results)

            if (result && result.success) {
                toast.success("수정되었습니다.");
                setEditingRow(null);
                // Refresh table
                runQuery(`SELECT * FROM ${activeTable} LIMIT 100`, false);
            }

        } catch (e) {
            console.error(e);
            toast.error("수정 중 오류 발생");
        } finally {
            setIsSaving(false);
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
                    retention_days_assessments: data.retention_days_assessments || '30',
                    retention_days_logs: data.retention_days_logs || '30',
                    delete_past_assessments: data.delete_past_assessments !== 'false'
                });
            }
        } catch (e) {
            if (!background) console.error("Failed to fetch settings", e);
        } finally {
            if (!background) setIsSettingsLoading(false);
        }
    };

    return (
        <div className="h-[700px] flex flex-col">
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

                    <TabsContent value="manual" className="flex-1 min-h-0 flex gap-4 mt-0">
                        {/* Sidebar: Table List (Only shown in Manual Mode) */}
                        <Card className="w-1/4 h-full flex flex-col flex-none border-0 shadow-none bg-transparent">
                            <div className="flex items-center justify-between py-1 px-1 mb-0">
                                <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                                    <Database className="w-3 h-3" /> 테이블 목록
                                </h3>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fetchTables(false)}>
                                    <RefreshCw className="w-3 h-3" />
                                </Button>
                            </div>
                            <CardContent className="flex-1 min-h-0 p-0">
                                <ScrollArea className="h-full">
                                    <div className="flex flex-col p-1 gap-1">
                                        {tables.map(t => (
                                            <Button
                                                key={t}
                                                variant={activeTable === t ? "secondary" : "ghost"}
                                                className="justify-start font-mono text-xs h-7 px-2 w-full"
                                                onClick={() => handleTableClick(t)}
                                            >
                                                {t}
                                            </Button>
                                        ))}
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
                                                        {results.map((row, i) => (
                                                            <TableRow key={i}>
                                                                <TableCell className="text-center p-1">
                                                                    {row.id && (
                                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditClick(row)}>
                                                                            <Edit className="h-3 w-3" />
                                                                        </Button>
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
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <div className="flex items-center space-x-2">
                                            <Label htmlFor="delete-past" className="font-semibold">이미 지난 수행평가 삭제</Label>
                                            <Switch
                                                id="delete-past"
                                                checked={settings.delete_past_assessments}
                                                onCheckedChange={(checked) => updateSetting('delete_past_assessments', checked)}
                                                disabled={!settings.auto_delete_enabled}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500">마감일(Due Date)이 지난 항목을 즉시 삭제 대상에 포함합니다.</p>
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
                            ID: {editingRow?.id}
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
