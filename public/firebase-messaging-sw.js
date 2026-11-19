/* BIN GROUP — Firebase Cloud Messaging service worker */
/* Generated Firebase client config is loaded from the same build inputs as the root app. */
importScripts('/firebase-messaging-config.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

if (!self.__BIN_GROUP_FIREBASE_CONFIG) {
  throw new Error('Missing generated Firebase messaging configuration.');
}

firebase.initializeApp(self.__BIN_GROUP_FIREBASE_CONFIG);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Server pushes (deliverNotificationPush) carry a notification payload, which the Firebase SDK already
  // shows with the app closed (and opens webpush.fcmOptions.link on tap). Showing it again here produced
  // two identical system notifications, so only data-only messages are rendered by this handler.
  if (payload.notification && (payload.notification.title || payload.notification.body)) return;
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
