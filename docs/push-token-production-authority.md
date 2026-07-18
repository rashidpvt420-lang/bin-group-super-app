# Push Token Production Authority

Firebase Cloud Messaging registration tokens are bearer-like delivery identifiers. They must not be exposed in browser logs, Firestore document paths, user profile arrays, notification records, or Admin-readable collections.

## Registration authority

The production client obtains an FCM token from the Firebase SDK and sends it only to the App Check-protected `registerPushToken` callable. The server:

- uses `request.auth.uid` as the only user identifier;
- resolves role and account status from live Firebase Auth and Firestore profile data;
- requires an enabled account, verified email, active profile, granted notification permission, and an allowlisted platform;
- hashes the token with SHA-256 and uses the hash as the token document ID;
- stores the raw token only in the Admin-SDK-managed `users/{uid}/fcmTokens/{sha256}` document;
- hashes the HTTP user-agent rather than storing it directly;
- caps each account at ten active registrations and prunes older records;
- removes legacy root `fcmTokens` arrays; and
- writes an audit event without the raw token.

`unregisterPushToken` applies the same authenticated account checks, hashes the submitted SDK token server-side, deletes only that authenticated account's registration, and refreshes aggregate profile state.

## Firestore boundary

The canonical rules pipeline makes these user subcollections server-only:

- `users/{uid}/fcmTokens/{tokenId}`
- `users/{uid}/deviceReadiness/{readinessId}`

Browser users and browser Admins cannot read, create, update, or delete these records. Root user self-update and bootstrap allowlists exclude raw token arrays, push authority summaries, platform metadata, user-agent values, and device readiness objects. Technician operational readiness under `technicians/{uid}/deviceReadiness` remains independently available to approved technicians.

## Delivery and pruning

The notification trigger reads only server-managed token documents whose SHA-256 hash matches the document ID. It never falls back to a raw token stored in the document path or user profile.

Multicast delivery is chunked into groups of at most 500 tokens. Firebase responses are kept in registration order so invalid-token errors can be mapped back to their server document references. Invalid or unregistered tokens are deleted server-side, affected user token counts are refreshed, and notification records contain only:

- attempted token count;
- success and failure counts;
- pruned-token count; and
- delivery state (`SUCCESS`, `PARTIAL`, `FAILED`, or `NO_REGISTERED_TOKEN`).

Raw invalid token values are never written to the notification document.

## Migration behavior

Existing root `fcmTokens` arrays are no longer trusted for delivery. They are deleted when a device registers through the secure callable. Existing users must open the app and enable notifications again to create a server-managed registration. This is intentional: launch evidence must represent current authenticated devices, not stale legacy tokens.
