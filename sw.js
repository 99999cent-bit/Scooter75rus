// ================================================================
// sw.js — Prokat Sani75rus | Офлайн PWA Service Worker
// Положить рядом с index.html
// При обновлении index.html — увеличить CACHE_VER
// ================================================================
const CACHE_VER   = 'prokat-v5';
const CACHE_SHELL = CACHE_VER + '-shell';
const CACHE_CDN   = CACHE_VER + '-cdn';
const CACHE_FB    = CACHE_VER + '-fb';

const SHELL = ['./', './index.html', './manifest.json'];

const CDN_RESOURCES = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-brands-400.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-regular-400.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

const FB_SDK = [
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
];

// INSTALL
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const shellCache = await caches.open(CACHE_SHELL);
        for (const url of SHELL) {
            try { await shellCache.add(url); } catch(e) { console.warn('[SW] Shell skip:', url); }
        }
        const cdnCache = await caches.open(CACHE_CDN);
        for (const url of CDN_RESOURCES) {
            try {
                const resp = await fetch(url, { cache: 'no-cache' });
                if (resp.ok) await cdnCache.put(url, resp);
            } catch(e) { console.warn('[SW] CDN skip:', url); }
        }
        const fbCache = await caches.open(CACHE_FB);
        for (const url of FB_SDK) {
            try {
                const resp = await fetch(url, { cache: 'no-cache' });
                if (resp.ok) await fbCache.put(url, resp);
            } catch(e) { console.warn('[SW] Firebase SDK skip:', url); }
        }
        await self.skipWaiting();
        console.log('[SW] Установка завершена');
    })());
});

// ACTIVATE
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => k !== CACHE_SHELL && k !== CACHE_CDN && k !== CACHE_FB)
                .map(k => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

// FETCH
self.addEventListener('fetch', event => {
    const url = event.request.url;
    const req = event.request;

    if (req.method !== 'GET') return;
    if (url.startsWith('chrome-extension://') || url.startsWith('blob:')) return;

    // Навигация → кэш сразу, сеть фоном
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            const cached = await caches.match('./index.html', { cacheName: CACHE_SHELL });
            const netPromise = fetch(req).then(resp => {
                if (resp && resp.ok)
                    caches.open(CACHE_SHELL).then(c => c.put('./index.html', resp.clone()));
                return resp;
            }).catch(() => null);
            if (cached) { event.waitUntil(netPromise); return cached; }
            return netPromise || new Response('Нет сети', { status: 503 });
        })());
        return;
    }

    // CDN
    if (url.includes('cdnjs.cloudflare.com') || url.includes('cdn-icons-png.flaticon.com')) {
        event.respondWith(cacheFirst(req, CACHE_CDN));
        return;
    }

    // Firebase SDK
    if (url.includes('gstatic.com/firebasejs')) {
        event.respondWith(cacheFirst(req, CACHE_FB));
        return;
    }

    // Только сеть (динамические API)
    if (
        url.includes('api-maps.yandex.ru') || url.includes('yandex.net') ||
        url.includes('firestore.googleapis.com') ||
        url.includes('identitytoolkit.googleapis.com') ||
        url.includes('securetoken.googleapis.com') ||
        url.includes('api.telegram.org') ||
        url.includes('script.google.com') ||
        url.includes('18gps.net')
    ) return;

    // Остальное — сеть + кэш
    event.respondWith(
        fetch(req).then(resp => {
            if (resp && resp.ok)
                caches.open(CACHE_SHELL).then(c => c.put(req, resp.clone()));
            return resp;
        }).catch(() => caches.match(req))
    );
});

async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const resp = await fetch(req);
        if (resp && resp.ok) await cache.put(req, resp.clone());
        return resp;
    } catch(e) {
        return cached || new Response('Офлайн', { status: 503 });
    }
}

// Уведомления + обновление
self.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === 'NOTIFY') {
        self.registration.showNotification(e.data.title, {
            body: e.data.body,
            icon: e.data.icon || 'https://cdn-icons-png.flaticon.com/192/4305/4305512.png',
            badge: e.data.icon || '',
            vibrate: e.data.critical ? [1000,500,1000] : [300,100,300],
            tag: e.data.tag || 'prokat',
            requireInteraction: !!e.data.critical,
            silent: false
        });
    }
    if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', e => { e.notification.close(); });
