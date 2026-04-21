// [V8] Sovereign Messaging Service Worker - Pristine Direct Initialization
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// [SECURITY] Use explicit, hardcoded public credentials. Never use process.env here.
firebase.initializeApp({
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.firebaseapp.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[v8-sw] Background Mission Notification Received:', payload);
  
  var title = (payload.notification && payload.notification.title) || 
              (payload.data && payload.data.title) || 
              'BIN-GROUPS';
              
  var options = {
    body: (payload.notification && payload.notification.body) || 
          (payload.data && payload.data.body) || 
          'Digital mission protocol updated.',
    icon: '/logo.png',
    badge: '/logo.png',
    requireInteraction: true,
    data: {
        url: (payload.data && payload.data.url) || '/tech'
    }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    var urlToOpen = (event.notification.data && event.notification.data.url) || '/tech';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
