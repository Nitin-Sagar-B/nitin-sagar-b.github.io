const RELEASE = '9';
const CACHE_PREFIX = 'abstractos-v';
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const ASSETS = [
    '/', '/index.html', '/assets/css/styles.css?v=' + RELEASE, '/assets/js/scripts.js?v=' + RELEASE,
    '/assets/images/image.png', '/assets/images/icon-192.png', '/assets/images/icon-512.png', '/manifest.json', '/og-preview.png',
];
const VERSIONED_ASSETS = new Set(ASSETS.filter(path => path.includes('?')));

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME)
        .then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, location.origin), {
            cache: 'reload',
        }))))
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys
            .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

async function fetchAndCache(cache, request) {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
}

async function serve(request, url) {
    const cache = await caches.open(CACHE_NAME);
    const versioned = VERSIONED_ASSETS.has(url.pathname + url.search);
    try {
        if (versioned) {
            const cached = await cache.match(request);
            if (cached) return cached;
        }
        return await fetchAndCache(cache, request);
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
            const offlinePage = await cache.match('/');
            if (offlinePage) return offlinePage;
        }
        throw error;
    }
}

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== location.origin) return;
    event.respondWith(serve(request, url));
});
