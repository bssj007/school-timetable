// server/lib/webPush.ts
// Pure Web Crypto API implementation of RFC 8291 (Message Encryption for Web Push) & RFC 8292 (VAPID)
// For Node.js Express server

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
        exp: Math.floor(Date.now() / 1000) + 86400,
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

    const salt = crypto.getRandomValues(new Uint8Array(16));

    const localKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
    );
    const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));

    const subscriberKey = await crypto.subtle.importKey(
        "raw",
        p256dhBytes as any,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
    );

    const sharedSecret = await crypto.subtle.deriveBits(
        { name: "ECDH", public: subscriberKey },
        localKeyPair.privateKey,
        256
    );

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

    const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
    const cekKey = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: salt as any, info: cekInfo as any },
        ikmKey,
        { name: "AES-GCM", length: 128 },
        false,
        ["encrypt"]
    );

    const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
    const nonce = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: salt as any, info: nonceInfo as any },
        ikmKey,
        96
    ));

    const plaintextBytes = new TextEncoder().encode(payloadText);
    const padded = new Uint8Array(plaintextBytes.length + 1);
    padded.set(plaintextBytes, 0);
    padded[plaintextBytes.length] = 2;

    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce as any, tagLength: 128 },
        cekKey,
        padded as any
    ));

    const rs = 4096;
    const body = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length + ciphertext.length);
    body.set(salt, 0);
    new DataView(body.buffer).setUint32(16, rs, false);
    body[20] = localPublicKeyRaw.length;
    body.set(localPublicKeyRaw, 21);
    body.set(ciphertext, 21 + localPublicKeyRaw.length);

    return body;
}

/**
 * 단일 구독 기기로 Web Push 알림 발송 (Google/Apple/Mozilla 게이트웨이)
 */
export async function sendWebPushNotification(
    subscription: PushSubscriptionJson | string,
    payload: any,
    vapidConfig?: VapidConfig
): Promise<{ success: boolean; status?: number; error?: string; shouldDeactivate?: boolean }> {
    let sub: PushSubscriptionJson = subscription as any;
    if (typeof subscription === "string") {
        try {
            sub = JSON.parse(subscription);
        } catch (_) {
            return { success: false, error: "Malformed subscription JSON", shouldDeactivate: false };
        }
    }

    if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return { success: false, error: "Invalid subscription format", shouldDeactivate: false };
    }

    try {
        const publicKey = vapidConfig?.publicKey || process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
        const privateKey = vapidConfig?.privateKey || process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
        const subject = vapidConfig?.subject || process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

        const endpointUrl = new URL(sub.endpoint);
        const audience = endpointUrl.origin;

        const jwt = await createVapidJwt(audience, subject, privateKey);

        const payloadText = typeof payload === "string" ? payload : JSON.stringify(payload);
        const encryptedBody = await encryptWebPushPayload(sub, payloadText);

        const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
                "TTL": "86400",
                "Urgency": "high",
                "Content-Type": "application/octet-stream",
                "Content-Encoding": "aes128gcm",
                "Authorization": `vapid t=${jwt}, k=${publicKey}`
            },
            body: encryptedBody as any
        });

        if (res.status === 201 || res.status === 200 || res.status === 202) {
            return { success: true, status: res.status };
        }

        if (res.status === 410 || res.status === 404) {
            return { success: false, status: res.status, shouldDeactivate: true, error: "Subscription expired or revoked" };
        }

        const errorText = await res.text().catch(() => "");
        return { success: false, status: res.status, error: `Gateway returned ${res.status}: ${errorText.slice(0, 100)}` };
    } catch (e: any) {
        return { success: false, error: e.message || String(e) };
    }
}
