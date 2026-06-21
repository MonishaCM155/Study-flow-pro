/* ═══════════════════════════════════════════════════
   StudyFlow Pro — Service Worker
   Handles: push notifications, alarm scheduling,
   offline caching, background sync
═══════════════════════════════════════════════════ */

const CACHE_NAME = 'studyflow-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

/* ── INSTALL ──────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ─────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH (Cache-first for static, network-first for API) */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    // Network-first for API calls; do not serve stale auth responses from cache.
    // This preserves login state and prevents cached 401/expired token replies.
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline — no network' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
  } else {
    // Cache-first for static assets
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

/* ── PUSH NOTIFICATIONS ───────────────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'StudyFlow Pro', body: event.data.text() }; }

  const title = data.title || '⏰ StudyFlow Alarm';
  const options = {
    body: data.body || 'You have a scheduled reminder',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'studyflow-alarm',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    actions: [
      { action: 'open', title: '📖 Open App' },
      { action: 'dismiss', title: '✕ Dismiss' },
    ],
    data: { url: '/', alarmId: data.data?.alarmId },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* ── NOTIFICATION CLICK ───────────────────────── */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus existing window if open
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      // Otherwise open new window
      return clients.openWindow('/');
    })
  );
});

/* ── MESSAGE — SCHEDULE ALARM FROM CLIENT ─────── */
self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'SCHEDULE_ALARM') {
    const { alarmId, label, when } = msg;
    const delay = new Date(when).getTime() - Date.now();

    if (delay <= 0) {
      // Fire immediately
      self.registration.showNotification(`⏰ ${label}`, {
        body: 'Your StudyFlow alarm is ringing!',
        icon: '/icons/icon-192.png',
        tag: `alarm-${alarmId}`,
        requireInteraction: true,
        vibrate: [300, 100, 300],
        actions: [{ action: 'open', title: '📖 Open App' }],
      });
      return;
    }

    // Note: setTimeout in SW is unreliable when SW sleeps.
    // The actual alarm is fired by the backend push or client polling.
    // We store a fallback here using IndexedDB via client postMessage.
    event.source?.postMessage({ type: 'ALARM_SCHEDULED', alarmId, when });
  }

  if (msg.type === 'FIRE_ALARM') {
    self.registration.showNotification(`⏰ ${msg.label}`, {
      body: 'Your StudyFlow alarm is ringing! 🔔',
      icon: '/icons/icon-192.png',
      tag: `alarm-${msg.alarmId}`,
      requireInteraction: true,
      vibrate: [300, 100, 300, 100, 300],
      actions: [
        { action: 'open', title: '📖 Open App' },
        { action: 'dismiss', title: '✕ Snooze 5 min' },
      ],
    });
  }
});
