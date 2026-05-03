// apps/owner-app/public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
  authDomain: "bin-group-57c60.firebaseapp.com",
  projectId: "bin-group-57c60",
  storageBucket: "bin-group-57c60.firebasestorage.app",
  messagingSenderId: "123413252227",
  appId: "1:123413252227:web:285cb53bc26626d699f3b6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
