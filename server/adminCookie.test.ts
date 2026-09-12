import { describe, it, expect, beforeEach } from 'vitest';
import {
    ADMIN_COOKIE_NAME,
    ADMIN_COOKIE_MAX_AGE,
    getAdminPasswordCookie,
    setAdminPasswordCookie,
    clearAdminPasswordCookie
} from '../client/src/lib/adminCookie';

describe('adminCookie utility', () => {
    let mockCookies: { [key: string]: string } = {};

    beforeEach(() => {
        mockCookies = {};
        // Mock document.cookie
        Object.defineProperty(globalThis, 'document', {
            value: {
                get cookie() {
                    return Object.entries(mockCookies)
                        .map(([k, v]) => `${k}=${v}`)
                        .join('; ');
                },
                set cookie(val: string) {
                    const [pair, ...directives] = val.split(';');
                    const [k, v] = pair.split('=');
                    const isExpired = directives.some(d => d.trim().startsWith('max-age=0') || d.trim().includes('1970'));
                    if (isExpired) {
                        delete mockCookies[k.trim()];
                    } else {
                        mockCookies[k.trim()] = v;
                    }
                }
            },
            configurable: true,
            writable: true
        });
    });

    it('has 1-day max-age constant (86400 seconds)', () => {
        expect(ADMIN_COOKIE_MAX_AGE).toBe(86400);
        expect(ADMIN_COOKIE_NAME).toBe('admin_password');
    });

    it('returns null when cookie is not set', () => {
        expect(getAdminPasswordCookie()).toBeNull();
    });

    it('saves and retrieves password from 1-day cookie', () => {
        setAdminPasswordCookie('testAdmin123');
        expect(getAdminPasswordCookie()).toBe('testAdmin123');
    });

    it('handles special characters in password properly', () => {
        const specialPw = 'p@ss=w;ord#123! &*()';
        setAdminPasswordCookie(specialPw);
        expect(getAdminPasswordCookie()).toBe(specialPw);
    });

    it('clears the cookie', () => {
        setAdminPasswordCookie('testAdmin123');
        expect(getAdminPasswordCookie()).toBe('testAdmin123');
        clearAdminPasswordCookie();
        expect(getAdminPasswordCookie()).toBeNull();
    });

    it('supports backwards-compatible sj_admin_password fallback', () => {
        mockCookies['sj_admin_password'] = encodeURIComponent('legacySecret');
        expect(getAdminPasswordCookie()).toBe('legacySecret');
    });
});
