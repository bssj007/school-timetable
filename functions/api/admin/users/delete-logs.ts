import { verifyAdminPassword } from "../../../../server/adminPW";

export const onRequest = async (context: any) => {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response("Method not allowed", { status: 405 });
    }

    const authHeader = request.headers.get('X-Admin-Password');
    if (!verifyAdminPassword(authHeader, env)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    try {
        const body = await request.json();
        const rawIps = Array.isArray(body?.ips) ? body.ips : [body?.ip];
        const ips: string[] = rawIps
            .filter(Boolean)
            .map((ip: any) => String(ip).trim())
            .filter((ip: string) => ip.length > 0);

        if (ips.length === 0) {
            return new Response(JSON.stringify({ error: "Missing IP address(es)" }), { status: 400 });
        }

        const statements = [];
        for (const ip of ips) {
            const cleanIpv4 = ip.replace(/^::ffff:/i, '');
            // access_logs 및 ip_profiles에서 해당 IP 관련 기록 일괄 삭제
            statements.push(
                env.DB.prepare(
                    "DELETE FROM access_logs WHERE ip = ? OR LOWER(TRIM(ip)) = ? OR LOWER(TRIM(ip)) = ?"
                ).bind(ip, ip.toLowerCase(), cleanIpv4.toLowerCase())
            );
            statements.push(
                env.DB.prepare(
                    "DELETE FROM ip_profiles WHERE ip = ? OR LOWER(TRIM(ip)) = ? OR LOWER(TRIM(ip)) = ?"
                ).bind(ip, ip.toLowerCase(), cleanIpv4.toLowerCase())
            );
        }

        // D1 batch 실행 (배치당 최대 100문장)
        for (let i = 0; i < statements.length; i += 100) {
            await env.DB.batch(statements.slice(i, i + 100));
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: `${ips.length}개 IP의 로그 및 프로필 기록이 삭제되었습니다.`,
            deletedIps: ips 
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        console.error("[Delete Logs Error]:", e);
        return new Response(JSON.stringify({ error: e.message || "Failed to delete logs" }), { status: 500 });
    }
};
