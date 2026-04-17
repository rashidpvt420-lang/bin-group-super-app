// [V5] Sovereign Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.firebaseapp.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
});

firebase.messaging.isSupported().then((supported) => {
    if (supported) {
        const messaging = firebase.messaging();
        messaging.onBackgroundMessage((payload) => {
          console.log('[firebase-messaging-sw.js] Background message received:', payload);
          const notificationTitle = payload.notification?.title || payload.data?.title || 'BIN GROUP Update';
          const notificationOptions = {
            body: payload.notification?.body || payload.data?.body || 'New institutional alert received.',
            icon: '/logo.png',
            badge: '/logo.png',
            requireInteraction: true,
            data: {
                ...payload.data,
                url: payload.data?.url || '/dashboard'
            }
          };
          self.registration.showNotification(notificationTitle, notificationOptions);
        });
    } else {
        console.warn('[firebase-messaging-sw.js] Firebase Messaging is not supported in this browser.');
    }
}).catch((err) => console.error('[firebase-messaging-sw.js] isSupported error:', err));

self.onnotificationclick = (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
};
