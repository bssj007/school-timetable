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
            excludeClause = `AND NOT (${conditions.join(" OR ")})`;
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
        // This ensures IPv6 users (and any user whose request lacked cookies) are still counted.
        const uniqueQuery = `
            SELECT 
                ${bucketExpr} as bucket,
                COUNT(DISTINCT (
                    COALESCE(al.grade, sp.grade) || '-' ||
                    COALESCE(al.classNum, sp.classNum) || '-' ||
                    COALESCE(al.studentNumber, sp.studentNumber)
                )) as uniqueStudents
            FROM access_logs al
            LEFT JOIN ip_profiles ip ON al.ip = ip.ip
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

        // Query 2: Total visits per bucket (excluding 기타접속)
        // A "visit" = one student+sessionHour combination, deduplicated.
        // Uses COALESCE so IPv6 / cookie-less requests are still counted via ip_profiles.
        const totalQuery = `
            SELECT 
                _bucket as bucket,
                COUNT(*) as totalVisits
            FROM (
                SELECT DISTINCT
                    ${bucketExpr} as _bucket,
                    COALESCE(al.grade, sp.grade) as grade,
                    COALESCE(al.classNum, sp.classNum) as classNum,
                    COALESCE(al.studentNumber, sp.studentNumber) as studentNumber,
                    strftime('%Y-%m-%d %H', al.accessedAt) as sessionHour
                FROM access_logs al
                LEFT JOIN ip_profiles ip ON al.ip = ip.ip
                LEFT JOIN student_profiles sp ON ip.student_profile_id = sp.id
                WHERE
                    COALESCE(al.grade, sp.grade) IS NOT NULL AND
                    COALESCE(al.classNum, sp.classNum) IS NOT NULL AND
                    COALESCE(al.studentNumber, sp.studentNumber) IS NOT NULL
                ${timeFilter}
                ${excludeClause}
            )
            GROUP BY _bucket
            ORDER BY _bucket ASC
        `;

        // Query 3: Unique IPs per bucket
        // Counts distinct IPs that belong to known students (via COALESCE).
        const uniqueIpQuery = `
            SELECT 
                ${bucketExpr} as bucket,
                COUNT(DISTINCT al.ip) as uniqueIPs
            FROM access_logs al
            LEFT JOIN ip_profiles ip ON al.ip = ip.ip
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

        const [uniqueResult, totalResult, ipResult] = await Promise.all([
            env.DB.prepare(uniqueQuery).bind(...uniqueBinds).all(),
            env.DB.prepare(totalQuery).bind(...totalBinds).all(),
            env.DB.prepare(uniqueIpQuery).bind(...ipBinds).all(),
        ]);

        // Merge into unified buckets
        const bucketMap = new Map<string, { label: string; uniqueStudents: number; uniqueIPs: number; totalVisits: number }>();

        for (const row of (uniqueResult.results || [])) {
            bucketMap.set(row.bucket as string, {
                label: row.bucket as string,
                uniqueStudents: row.uniqueStudents as number,
                uniqueIPs: 0,
                totalVisits: 0,
            });
        }

        for (const row of (totalResult.results || [])) {
            const existing = bucketMap.get(row.bucket as string);
            if (existing) {
                existing.totalVisits = row.totalVisits as number;
            } else {
                bucketMap.set(row.bucket as string, {
                    label: row.bucket as string,
                    uniqueStudents: 0,
                    uniqueIPs: 0,
                    totalVisits: row.totalVisits as number,
                });
            }
        }

        for (const row of (ipResult.results || [])) {
            const existing = bucketMap.get(row.bucket as string);
            if (existing) {
                existing.uniqueIPs = row.uniqueIPs as number;
            } else {
                bucketMap.set(row.bucket as string, {
                    label: row.bucket as string,
                    uniqueStudents: 0,
                    uniqueIPs: row.uniqueIPs as number,
                    totalVisits: 0,
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
