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
                return "(COALESCE(al.grade, sp.grade) = ? AND COALESCE(al.classNum, sp.classNum) = ? AND COALESCE(al.studentNumber, sp.studentNumber) = ?)";
            });
            // Ensure anonymous IPs (NULL grade) are not stripped by NOT (NULL=val) evaluating to NULL
            excludeClause = `AND (COALESCE(al.grade, sp.grade) IS NULL OR NOT (${conditions.join(" OR ")}))`;
        }

        // Determine time range and bucket format
        let timeFilter = "";
        let bucketExpr: string;
        let labelFormat: string;

        switch (unit) {
            case "hour":
                timeFilter = "AND al.accessedAt > datetime('now', '-24 hours')";
                bucketExpr = "strftime('%Y-%m-%d %H:00', al.accessedAt)";
                labelFormat = "hour";
                break;
            case "day":
                timeFilter = "AND al.accessedAt > datetime('now', '-7 days')";
                bucketExpr = "strftime('%Y-%m-%d', al.accessedAt)";
                labelFormat = "day";
                break;
            case "week":
                timeFilter = "AND al.accessedAt > datetime('now', '-28 days')";
                bucketExpr = "strftime('%Y-W%W', al.accessedAt)";
                labelFormat = "week";
                break;
            case "month":
                timeFilter = "AND al.accessedAt > datetime('now', '-12 months')";
                bucketExpr = "strftime('%Y-%m', al.accessedAt)";
                labelFormat = "month";
                break;
            case "all":
            default:
                timeFilter = "";
                bucketExpr = "strftime('%Y-%m', al.accessedAt)";
                labelFormat = "month";
                break;
        }

        // Query 1: Unique students per bucket
        // Uses COALESCE to fill NULL grade/classNum/studentNumber from ip_profile → student_profile
        // Uses CTE to ensure 1:1 join with ip_profiles (takes the most recently seen student per IP) to prevent JOIN explosion
        const uniqueQuery = `
            WITH RankedIPs AS (
                SELECT ip, student_profile_id, ROW_NUMBER() OVER(PARTITION BY ip ORDER BY last_seen DESC) as rn
                FROM ip_profiles
            ),
            LatestIPs AS (
                SELECT ip, student_profile_id FROM RankedIPs WHERE rn = 1
            )
            SELECT 
                ${bucketExpr} as bucket,
                COUNT(DISTINCT (
                    COALESCE(al.grade, sp.grade) || '-' ||
                    COALESCE(al.classNum, sp.classNum) || '-' ||
                    COALESCE(al.studentNumber, sp.studentNumber)
                )) as uniqueStudents
            FROM access_logs al
            LEFT JOIN LatestIPs ip ON al.ip = ip.ip
            LEFT JOIN student_profiles sp ON ip.student_profile_id = sp.id
            WHERE
                COALESCE(al.grade, sp.grade) IS NOT NULL AND
                COALESCE(al.classNum, sp.classNum) IS NOT NULL AND
                COALESCE(al.studentNumber, sp.studentNumber) IS NOT NULL
            ${timeFilter}
            ${excludeClause}
            GROUP BY bucket
            ORDER BY bucket ASC
        `;

        // Query 2: Total visits per bucket (Student-based)
        // Counts all GET accesses to the main page that resolve to a student profile.
        const totalStudentQuery = `
            WITH RankedIPs AS (
                SELECT ip, student_profile_id, ROW_NUMBER() OVER(PARTITION BY ip ORDER BY last_seen DESC) as rn
                FROM ip_profiles
            ),
            LatestIPs AS (
                SELECT ip, student_profile_id FROM RankedIPs WHERE rn = 1
            )
            SELECT 
                _bucket as bucket,
                COUNT(*) as totalVisitsStudent
            FROM (
                SELECT DISTINCT
                    ${bucketExpr} as _bucket,
                    COALESCE(al.grade, sp.grade) as grade,
                    COALESCE(al.classNum, sp.classNum) as classNum,
                    COALESCE(al.studentNumber, sp.studentNumber) as studentNumber,
                    strftime('%Y-%m-%d %H:', al.accessedAt) || (CAST(strftime('%M', al.accessedAt) AS INTEGER) / 10) as session10Min
                FROM access_logs al
                LEFT JOIN LatestIPs ip ON al.ip = ip.ip
                LEFT JOIN student_profiles sp ON ip.student_profile_id = sp.id
                WHERE
                    al.method = 'GET' AND al.endpoint IN ('/', '/index.html') AND
                    COALESCE(al.grade, sp.grade) IS NOT NULL AND
                    COALESCE(al.classNum, sp.classNum) IS NOT NULL AND
                    COALESCE(al.studentNumber, sp.studentNumber) IS NOT NULL
                ${timeFilter}
                ${excludeClause}
            )
            GROUP BY _bucket
            ORDER BY _bucket ASC
        `;

        // Query 2.5: Total visits per bucket (IP-based)
        // Counts all GET accesses to the main page regardless of student profile mapping.
        const totalIpQuery = `
            WITH RankedIPs AS (
                SELECT ip, student_profile_id, ROW_NUMBER() OVER(PARTITION BY ip ORDER BY last_seen DESC) as rn
                FROM ip_profiles
            ),
            LatestIPs AS (
                SELECT ip, student_profile_id FROM RankedIPs WHERE rn = 1
            )
            SELECT 
                _bucket as bucket,
                COUNT(*) as totalVisitsIP
            FROM (
                SELECT DISTINCT
                    ${bucketExpr} as _bucket,
                    al.ip,
                    strftime('%Y-%m-%d %H:', al.accessedAt) || (CAST(strftime('%M', al.accessedAt) AS INTEGER) / 10) as session10Min
                FROM access_logs al
                LEFT JOIN LatestIPs ip ON al.ip = ip.ip
                LEFT JOIN student_profiles sp ON ip.student_profile_id = sp.id
                WHERE
                    al.method = 'GET' AND al.endpoint IN ('/', '/index.html')
                ${timeFilter}
                ${excludeClause}
            )
            GROUP BY _bucket
            ORDER BY _bucket ASC
        `;

        // Query 3: Unique IPs per bucket
        // Uses CTE for ip_profiles to prevent JOIN explosion.
        const uniqueIpQuery = `
            WITH RankedIPs AS (
                SELECT ip, student_profile_id, ROW_NUMBER() OVER(PARTITION BY ip ORDER BY last_seen DESC) as rn
                FROM ip_profiles
            ),
            LatestIPs AS (
                SELECT ip, student_profile_id FROM RankedIPs WHERE rn = 1
            )
            SELECT 
                ${bucketExpr} as bucket,
                COUNT(DISTINCT al.ip) as uniqueIPs
            FROM access_logs al
            LEFT JOIN LatestIPs ip ON al.ip = ip.ip
            LEFT JOIN student_profiles sp ON ip.student_profile_id = sp.id
            WHERE
                COALESCE(al.grade, sp.grade) IS NOT NULL AND
                COALESCE(al.classNum, sp.classNum) IS NOT NULL AND
                COALESCE(al.studentNumber, sp.studentNumber) IS NOT NULL
            ${timeFilter}
            ${excludeClause}
            GROUP BY bucket
            ORDER BY bucket ASC
        `;

        const uniqueBinds = [...excludeBinds];
        const totalBinds = [...excludeBinds];
        const ipBinds = [...excludeBinds];

        const [uniqueResult, totalStudentResult, totalIpResult, uniqueIpResult] = await Promise.all([
            env.DB.prepare(uniqueQuery).bind(...uniqueBinds).all(),
            env.DB.prepare(totalStudentQuery).bind(...totalBinds).all(),
            env.DB.prepare(totalIpQuery).bind(...totalBinds).all(),
            env.DB.prepare(uniqueIpQuery).bind(...ipBinds).all(),
        ]);

        // Merge into unified buckets
        const bucketMap = new Map<string, { label: string; uniqueStudents: number; uniqueIPs: number; totalVisitsStudent: number; totalVisitsIP: number }>();

        for (const row of (uniqueResult.results || [])) {
            bucketMap.set(row.bucket as string, {
                label: row.bucket as string,
                uniqueStudents: row.uniqueStudents as number,
                uniqueIPs: 0,
                totalVisitsStudent: 0,
                totalVisitsIP: 0,
            });
        }

        for (const row of (totalStudentResult.results || [])) {
            const existing = bucketMap.get(row.bucket as string);
            if (existing) {
                existing.totalVisitsStudent = row.totalVisitsStudent as number;
            } else {
                bucketMap.set(row.bucket as string, {
                    label: row.bucket as string,
                    uniqueStudents: 0,
                    uniqueIPs: 0,
                    totalVisitsStudent: row.totalVisitsStudent as number,
                    totalVisitsIP: 0,
                });
            }
        }

        for (const row of (totalIpResult.results || [])) {
            const existing = bucketMap.get(row.bucket as string);
            if (existing) {
                existing.totalVisitsIP = row.totalVisitsIP as number;
            } else {
                bucketMap.set(row.bucket as string, {
                    label: row.bucket as string,
                    uniqueStudents: 0,
                    uniqueIPs: 0,
                    totalVisitsStudent: 0,
                    totalVisitsIP: row.totalVisitsIP as number,
                });
            }
        }

        for (const row of (uniqueIpResult.results || [])) {
            const existing = bucketMap.get(row.bucket as string);
            if (existing) {
                existing.uniqueIPs = row.uniqueIPs as number;
            } else {
                bucketMap.set(row.bucket as string, {
                    label: row.bucket as string,
                    uniqueStudents: 0,
                    uniqueIPs: row.uniqueIPs as number,
                    totalVisitsStudent: 0,
                    totalVisitsIP: 0,
                });
            }
        }

        const buckets = Array.from(bucketMap.values()).sort((a, b) => a.label.localeCompare(b.label));

        return new Response(JSON.stringify({ buckets, unit: labelFormat }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
    }
};
