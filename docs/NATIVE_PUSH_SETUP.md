# Native push notifications (Android + iOS)

The web push path (`src/services/pushNotificationService.ts`, FCM web token + service worker) is unchanged and is still used in
browsers and installed PWAs, including the `ios_requires_installed_pwa` rule for iPhone Safari.

Inside the Capacitor app (`isNativeApp()`), `src/services/nativePushService.ts` takes over:

1. asks for notification permission (Android 13+ `POST_NOTIFICATIONS`, iOS prompt),
2. creates the Android channel `bin_default` (must match `channelId` in `functions/notificationDelivery.ts`),
3. gets the FCM registration token from `@capacitor/push-notifications`,
4. calls the existing `registerPushToken` callable with `platform: "android-native"` / `"ios-native"`,
5. follows token refreshes, refreshes on app resume (every 6 h), routes notification taps to `data.link` (internal paths only),
6. removes the registration on sign-out (`unregisterPushToken` + `PushNotifications.unregister()`), via `auth.beforeAuthStateChanged`
   so every logout button is covered.

Server: tokens are stored at `users/{uid}/fcmTokens/{sha256(token)}`; native registrations stay deliverable for 7 days
(web: 24 h) because an installed app is not opened as often as a browser tab. Messages carry `android.priority = high`,
`android.notification.channelId = bin_default` and `apns-priority: 10`.

## Android (needs one console step)
- Firebase console → Project settings → add/confirm the Android app `ae.bingroups.superapp`, download `google-services.json`.
- CI injects it via `scripts/inject-android-google-services.mjs`; for a local build place it at `android/app/google-services.json`
  (never commit it). Without it the app builds but cannot receive FCM.
- Notification icon (`@drawable/ic_stat_bin`), accent colour and default channel are declared in `AndroidManifest.xml`.
- No new permissions: `POST_NOTIFICATIONS` was already declared.

## iOS (code path only; needs Apple + Firebase console steps and a Mac build)
1. Apple Developer: create an APNs Auth Key (.p8); enable Push Notifications for the app id.
2. Firebase console → Project settings → Cloud Messaging → upload the APNs key to the iOS app.
3. Xcode: add the *Push Notifications* and *Background Modes → Remote notifications* capabilities; add `GoogleService-Info.plist`.
4. Add the `FirebaseMessaging` pod and forward the APNs token to it in `AppDelegate`
   (`Messaging.messaging().apnsToken = deviceToken`), then return the FCM token to the plugin
   (the standard Capacitor push-notifications + Firebase setup).
Until step 4 is done the app reports `ios_fcm_not_configured` and does not send a (useless) APNs token to the server.

## Only verifiable on a physical device
- Android 13+ permission prompt; denial path.
- Row appears in `users/{uid}/fcmTokens` with `platform: android-native`.
- Foreground arrival, background arrival, tap from background and tap from a killed app route to the right screen.
- Token refresh (reinstall / clear data), logout cleanup (no push after sign-out), account switch on one device.
- Icon, accent colour and channel appearance; delivery while the device is in Doze (high priority).
- All of iOS.

## Known limitation
If user A signs out while offline and user B signs in on the same device, A's server-side token document can linger until it
expires (7 days) or FCM reports it invalid. `PushNotifications.unregister()` deletes the device token on sign-out, which makes
the old token undeliverable. A server-side sweep needs a collection-group index on `fcmTokens.token` (`firestore.indexes.json`).
