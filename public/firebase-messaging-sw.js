/* BIN GROUP — Firebase Cloud Messaging service worker */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s',
  authDomain: 'bin-group-57c60.firebaseapp.com',
  projectId: 'bin-group-57c60',
  storageBucket: 'bin-group-57c60.firebasestorage.app',
  messagingSenderId: '123413252227',
  appId: '1:123413252227:web:285cb53bc26626d699f3b6',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'BIN GROUP';
  const options = {
    body: notification.body || data.body || 'New update received.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: {
      url: data.link || data.click_action || '/',
      ...data,
    },
    requireInteraction: data.requireInteraction === 'true',
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
