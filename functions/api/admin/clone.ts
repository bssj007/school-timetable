import { verifyAdminPassword } from "../../../server/adminPW";
import { resolveEnvBindingInfo } from "../../_testEnv";

// ---------------------------------------------------------------------------
// Table Metadata (한글 라벨, 설명, 외래키 안전 순서 priority)
// ---------------------------------------------------------------------------
export const TABLE_METADATA: Record<string, { label: string; description: string; priority: number }> = {
    student_profiles: { label: "학생 프로필 및 선택과목", description: "학생별 정보, 학년/반/번호, 선택과목 JSON", priority: 1 },
    elective_config: { label: "선택과목 분반/교사 설정", description: "과목명, 교사명, 분반 코드 매핑", priority: 2 },
    elective_presets: { label: "학번별 선택과목 사전지정", description: "학번별 사전 입력된 선택과목 정보", priority: 3 },
    dataset_bridges: { label: "데이터셋 브릿지 매핑", description: "시간표 데이터셋 간 과목 매핑 규칙", priority: 4 },
    exam_schedules: { label: "시험 일정", description: "중간/기말/모의고사 등 시험 기간 및 일정", priority: 5 },
    timetable_cache: { label: "시간표 캐시", description: "컴시간 시간표 응답 캐시 데이터", priority: 6 },
    meal_cache: { label: "급식 메뉴 캐시", description: "나이스/학교 급식 메뉴 캐시", priority: 7 },
    meal_ratings: { label: "급식 평점 데이터", description: "학생들이 남긴 급식 별점 데이터", priority: 8 },
    meal_suggestions: { label: "급식 건의사항", description: "급식 메뉴 건의 및 의견 데이터", priority: 9 },
    bug_reports: { label: "버그 제보", description: "사용자 버그 및 오류 제보 내역", priority: 10 },
    ip_profiles: { label: "IP별 프로필 및 통계", description: "접속 IP별 설정 및 프로필 매핑 (student_profiles 참조)", priority: 11 },
    cookie_profiles: { label: "기기(쿠키)별 프로필", description: "브라우저 클라이언트 ID별 프로필 (student_profiles 참조)", priority: 12 },
    system_settings: { label: "시스템 설정", description: "데이터베이스 시스템 설정 값 (db_name 제외)", priority: 13 },
    access_logs: { label: "접속 로그 (대용량)", description: "페이지 및 API 접속 기록 (데이터 양이 많을 수 있음)", priority: 99 },
};

/**
 * [Zero-Backflow Guard] 본 DB 인스턴스 전용 읽기 전용 래퍼 (Read-Only Proxy)
 * - SELECT 및 PRAGMA 쿼리만 허용
 * - INSERT, UPDATE, DELETE, DROP, ALTER 등 모든 쓰기 쿼리 시도시 즉각 예외 발생
 */
function createReadOnlyD1(d1: any) {
    if (!d1) return null;
    return {
        prepare(query: string) {
            const normalized = query.trim().toUpperCase();
            if (
                !normalized.startsWith("SELECT") &&
                !normalized.startsWith("PRAGMA TABLE_INFO") &&
                !normalized.startsWith("PRAGMA TABLE_LIST") &&
                !normalized.startsWith("PRAGMA DATABASE_LIST")
            ) {
                throw new Error(`[CRITICAL SECURITY GUARD] Non-read query strictly forbidden on MAIN_DB: ${query}`);
            }
            return d1.prepare(query);
        },
        batch() {
            throw new Error("[CRITICAL SECURITY GUARD] Batch write operations strictly forbidden on MAIN_DB");
        }
    };
}

