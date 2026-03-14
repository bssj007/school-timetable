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
            excludeClause = `AND NOT (${conditions.join(" OR ")})`;
        }

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

        // Uses a single optimized query with Conditional Aggregation instead of 4 separate queries
        // Uses CTE to ensure 1:1 join with ip_profiles (takes the most recently seen student per IP) to prevent JOIN explosion
        // Ranks IP profiles ONLY for IPs that appear in the time-filtered access logs (massive optimization for rows read)
        const unifiedQuery = `
            WITH FilteredLogs AS (
                SELECT 
                    ${bucketExpr} as bucket,
                    al.accessedAt,
                    al.ip,
                    al.grade as al_grade,
                    al.classNum as al_classNum,
                    al.studentNumber as al_studentNumber
                FROM access_logs al
                WHERE al.method = 'GET' 
                  AND al.endpoint IN ('/', '/index.html')
                  ${timeFilter}
            ),
            RankedIPs AS (
                SELECT 
                    ip, 
                    student_profile_id, 
                    ROW_NUMBER() OVER(PARTITION BY LOWER(ip) ORDER BY lastAccess DESC) as rn
                FROM ip_profiles
                WHERE LOWER(ip) IN (SELECT DISTINCT LOWER(ip) FROM FilteredLogs)
            ),
            LatestIPs AS (
                SELECT LOWER(ip) as ip_lower, student_profile_id 
                FROM RankedIPs 
                WHERE rn = 1
            ),
            JoinedData AS (
                SELECT 
                    fl.bucket,
                    COALESCE(fl.al_grade, sp.grade) as final_grade,
                    COALESCE(fl.al_classNum, sp.classNum) as final_classNum,
                    COALESCE(fl.al_studentNumber, sp.studentNumber) as final_studentNumber,
                    LOWER(fl.ip) as ip_lower,
                    strftime('%Y-%m-%d %H:', datetime(fl.accessedAt, '+9 hours')) || (CAST(strftime('%M', datetime(fl.accessedAt, '+9 hours')) AS INTEGER) / 10) as session10Min
                FROM FilteredLogs fl
                LEFT JOIN LatestIPs ip ON LOWER(fl.ip) = ip.ip_lower
                LEFT JOIN student_profiles sp ON ip.student_profile_id = sp.id
            )
            SELECT 
                bucket as label,
                
                -- Unique Students
                COUNT(DISTINCT (final_grade || '-' || final_classNum || '-' || final_studentNumber)) as uniqueStudents,
                
                -- Unique IPs
                COUNT(DISTINCT ip_lower) as uniqueIPs,
                
                -- Total Visits (Student Sessions)
                COUNT(DISTINCT (final_grade || '-' || final_classNum || '-' || final_studentNumber || '-' || session10Min)) as totalVisitsStudent,
                
                -- Total Visits (IP Sessions)
                COUNT(DISTINCT (ip_lower || '-' || session10Min)) as totalVisitsIP
                
            FROM JoinedData
            WHERE final_grade IS NOT NULL 
              AND final_classNum IS NOT NULL 
              AND final_studentNumber IS NOT NULL
              ${excludeClause}
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
