# Technician physical installation binding

This contract protects real-device Technician arrival evidence for the BIN GROUP Android application distributed through Google Play.

## Trust boundary

A client value such as `platform: "android"` is not physical-device proof. The native Android Firebase App Check bridge must first verify the Google Play installer and the expected Google Play delivery signing certificate before it releases a Play Integrity-backed App Check token. The protected Cloud Functions additionally require Firebase App Check and reject non-Android Firebase App Check application identities for physical registration and arrival binding.

The installation identifier is the Firebase Installation ID read inside the native Android runtime and immediately reduced to a SHA-256 value. The raw Firebase Installation ID must not be written to Firestore, logs, audit records, browser console output, or GitHub Actions output.

## Registration behavior

The first protected registration for a Technician atomically writes the same secure registration to `users/{uid}` and `technicians/{uid}`:

- `deviceRegistered: true`
- `registeredInstallationHash: <SHA-256>`
- `registeredDevicePlatform: "android"`
- `registeredAppCheckAppId: <verified Android Firebase App Check app ID>`
- `deviceRegisteredAt`

Repeating registration from the same installation is idempotent. If a different valid installation hash, platform, or protected App Check app identity is already registered, the runtime fails closed instead of silently replacing it.

## Reinstall and phone replacement

A reinstall or application-data reset can produce a different Firebase Installation ID. A new phone will also have a different installation identity. Those events must not silently take over an existing Technician registration. A future controlled administrative device re-registration/reset operation must explicitly authorize rotation.

## Arrival binding

At `ARRIVED`, the mobile client submits only its hashed installation identity plus fresh GPS. It cannot authorize `physicalDeviceBound` itself. The server revalidates the authenticated and assigned Technician, the current protected registration, Android App Check identity, installation hash, GPS verification, GPS accuracy, and property geofence. Only after those checks does the server derive and persist:

- `physicalDeviceBound: true`
- `arrivalInstallationHash`
- `arrivalDevicePlatform: "android"`
- `arrivalAppCheckAppId`

## Offline behavior

`ARRIVED` is never automatically replayed because physical arrival requires fresh foreground GPS and a current installation binding. Other replayable Technician actions remain bound to the authenticated Technician UID that created the queued action. Cross-account replay fails closed.

## Browser testing

Protected browser E2E fixtures remain valid for browser functional testing. Browser/reCAPTCHA App Check and fixture device values such as `protected-e2e-browser` never satisfy the physical Android evidence contract.
