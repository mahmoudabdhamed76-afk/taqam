/* طاقم · service worker — الإشعارات حتى والبرنامج مقفول */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  const show = self.registration.showNotification(d.title || 'طاقم', { body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', dir: 'rtl', lang: 'ar', data: { url: d.url || '/' }, requireInteraction: !!d.urgent });
  const badge = d.badge && self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge(d.badge).catch(() => {}) : null;
  e.waitUntil(Promise.all([show, badge]));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (new URL(c.url).pathname.startsWith(url === '/' ? '/' : url) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('fetch', () => {});
