// functions/lib/webPush.ts
// Pure Web Crypto API implementation of RFC 8291 (Message Encryption for Web Push) & RFC 8292 (VAPID)
// Compatible with Cloudflare Workers / Cloudflare Pages and Node.js 18+

export const DEFAULT_VAPID_PUBLIC_KEY =
    "BGhRyV8sLTVNkaVOgJDVulv0aMNOpCljPB4Bv2EEqBBvTJWfTeSwB7t_Kj9VA7N2mQTPfnNUczO51ZQGVm3VE3E";

export const DEFAULT_VAPID_PRIVATE_KEY =
    "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQge_cnzDXXNoth-JgoMtEwBYMKtEM0bmKOj1MGxQ-wN6qhRANCAARoUclfLC01TZGlToCQ1bpb9GjDTqQpYzweAb9hBKgQb0yVn03ksAe7fyo_VQOzdpkEz35zVHMzudWUBlZt1RNx";

export const DEFAULT_VAPID_SUBJECT = "mailto:admin@sungji.school";

export interface PushSubscriptionJson {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export interface VapidConfig {
    publicKey?: string;
    privateKey?: string;
    subject?: string;
}

export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export function base64UrlDecode(str: string): Uint8Array {
    const padded = str + "===".slice(0, (4 - (str.length % 4)) % 4);
    const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * VAPID JWT 발급 (RFC 8292 ES256)
 */
export async function createVapidJwt(
    audience: string,
    subject: string,
    privateKeyBase64: string
): Promise<string> {
    const header = { typ: "JWT", alg: "ES256" };
    const payload = {
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        sub: subject
    };

    const encHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const unsignedToken = `${encHeader}.${encPayload}`;

    const pkcs8Bytes = base64UrlDecode(privateKeyBase64);
    const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        pkcs8Bytes as any,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        privateKey,
        new TextEncoder().encode(unsignedToken)
    );

    return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

/**
 * RFC 8291 페이로드 암호화 (Content-Encoding: aes128gcm)
 */
export async function encryptWebPushPayload(
    subscription: PushSubscriptionJson,
    payloadText: string
): Promise<Uint8Array> {
    const p256dhBytes = base64UrlDecode(subscription.keys.p256dh);
    const authBytes = base64UrlDecode(subscription.keys.auth);

    // 1. 16바이트 솔트 생성
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // 2. 일회용 로컬 ECDH P-256 키 쌍 생성
    const localKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
    );
    const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));

    // 3. 수신자 공개키 임포트
    const subscriberKey = await crypto.subtle.importKey(
        "raw",
        p256dhBytes as any,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
    );

    // 4. ECDH 공유 비밀키 유도
    const sharedSecret = await crypto.subtle.deriveBits(
        { name: "ECDH", public: subscriberKey },
        localKeyPair.privateKey,
        256
    );

    // 5. RFC 8291에 따른 HKDF 키 유도
    // auth_info = "WebPush: info\0" || subscriberPublicKey || localPublicKey
    const authInfo = new Uint8Array(14 + p256dhBytes.length + localPublicKeyRaw.length);
    authInfo.set(new TextEncoder().encode("WebPush: info\0"), 0);
    authInfo.set(p256dhBytes, 14);
    authInfo.set(localPublicKeyRaw, 14 + p256dhBytes.length);

    const sharedSecretKey = await crypto.subtle.importKey(
        "raw",
        sharedSecret as any,
        { name: "HKDF" },
        false,
        ["deriveBits"]
    );

    // PRK = HKDF-Extract(salt = authBytes, IKM = sharedSecret)
    const ikm = await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: authBytes as any, info: authInfo as any },
        sharedSecretKey,
        256
    );

    const ikmKey = await crypto.subtle.importKey(
        "raw",
        ikm as any,
        { name: "HKDF" },
        false,
        ["deriveBits", "deriveKey"]
    );

    // CEK (Content Encryption Key): 16바이트 AES-GCM 키
    const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
    const cekKey = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: salt as any, info: cekInfo as any },
        ikmKey,
        { name: "AES-GCM", length: 128 },
        false,
        ["encrypt"]
    );

    // Nonce: 12바이트 IV
    const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
    const nonce = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: salt as any, info: nonceInfo as any },
        ikmKey,
        96 // 12 bytes
    ));

    // 6. 패딩: RFC 8291 섹션 3.1: 레코드 끝에 구분자 0x02 추가
    const plaintextBytes = new TextEncoder().encode(payloadText);
    const padded = new Uint8Array(plaintextBytes.length + 1);
    padded.set(plaintextBytes, 0);
    padded[plaintextBytes.length] = 2; // delimiter

    // 7. AES-128-GCM 암호화
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce as any, tagLength: 128 },
        cekKey,
        padded as any
    ));

    // 8. aes128gcm 바이너리 헤더 및 바디 구성
    // salt(16) || rs(4) || idlen(1) || localKey(65) || ciphertext
    const rs = 4096;
    const body = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length + ciphertext.length);
    body.set(salt, 0);
    new DataView(body.buffer).setUint32(16, rs, false); // big endian
    body[20] = localPublicKeyRaw.length;
    body.set(localPublicKeyRaw, 21);
    body.set(ciphertext, 21 + localPublicKeyRaw.length);

    return body;
}

/**
 * 단일 구독 기기로 Web Push 알림 발송 (Google/Apple/Mozilla 게이트웨이)
 */
export async function sendWebPushNotification(
    subscription: PushSubscriptionJson,
    payload: any,
    vapidConfig?: VapidConfig
): Promise<{ success: boolean; status?: number; error?: string; shouldDeactivate?: boolean }> {
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return { success: false, error: "Invalid subscription", shouldDeactivate: true };
    }

    try {
        const publicKey = vapidConfig?.publicKey || DEFAULT_VAPID_PUBLIC_KEY;
        const privateKey = vapidConfig?.privateKey || DEFAULT_VAPID_PRIVATE_KEY;
        const subject = vapidConfig?.subject || DEFAULT_VAPID_SUBJECT;

        const endpointUrl = new URL(subscription.endpoint);
        const audience = endpointUrl.origin;

        // VAPID JWT 토큰 서명
        const jwt = await createVapidJwt(audience, subject, privateKey);

        // 페이로드 직렬화 및 RFC 8291 암호화
        const payloadText = typeof payload === "string" ? payload : JSON.stringify(payload);
        const encryptedBody = await encryptWebPushPayload(subscription, payloadText);

        const res = await fetch(subscription.endpoint, {
            method: "POST",
            headers: {
                "TTL": "86400",
                "Urgency": "high",
                "Content-Type": "application/octet-stream",
                "Content-Encoding": "aes128gcm",
                "Authorization": `vapid t=${jwt}, k=${publicKey}`
            },
            body: encryptedBody
        });

        // 201 Created 또는 200 OK 또는 202 Accepted
        if (res.status === 201 || res.status === 200 || res.status === 202) {
            return { success: true, status: res.status };
        }

        // 410 Gone or 404 Not Found: 사용자가 알림 차단했거나 기기 구독 만료됨
        if (res.status === 410 || res.status === 404) {
            return { success: false, status: res.status, shouldDeactivate: true, error: "Subscription expired or revoked" };
        }

        const errorText = await res.text().catch(() => "");
        return { success: false, status: res.status, error: `Gateway returned ${res.status}: ${errorText.slice(0, 100)}` };
    } catch (e: any) {
        return { success: false, error: e.message || String(e) };
    }
}
