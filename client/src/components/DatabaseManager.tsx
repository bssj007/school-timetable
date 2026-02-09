import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Play, Database, RefreshCw, Trash2, Edit, Save } from "lucide-react";
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

    // Initial Load: List Tables
    useEffect(() => {
        fetchTables();
    }, []);

    const fetchTables = async () => {
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
            toast.error("테이블 목록을 불러오지 못했습니다.");
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

            // Simple SQL construction (be careful with quotes for strings, but bind params are better if api supported them directly via array. 
            // Since our simple API expects a raw SQL string, we need to manually escape/quote for now.
            // WARNING: This is basic param replacement for specific types.

            const setClause = updates.map((u, i) => {
                const val = values[i];
                const formattedVal = val === null ? "NULL" : (typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val);
                return `${u.split('=')[0]} = ${formattedVal}`;
            }).join(", ");

            const updateSql = `UPDATE ${activeTable} SET ${setClause} WHERE id = ${editingRow.id}`;

            // Execute locally to see in editor? No, run directly.
            const result = await runQuery(updateSql, true); // true = quiet mode (don't clear results yet)

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

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[700px]">
            {/* Sidebar: Table List */}
            <Card className="md:col-span-1 h-full flex flex-col">
                <CardHeader className="py-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Database className="w-4 h-4" /> 테이블 목록
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={fetchTables}><RefreshCw className="w-3 h-3" /></Button>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0">
                    <ScrollArea className="h-full">
                        <div className="flex flex-col p-2 gap-1">
                            {tables.map(t => (
                                <Button
                                    key={t}
                                    variant={activeTable === t ? "secondary" : "ghost"}
                                    className="justify-start font-mono text-sm"
                                    onClick={() => handleTableClick(t)}
                                >
                                    {t}
                                </Button>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Main: SQL & Results */}
            <div className="md:col-span-3 h-full flex flex-col gap-4">
                <Card className="flex-none">
                    <CardHeader className="py-3 px-4 bg-gray-50 border-b">
                        <CardTitle className="text-sm font-mono text-gray-500">SQL Editor</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <Textarea
                            value={sql}
                            onChange={(e) => setSql(e.target.value)}
                            className="font-mono text-sm min-h-[100px] mb-2"
                            placeholder="SELECT * FROM users..."
                        />
                        <div className="flex justify-between items-center">
                            <div className="text-xs text-red-500 font-bold">{error}</div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setSql("")}>지우기</Button>
                                <Button size="sm" onClick={() => runQuery(sql)} disabled={isLoading}>
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
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
        </div>
    );
}
