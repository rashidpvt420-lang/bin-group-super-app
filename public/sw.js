// BIN GROUP Sovereign Property OS — Service Worker
// Offline-first for technician job cards and critical app shell
const CACHE_NAME = 'bin-group-v1';
const OFFLINE_URL = '/offline.html';

const APP_SHELL = [
  '/',
  '/index.html',
  '/logo.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept Firebase / Google API calls
  if (url.hostname.includes('firestore') || url.hostname.includes('googleapis') ||
      url.hostname.includes('firebase') || url.hostname.includes('graph.facebook')) {
    return;
  }

  // Navigation requests — network first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then(r => r || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Static assets — cache first
  if (request.destination === 'image' || request.destination === 'style' ||
      request.destination === 'font' || request.destination === 'script') {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }
});

// Background sync — flush offline job card queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'bin-offline-sync') {
    event.waitUntil(flushOfflineQueue());
  }
});

async function flushOfflineQueue() {
  // The actual sync is handled by TechnicianOfflinePage component
  // This just triggers a notification to all clients
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_READY' }));
}

// Push notifications (for ticket assignments and WhatsApp alerts)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'BIN GROUP', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'BIN GROUP', {
      body: data.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      tag: data.tag || 'bin-group',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});
