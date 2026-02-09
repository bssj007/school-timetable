import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, Database, RefreshCw, Trash2 } from "lucide-react";
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
            if (data.tables) setTables(data.tables);
        } catch (e) {
            toast.error("테이블 목록을 불러오지 못했습니다.");
        }
    };

    const runQuery = async (querySql: string) => {
        if (!querySql.trim()) return;
        setIsLoading(true);
        setError(null);
        setResults([]);

        try {
            const res = await fetch("/api/admin/database", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Admin-Password": adminPassword },
                body: JSON.stringify({ action: "query", sql: querySql })
            });
            const data = await res.json();

            if (data.error) {
                setError(data.error);
                toast.error("쿼리 실행 오류");
            } else {
                setResults(data.results || []);
                if (data.success) toast.success("쿼리 실행 성공");
            }
        } catch (e: any) {
            setError(e.message);
            toast.error("요청 실패");
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
                                                {Object.keys(results[0]).map(key => (
                                                    <TableHead key={key} className="whitespace-nowrap font-bold">{key}</TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {results.map((row, i) => (
                                                <TableRow key={i}>
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
                            </ScrollArea>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                                데이터가 없습니다. SQL을 실행하세요.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
