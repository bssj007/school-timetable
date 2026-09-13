// functions/api/app/version.ts
// 안드로이드 앱 전용 최신 버전 및 업데이트 정책(권장/의무) 조회 엔드포인트

export const onRequest = async (context: any) => {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database configuration missing' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    try {
        const rows = await env.DB.prepare(`
            SELECT key, value FROM system_settings 
            WHERE key IN (
                'android_update_enabled',
                'android_update_type',
                'android_latest_version_code',
                'android_latest_version_name',
                'android_min_version_code',
                'android_update_title',
                'android_update_notes',
                'play_store_url',
                'apk_download_url'
            )
        `).all();

        const settings: Record<string, string> = {};
        if (rows && rows.results) {
            rows.results.forEach((row: any) => {
                settings[row.key] = row.value;
            });
        }

        const enabled = settings['android_update_enabled'] === 'true' || settings['android_update_enabled'] === '1';
        const type = settings['android_update_type'] === 'mandatory' ? 'mandatory' : 'recommended';
        const latestVersionCode = parseInt(settings['android_latest_version_code'] || '5', 10);
        const latestVersionName = settings['android_latest_version_name'] || '1.0.4';
        const minVersionCode = parseInt(settings['android_min_version_code'] || '3', 10);
        const title = settings['android_update_title'] || '새로운 버전 업데이트 안내';
        const notes = settings['android_update_notes'] || '• 푸시/배지/헤드업 배너 알림 수신 기능 개선\n• 앱 접속 안정성 향상';
        const playStoreUrl = settings['play_store_url'] || 'https://play.google.com/store/apps/details?id=com.seongjisuhaeng.app';
        const apkDownloadUrl = settings['apk_download_url'] || '';

        const payload = {
            enabled,
            type,
            latest_version_code: latestVersionCode,
            latest_version_name: latestVersionName,
            min_version_code: minVersionCode,
            title,
            notes,
            play_store_url: playStoreUrl,
            apk_download_url: apkDownloadUrl,
            timestamp: Date.now()
        };

        return new Response(JSON.stringify(payload), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=60',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            error: error.message || 'Failed to fetch app version'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
};