export const onRequest = async (context: any) => {
    const { request, env } = context;

    // 1. 관리자 암호 인증
    const password = request.headers.get("X-Admin-Password");
    if (!verifyAdminPassword(password, env)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    // 2. 엄격한 환경 검증: 테스트 서버 + 테스트 DB + 불일치 없음 확인
    const envInfo = await resolveEnvBindingInfo(env, new URL(request.url));
    if (!envInfo.isTestServer || !envInfo.isTestDb || envInfo.isMismatch) {
        return new Response(JSON.stringify({
            error: "본 DB 복제 기능은 테스트 서버 및 테스트 DB가 정상 작동하는 환경에서만 실행할 수 있습니다."
        }), {
            status: 403,
            headers: { "Content-Type": "application/json" }
        });
    }

    // 3. 쓰기 대상 DB(env.DB) 무결성 검증
    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Target Database configuration missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    // 대상 DB가 절대 운영 DB(school-timetable-db)여서는 안 됨
    if (envInfo.dbName === "school-timetable-db" || !envInfo.dbName.includes("test")) {
        return new Response(JSON.stringify({
            error: "[치명적 보안 차단] 대상 DB가 운영 DB로 감지되었습니다. 복제 작업을 실행할 수 없습니다."
        }), {
            status: 403,
            headers: { "Content-Type": "application/json" }
        });
    }

    // 4. 본 DB 인스턴스(env.MAIN_DB || env.PROD_DB) 취득 및 읽기 전용 프록시 생성
    const rawMainDb = env.MAIN_DB || env.PROD_DB;
    const isMainDbBound = Boolean(rawMainDb);
    const readOnlyMainDb = isMainDbBound ? createReadOnlyD1(rawMainDb) : null;

    try {
        // -------------------------------------------------------------------
        // GET: 복제 가능한 테이블 목록 및 행 수 프리뷰 조회
        // -------------------------------------------------------------------
        if (request.method === "GET") {
            if (!isMainDbBound || !readOnlyMainDb) {
                return new Response(JSON.stringify({
                    success: true,
                    mainDbBound: false,
                    message: "Cloudflare Pages 'school-timetable-testserver'의 D1 바인딩에 'MAIN_DB'로 'school-timetable-db'를 추가해주세요.",
                    tables: []
                }), {
                    headers: { "Content-Type": "application/json" }
                });
            }

            // 본 DB와 테스트 DB의 실제 테이블 목록 조회
            const { results: mainTableRows } = await readOnlyMainDb.prepare(
                "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
            ).all();
            const mainTableNames: string[] = (mainTableRows || []).map((r: any) => r.name);

            const { results: testTableRows } = await env.DB.prepare(
                "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
            ).all();
            const testTableNames: string[] = (testTableRows || []).map((r: any) => r.name);

            // 테이블 메타데이터 결합 및 행 수 집계
            const tablesInfo = [];
            for (const tableName of mainTableNames) {
                const meta = TABLE_METADATA[tableName] || {
                    label: tableName,
                    description: `${tableName} 테이블`,
                    priority: 50
                };

                let mainCount = 0;
                let testCount = 0;

                try {
                    const mCountRow = await readOnlyMainDb.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).first();
                    mainCount = Number(mCountRow?.count || 0);
                } catch (_) {}

                if (testTableNames.includes(tableName)) {
                    try {
                        const tCountRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).first();
                        testCount = Number(tCountRow?.count || 0);
                    } catch (_) {}
                }

                tablesInfo.push({
                    name: tableName,
                    label: meta.label,
                    description: meta.description,
                    priority: meta.priority,
                    mainCount,
                    testCount,
                    existsInTest: testTableNames.includes(tableName)
                });
            }

            // priority 기준 정렬
            tablesInfo.sort((a, b) => a.priority - b.priority);

            return new Response(JSON.stringify({
                success: true,
                mainDbBound: true,
                mainDbName: "school-timetable-db",
                targetDbName: envInfo.dbName,
                tables: tablesInfo
            }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // -------------------------------------------------------------------
        // POST: 선택한 테이블 덮어쓰기 복제 실행
        // -------------------------------------------------------------------
        if (request.method === "POST") {
            if (!isMainDbBound || !readOnlyMainDb) {
                return new Response(JSON.stringify({
                    error: "본 DB(MAIN_DB) 바인딩이 설정되지 않았습니다. Cloudflare Pages 설정에서 'MAIN_DB'를 바인딩해주세요."
                }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const body = await request.json();
            const selectedTables: string[] = body.tables || [];
            const syncSequences: boolean = body.syncSequences !== false;

            if (!Array.isArray(selectedTables) || selectedTables.length === 0) {
                return new Response(JSON.stringify({ error: "복제할 테이블을 최소 1개 이상 선택해주세요." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            // 외래키 순서(priority)에 맞춰 정렬
            const sortedTables = [...selectedTables].sort((a, b) => {
                const pA = TABLE_METADATA[a]?.priority ?? 50;
                const pB = TABLE_METADATA[b]?.priority ?? 50;
                return pA - pB;
            });

            // 1. 외래키 지연 활성화
            try {
                await env.DB.prepare("PRAGMA defer_foreign_keys = ON;").run();
            } catch (_) {}

            const clonedSummary: Array<{ table: string; rowCount: number }> = [];
            let totalRowsCloned = 0;

            const CHUNK_SIZE = 50; // Cloudflare D1 배치 파라미터 한도 준수

            for (const table of sortedTables) {
                // 본 DB 및 테스트 DB의 컬럼 목록 조회
                const mainColsRes = await readOnlyMainDb.prepare(`PRAGMA table_info("${table}")`).all();
                const mainCols: string[] = (mainColsRes?.results || []).map((c: any) => c.name);

                const testColsRes = await env.DB.prepare(`PRAGMA table_info("${table}")`).all();
                const testCols: string[] = (testColsRes?.results || []).map((c: any) => c.name);

                if (mainCols.length === 0 || testCols.length === 0) {
                    continue;
                }

                // 양쪽 DB에 공통으로 존재하는 컬럼 교집합 추출
                let commonCols = mainCols.filter(col => testCols.includes(col));

                // system_settings 테이블의 경우 db_name 키는 테스트 DB 고유값이므로 복제에서 제외
                let whereClause = "";
                if (table === "system_settings") {
                    whereClause = " WHERE key != 'db_name'";
                }

                // 본 DB에서 데이터 읽기 (SELECT만 허용됨)
                const selectSql = `SELECT ${commonCols.map(c => `"${c}"`).join(', ')} FROM "${table}"${whereClause}`;
                const { results: sourceRows } = await readOnlyMainDb.prepare(selectSql).all();
                const rows = sourceRows || [];

                // 테스트 DB 해당 테이블 비우기
                if (table === "system_settings") {
                    await env.DB.prepare("DELETE FROM system_settings WHERE key != 'db_name'").run();
                } else {
                    await env.DB.prepare(`DELETE FROM "${table}"`).run();
                }

                // 청크 단위로 테스트 DB에 INSERT
                if (rows.length > 0) {
                    const placeholders = commonCols.map(() => '?').join(', ');
                    const insertSql = `INSERT INTO "${table}" (${commonCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

                    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                        const chunk = rows.slice(i, i + CHUNK_SIZE);
                        const statements = chunk.map((row: any) => {
                            const values = commonCols.map(c => row[c]);
                            return env.DB.prepare(insertSql).bind(...values);
                        });
                        await env.DB.batch(statements);
                    }
                }

                // sqlite_sequence 동기화 처리
                if (syncSequences && table !== "system_settings") {
                    try {
                        // 본 DB의 sequence 조회
                        const seqRow = await readOnlyMainDb.prepare(
                            "SELECT seq FROM sqlite_sequence WHERE name = ?"
                        ).bind(table).first();

                        if (seqRow && seqRow.seq !== undefined && seqRow.seq !== null) {
                            await env.DB.prepare(
                                "INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)"
                            ).bind(table, seqRow.seq).run();
                        } else if (commonCols.includes("id")) {
                            // 본 DB에 sequence 기록이 없는 경우 id 최댓값으로 동기화
                            await env.DB.prepare(
                                `INSERT OR REPLACE INTO sqlite_sequence (name, seq) SELECT ?, COALESCE(MAX(id), 0) FROM "${table}"`
                            ).bind(table).run();
                        }
                    } catch (seqError: any) {
                        console.warn(`[Clone] Sequence sync warning for ${table}:`, seqError.message);
                    }
                }

                clonedSummary.push({ table, rowCount: rows.length });
                totalRowsCloned += rows.length;
            }

            return new Response(JSON.stringify({
                success: true,
                message: `성공적으로 ${clonedSummary.length}개 테이블(${totalRowsCloned.toLocaleString()}건)을 본 DB에서 복제했습니다.`,
                clonedTables: clonedSummary,
                totalRows: totalRowsCloned
            }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response("Method not allowed", { status: 405 });

    } catch (e: any) {
        console.error("[Clone Error]:", e);
        return new Response(JSON.stringify({ error: e.message || "Unknown clone error occurred" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
