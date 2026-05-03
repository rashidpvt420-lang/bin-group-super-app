// apps/admin-panel/public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "REPLACED_BY_BUILD",
  authDomain: "bin-group-57c60.firebaseapp.com",
  projectId: "bin-group-57c60",
  storageBucket: "bin-group-57c60.appspot.com",
  messagingSenderId: "123413252227",
  appId: "1:123413252227:web:admin-panel-id"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Admin background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png',
    tag: 'admin-alert'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
