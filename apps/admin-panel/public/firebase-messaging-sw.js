/* BIN GROUP Admin — Firebase Cloud Messaging service worker */
/* eslint-disable no-undef, no-restricted-globals */
// This worker is copied to the Hosting root by CRA. It cannot consume
// REACT_APP_* values at runtime, so it must carry the same public Firebase
// web configuration as the Admin bundle. A placeholder app ID made the
// postdeploy verifier merge an unrelated configuration over the real bundle.
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
  const notificationTitle = notification.title || payload.data?.title || 'BIN GROUP Admin';
  const notificationOptions = {
    body: notification.body || payload.data?.body || 'New Admin update received.',
    icon: '/logo192.png',
    tag: 'admin-alert'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
