# BIN GROUP Mobile Store Readiness

## Release route

Use Capacitor for the long-term native route.

1. Build the web app.
2. Sync Capacitor.
3. Generate Android and iOS native projects.
4. Test on real Android and iPhone devices.
5. Use Google Play internal testing and Apple TestFlight before public release.

## Commands

```bash
npm install --legacy-peer-deps
npm run mobile:check
npm run mobile:add:android
npm run mobile:add:ios
npm run mobile:sync
npm run mobile:open:android
npm run mobile:open:ios
```

## Android checklist

- Android package ID: `ae.bingroups.superapp`.
- Build Android App Bundle for Google Play.
- Target the currently required Android API level before submission.
- Add release signing in Android Studio or CI.
- Test camera evidence upload.
- Test technician location flow.
- Test push notifications.
- Test file upload and PDF download.
- Test Arabic and English UI.

## iOS checklist

- Use TestFlight first.
- Add app icon and launch screen.
- Add review-ready usage descriptions for camera, photo library, location, and notifications.
- Test on a real iPhone.
- Verify login, owner, tenant, technician, broker, and admin handoff flows.
- Verify support and privacy URLs.
- Keep the Firebase backend live during review.

## Store review notes

Store review notes should explain that BIN GROUP is a UAE property asset reliability and maintenance operations app with five role-based experiences: Owner, Tenant, Technician, Broker, and Admin.

Do not put public role credentials in the repository. Add temporary review access only inside the Apple or Google review-note fields and rotate after review.

## Privacy labels

Declare data collection for account information, property/service data, maintenance evidence, location for field operations, notifications, diagnostics, and support communications. Final labels must match the real production behavior at submission time.

## Final gate

Do not submit public production builds until these pass:

- Web production build.
- Admin production build.
- Functions build.
- Firestore rules tests.
- Runtime audit.
- Mobile store readiness audit.
- Live five-role smoke tests.
- Real Android device smoke test.
- Real iPhone TestFlight smoke test.
