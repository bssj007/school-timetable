const CACHE_NAME = 'school-timetable-v9';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon.svg',
    '/api/app-icon',
    '/chalkboard-bg-thumb.webp'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    // Let the browser handle API/dynamic requests, only fallback for assets if offline
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// Push notification event listener (푸시 알림만 띄우고 앱 아이콘 숫자 배지는 남기지 않음)
self.addEventListener('push', event => {
    let data = {
        title: '성지수행 알림',
        body: '새로운 알림이 도착했습니다.',
        url: '/'
    };

    try {
        if (event.data) {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        }
    } catch (e) {
        if (event.data) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body || data.message || '',
        icon: '/favicon-48x48.png',
        data: {
            url: data.url || data.link || '/'
        },
        vibrate: [100, 50, 100],
        tag: 'sj-notification-' + Date.now(),
        renotify: true
    };

    event.waitUntil(
        (async () => {
            await self.registration.showNotification(data.title || '성지수행', options);
            if (self.navigator && 'setAppBadge' in self.navigator) {
                try {
                    const badgeCount = Number(data.unreadCount) || 1;
                    await self.navigator.setAppBadge(badgeCount);
                } catch (_) {}
            }
        })()
    );
});

// Notification click event listener
self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (self.navigator && 'clearAppBadge' in self.navigator) {
        try { self.navigator.clearAppBadge(); } catch (_) {}
    }
    const urlToOpen = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let client of windowClients) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus().then(() => {
                        if (client.navigate) return client.navigate(urlToOpen);
                    });
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});


