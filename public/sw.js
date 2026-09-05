const CACHE_NAME = 'mentor-shell-20260905-login3';
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest', '/assets/icons/mentor-app-icon-192.png', '/assets/icons/mentor-app-icon-maskable.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data ? event.data.text() : '' }; }
  const data = payload.data || {};
  event.waitUntil(self.registration.showNotification(payload.title || 'Mentor Operations', {
    body: payload.body || 'มีรายการใหม่ที่ควรตรวจสอบ',
    icon: payload.icon || '/assets/icons/mentor-app-icon-192.png', badge: payload.badge || '/assets/icons/mentor-app-icon-192.png',
    tag: payload.tag || `mentor-${Date.now()}`, renotify: Boolean(payload.renotify),
    data, actions: [{ action: 'open', title: 'เปิดดู' }],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = new URL(String(event.notification.data?.url || '/'), self.location.origin);
  if (requested.origin !== self.location.origin) requested.pathname = '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if ('focus' in client) { client.navigate(requested.href); return client.focus(); }
    }
    return self.clients.openWindow(requested.href);
  }));
});
