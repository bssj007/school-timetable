import { adminPassword } from "../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    const password = request.headers.get("X-Admin-Password");
    if (password !== adminPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "Database configuration missing" }), { status: 500 });
    }

    if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const url = new URL(request.url);
        const unit = url.searchParams.get("unit") || "day"; // hour | day | week | month | all
        const excludeParam = url.searchParams.get("exclude") || "";
        const startDate = url.searchParams.get("startDate");
        const endDate = url.searchParams.get("endDate");

        // Parse exclude list: "2101,2305" → [{grade:2,classNum:1,studentNumber:1}, ...]
        const excludeIds = excludeParam
            .split(",")
            .map(s => s.trim())
            .filter(s => /^\d{4,5}$/.test(s));

        // Build exclude WHERE clause fragments
        let excludeClause = "";
        const excludeBinds: any[] = [];
        if (excludeIds.length > 0) {
            const conditions = excludeIds.map(id => {
                const g = parseInt(id[0]);
                const c = parseInt(id[1]);
                const n = parseInt(id.slice(2));
                excludeBinds.push(g, c, n);
                return "(final_grade = ? AND final_classNum = ? AND final_studentNumber = ?)";
            });
            excludeClause = `AND (final_grade IS NULL OR NOT (${conditions.join(" OR ")}))`;
        }

        // 컬럼 보장
        try { await env.DB.prepare("ALTER TABLE access_logs ADD COLUMN teacherName TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE ip_profiles ADD COLUMN teacherName TEXT").run(); } catch (_) {}

        // Determine time range and bucket format
        let timeFilter = "";
        let bucketExpr: string;
        let labelFormat: string;

        // Custom start/end dates handling overrides default relative windows
        let customDateFilter = "";
        if (startDate && endDate) {
            // Include entire end date by adding 1 day (assumes endDate is YYYY-MM-DD format)
            customDateFilter = `AND datetime(al.accessedAt, '+9 hours') >= datetime('${startDate}') AND datetime(al.accessedAt, '+9 hours') < datetime('${endDate}', '+1 day')`;
        }

        switch (unit) {
            case "hour":
                timeFilter = customDateFilter || "AND datetime(al.accessedAt, '+9 hours') > datetime('now', '+9 hours', '-24 hours')";
                bucketExpr = "strftime('%Y-%m-%d %H:00', datetime(al.accessedAt, '+9 hours'))";
                labelFormat = "hour";
                break;
            case "day":
                timeFilter = customDateFilter || "AND datetime(al.accessedAt, '+9 hours') > datetime('now', '+9 hours', '-7 days')";
                bucketExpr = "strftime('%Y-%m-%d', datetime(al.accessedAt, '+9 hours'))";
                labelFormat = "day";
                break;
            case "week":
                timeFilter = customDateFilter || "AND datetime(al.accessedAt, '+9 hours') > datetime('now', '+9 hours', '-28 days')";
                bucketExpr = "strftime('%Y-W%W', datetime(al.accessedAt, '+9 hours'))";
                labelFormat = "week";
                break;
            case "month":
                timeFilter = customDateFilter || "AND datetime(al.accessedAt, '+9 hours') > datetime('now', '+9 hours', '-12 months')";
                bucketExpr = "strftime('%Y-%m', datetime(al.accessedAt, '+9 hours'))";
                labelFormat = "month";
                break;
            case "all":
            default:
                timeFilter = customDateFilter || "";
                bucketExpr = "strftime('%Y-%m', datetime(al.accessedAt, '+9 hours'))";
                labelFormat = "month";
                break;
        }

        // 학생(Student), 교사(Teacher), 기타(Other) 3계층 아키텍처 적용
        const unifiedQuery = `
            WITH FilteredLogs AS (
                SELECT 
                    ${bucketExpr} as bucket,
                    al.accessedAt,
                    al.ip,
                    al.grade as al_grade,
                    al.classNum as al_classNum,
                    al.studentNumber as al_studentNumber,
                    al.teacherName as al_teacherName
                FROM access_logs al
                WHERE al.method = 'GET' 
                  AND al.endpoint IN ('/', '/index.html')
                  ${timeFilter}
            ),
            RankedIPs AS (
                SELECT 
                    ip, 
                    student_profile_id, 
                    teacherName as ip_teacherName,
                    ROW_NUMBER() OVER(PARTITION BY LOWER(ip) ORDER BY lastAccess DESC) as rn
                FROM ip_profiles
                WHERE LOWER(ip) IN (SELECT DISTINCT LOWER(ip) FROM FilteredLogs)
            ),
            LatestIPs AS (
                SELECT LOWER(ip) as ip_lower, student_profile_id, ip_teacherName 
                FROM RankedIPs 
                WHERE rn = 1
            ),
            JoinedData AS (
                SELECT 
                    fl.bucket,
                    NULLIF(TRIM(COALESCE(fl.al_teacherName, ip.ip_teacherName, '')), '') as final_teacher,
                    COALESCE(fl.al_grade, sp.grade) as final_grade,
                    COALESCE(fl.al_classNum, sp.classNum) as final_classNum,
                    COALESCE(fl.al_studentNumber, sp.studentNumber) as final_studentNumber,
                    COALESCE(sp.name, '') as final_name,
                    LOWER(fl.ip) as ip_lower,
                    strftime('%Y-%m-%d %H:', datetime(fl.accessedAt, '+9 hours')) || (CAST(strftime('%M', datetime(fl.accessedAt, '+9 hours')) AS INTEGER) / 10) as session10Min
                FROM FilteredLogs fl
                LEFT JOIN LatestIPs ip ON LOWER(fl.ip) = ip.ip_lower
                LEFT JOIN student_profiles sp ON ip.student_profile_id = sp.id
            ),
            CategorizedData AS (
                SELECT 
                    bucket,
                    ip_lower,
                    session10Min,
                    CASE 
                        WHEN final_teacher IS NOT NULL THEN 'teacher'
                        WHEN final_grade IS NOT NULL AND final_classNum IS NOT NULL THEN 'student'
                        ELSE 'other'
                    END as category,
                    final_teacher as teacherId,
                    (COALESCE(final_grade, '') || '-' || COALESCE(final_classNum, '') || '-' || COALESCE(final_studentNumber, 0) || '-' || final_name) as studentId
                FROM JoinedData
                WHERE 1=1 ${excludeClause}
            )
            SELECT 
                bucket as label,
                
                -- 고유 학생 (파랑)
                COUNT(DISTINCT CASE WHEN category = 'student' THEN studentId END) as students,
                
                -- 고유 교사 (초록)
                COUNT(DISTINCT CASE WHEN category = 'teacher' THEN teacherId END) as teachers,
                
                -- 고유 기타 (회색)
                COUNT(DISTINCT CASE WHEN category = 'other' THEN ip_lower END) as others,
                
                -- 총 학생 접속 횟수 (10분 세션)
                COUNT(DISTINCT CASE WHEN category = 'student' THEN (studentId || '-' || session10Min) END) as studentVisits,
                
                -- 총 교사 접속 횟수 (10분 세션)
                COUNT(DISTINCT CASE WHEN category = 'teacher' THEN (teacherId || '-' || session10Min) END) as teacherVisits,
                
                -- 총 기타 접속 횟수 (10분 세션)
                COUNT(DISTINCT CASE WHEN category = 'other' THEN (ip_lower || '-' || session10Min) END) as otherVisits,
                
                -- 구버전 호환 필드
                COUNT(DISTINCT CASE WHEN category = 'student' THEN studentId END) as uniqueStudents,
                COUNT(DISTINCT ip_lower) as uniqueIPs,
                COUNT(DISTINCT CASE WHEN category = 'student' THEN (studentId || '-' || session10Min) END) as totalVisitsStudent,
                COUNT(DISTINCT (ip_lower || '-' || session10Min)) as totalVisitsIP
                
            FROM CategorizedData
            GROUP BY bucket
            ORDER BY bucket ASC
        `;

        const result = await env.DB.prepare(unifiedQuery).bind(...excludeBinds).all();
        
        const buckets = result.results || [];

        return new Response(JSON.stringify({ buckets, unit: labelFormat }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
    }
};
