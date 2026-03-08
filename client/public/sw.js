const CACHE_NAME = 'school-timetable-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon.svg',
    '/api/app-icon'
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
