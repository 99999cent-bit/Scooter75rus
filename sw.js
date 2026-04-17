// ============================================================
// Service Worker — Prokat Sani75rus
// ТОЛЬКО: уведомления, фоновое обновление ключей.
// БЕЗ ОФЛАЙН-КЭШИРОВАНИЯ (чтобы не затирались свежие данные)
// ============================================================

const SW_VERSION = 'v4.0-no-cache'; // Версию изменили, чтобы браузеры принудительно обновили SW
const CONFIG_CACHE = 'prokat-key-config';

// ---- УСТАНОВКА И АКТИВАЦИЯ ----
self.addEventListener('install', event => {
    console.log('[SW] Установка', SW_VERSION);
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('[SW] Активация', SW_VERSION);
    event.waitUntil(
        Promise.all([
            // ЖЕСТКАЯ ОЧИСТКА: Удаляем вообще все старые кэши файлов на устройстве,
            // чтобы убить "зависшие" и затирающие данные старые версии страниц.
            caches.keys().then(keys =>
                Promise.all(keys
                    .filter(k => k !== CONFIG_CACHE) // Оставляем только кэш для таймеров ключей
                    .map(k => caches.delete(k))
                )
            ),
            self.clients.claim(),
            // Перезапускаем таймер обновления ключей после активации SW
            _restartKeyRefreshTimer()
        ])
    );
});

// ---- ХРАНЕНИЕ КОНФИГА В CACHE API (персистентно между перезапусками SW) ----
async function getKeyRefreshConfig() {
    try {
        const cache = await caches.open(CONFIG_CACHE);
        const resp = await cache.match('key-refresh-config');
        if (resp) return await resp.json();
    } catch (e) {}
    return { enabled: false, intervalMs: 0, lastTs: 0 };
}

async function saveKeyRefreshConfig(cfg) {
    try {
        const cache = await caches.open(CONFIG_CACHE);
        await cache.put('key-refresh-config', new Response(JSON.stringify(cfg), {
            headers: { 'Content-Type': 'application/json' }
        }));
    } catch (e) {}
}

// ---- ТАЙМЕР ОБНОВЛЕНИЯ КЛЮЧЕЙ ----
let _keyRefreshTimer = null;

async function _restartKeyRefreshTimer() {
    if (_keyRefreshTimer) {
        clearInterval(_keyRefreshTimer);
        _keyRefreshTimer = null;
    }

    const cfg = await getKeyRefreshConfig();
    if (!cfg.enabled || cfg.intervalMs <= 0) return;

    console.log('[SW] Таймер обновления ключей: каждые', Math.round(cfg.intervalMs / 60000), 'мин');

    const elapsed = Date.now() - (cfg.lastTs || 0);
    if (elapsed >= cfg.intervalMs) {
        console.log('[SW] Прошло', Math.round(elapsed / 60000), 'мин — отправляем запрос на обновление ключей');
        await _notifyClientsRefresh();
    }

    _keyRefreshTimer = setInterval(async () => {
        const c = await getKeyRefreshConfig();
        if (!c.enabled) { clearInterval(_keyRefreshTimer); _keyRefreshTimer = null; return; }
        console.log('[SW] ⏰ Пора обновить ключи (таймер SW)');
        await _notifyClientsRefresh();
    }, cfg.intervalMs);
}

async function _notifyClientsRefresh() {
    const cfg = await getKeyRefreshConfig();
    cfg.lastTs = Date.now();
    await saveKeyRefreshConfig(cfg);

    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    if (clients.length > 0) {
        console.log('[SW] Отправляем KEY_REFRESH_NEEDED в', clients.length, 'клиентов');
        clients.forEach(client => client.postMessage({ type: 'KEY_REFRESH_NEEDED' }));
    } else {
        console.log('[SW] Нет открытых клиентов — устанавливаем флаг PENDING_KEY_REFRESH');
        cfg.pendingRefresh = true;
        await saveKeyRefreshConfig(cfg);
    }
}

// ---- ОБРАБОТКА СООБЩЕНИЙ ОТ СТРАНИЦЫ ----
self.addEventListener('message', event => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
        case 'SET_KEY_REFRESH':
            (async () => {
                const cfg = {
                    enabled: !!data.enabled,
                    intervalMs: data.intervalMs || 0,
                    lastTs: data.lastTs || Date.now(),
                    pendingRefresh: false
                };
                await saveKeyRefreshConfig(cfg);
                await _restartKeyRefreshTimer();
            })();
            break;

        case 'KEY_REFRESH_DONE':
            (async () => {
                const cfg = await getKeyRefreshConfig();
                cfg.lastTs = Date.now();
                cfg.pendingRefresh = false;
                await saveKeyRefreshConfig(cfg);
            })();
            break;

        case 'GET_KEY_REFRESH_CONFIG':
            (async () => {
                const cfg = await getKeyRefreshConfig();
                if (event.source) {
                    event.source.postMessage({ type: 'KEY_REFRESH_CONFIG', config: cfg });
                }
            })();
            break;

        case 'NOTIFY':
            (async () => {
                if (Notification.permission !== 'granted') return;
                const opts = {
                    body: data.body || '',
                    icon: 'https://cdn-icons-png.flaticon.com/192/4305/4305512.png',
                    badge: 'https://cdn-icons-png.flaticon.com/96/4305/4305512.png',
                    tag: data.tag || 'prokat',
                    renotify: true,
                    requireInteraction: !!data.critical,
                    vibrate: data.critical ? [500, 200, 500, 200, 500] : [200, 100, 200],
                    silent: false
                };
                await self.registration.showNotification(data.title || 'Прокат', opts);
            })();
            break;

        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
    }
});

// ---- PERIODIC BACKGROUND SYNC ----
self.addEventListener('periodicsync', event => {
    if (event.tag === 'key-refresh') {
        event.waitUntil(_notifyClientsRefresh());
    }
});

// ---- FETCH — ТОЛЬКО СЕТЬ, НИКАКОГО КЭША ----
self.addEventListener('fetch', event => {
    // Просто пропускаем все запросы напрямую в интернет. 
    // Браузер будет всегда скачивать самую свежую версию приложения и данных.
    return;
});

// ---- КЛИК ПО УВЕДОМЛЕНИЮ ----
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            if (clients.length > 0) {
                clients[0].focus();
            } else {
                self.clients.openWindow('./');
            }
        })
    );
});
