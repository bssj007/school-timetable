/**
 * Admin Password Management
 * Cloudflare Pages 환경: env.ADMIN_PASSWORD (또는 env.ADMIN_PW)
 * Node.js 환경: process.env.ADMIN_PASSWORD
 * 미설정 시 기본값 fallback
 */

export function getAdminPassword(env?: any): string {
    if (env?.ADMIN_PASSWORD) return String(env.ADMIN_PASSWORD);
    if (env?.ADMIN_PW) return String(env.ADMIN_PW);
    if (typeof process !== "undefined" && process.env?.ADMIN_PASSWORD) {
        return process.env.ADMIN_PASSWORD;
    }
    return "yourmom69";
}

export function verifyAdminPassword(input: string | null | undefined, env?: any): boolean {
    if (!input) return false;
    return input === getAdminPassword(env);
}

// 하위 호환성 및 Node.js용 정적 변수
export const adminPassword = typeof process !== "undefined" && process.env?.ADMIN_PASSWORD 
    ? process.env.ADMIN_PASSWORD 
    : "yourmom69";
