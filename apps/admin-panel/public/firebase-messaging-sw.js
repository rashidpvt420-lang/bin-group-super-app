/* BIN GROUP Admin — Firebase Cloud Messaging service worker */
/* eslint-disable no-undef, no-restricted-globals */
// This worker is copied to the Hosting root by CRA. Its public Firebase
// configuration is generated from the build environment immediately before
// the build, so it cannot drift from the Admin bundle or be committed here.
importScripts('/firebase-messaging-config.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

if (!self.__BIN_GROUP_ADMIN_FIREBASE_CONFIG) {
  throw new Error('Missing generated Admin Firebase messaging configuration.');
}

firebase.initializeApp(self.__BIN_GROUP_ADMIN_FIREBASE_CONFIG);

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
