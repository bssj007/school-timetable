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
                return "(grade = ? AND classNum = ? AND studentNumber = ?)";
            });
            excludeClause = `AND NOT (${conditions.join(" OR ")})`;
        }

        // Determine time range and bucket format
        let timeFilter = "";
        let bucketExpr: string;
        let labelFormat: string;

        switch (unit) {
            case "hour":
                timeFilter = "AND accessedAt > datetime('now', '-24 hours')";
                bucketExpr = "strftime('%Y-%m-%d %H:00', accessedAt)";
                labelFormat = "hour";
                break;
            case "day":
                timeFilter = "AND accessedAt > datetime('now', '-7 days')";
                bucketExpr = "strftime('%Y-%m-%d', accessedAt)";
                labelFormat = "day";
                break;
            case "week":
                timeFilter = "AND accessedAt > datetime('now', '-28 days')";
                bucketExpr = "strftime('%Y-W%W', accessedAt)";
                labelFormat = "week";
                break;
            case "month":
                timeFilter = "AND accessedAt > datetime('now', '-12 months')";
                bucketExpr = "strftime('%Y-%m', accessedAt)";
                labelFormat = "month";
                break;
            case "all":
            default:
                timeFilter = "";
                bucketExpr = "strftime('%Y-%m', accessedAt)";
                labelFormat = "month";
                break;
        }

        // Query 1: Unique students per bucket
        // A "student" = grade || classNum || studentNumber (string concat for uniqueness)
        const uniqueQuery = `
            SELECT 
                ${bucketExpr} as bucket,
                COUNT(DISTINCT (grade || '-' || classNum || '-' || studentNumber)) as uniqueStudents
            FROM access_logs
            WHERE grade IS NOT NULL AND classNum IS NOT NULL AND studentNumber IS NOT NULL
            ${timeFilter}
            ${excludeClause}
            GROUP BY bucket
            ORDER BY bucket ASC
        `;

        // Query 2: Total visits per bucket (excluding 기타접속)
        // A "visit" = one student accessing the site in a given hour (not every API call)
        const totalQuery = `
            SELECT 
                _bucket as bucket,
                COUNT(*) as totalVisits
            FROM (
                SELECT DISTINCT
                    ${bucketExpr} as _bucket,
                    grade, classNum, studentNumber,
                    strftime('%Y-%m-%d %H', accessedAt) as sessionHour
                FROM access_logs
                WHERE grade IS NOT NULL AND classNum IS NOT NULL AND studentNumber IS NOT NULL
                ${timeFilter}
                ${excludeClause}
            )
            GROUP BY _bucket
            ORDER BY _bucket ASC
        `;

        const uniqueBinds = [...excludeBinds];
        const totalBinds = [...excludeBinds];

        const [uniqueResult, totalResult] = await Promise.all([
            env.DB.prepare(uniqueQuery).bind(...uniqueBinds).all(),
            env.DB.prepare(totalQuery).bind(...totalBinds).all(),
        ]);

        // Merge into unified buckets
        const bucketMap = new Map<string, { label: string; uniqueStudents: number; totalVisits: number }>();

        for (const row of (uniqueResult.results || [])) {
            bucketMap.set(row.bucket as string, {
                label: row.bucket as string,
                uniqueStudents: row.uniqueStudents as number,
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
                    totalVisits: row.totalVisits as number,
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
