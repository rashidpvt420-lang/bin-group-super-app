# Technician Android installation binding

The production Technician physical-evidence path binds a Technician UID to one
Google-Play-installed Android application identity. A platform string is not
proof. Registration requires all of the following:

1. The native Capacitor bridge confirms the Google Play installer and the
   expected Play delivery signing certificate.
2. The bridge obtains the Firebase Installation ID inside native code and sends
   only its lowercase SHA-256 digest to JavaScript.
3. The App Check-protected callable receives a verified Firebase Android app
   identity from the callable context. Web/reCAPTCHA App Check identities are
   rejected by the physical registration path.
4. The server atomically writes the same digest and Android platform contract to
   `users/{uid}` and `technicians/{uid}`.

The raw Firebase Installation ID must never be written to Firestore, browser or
native logs, audit records, CI output, or a callable payload. A hashing or native
verification failure blocks registration and physical arrival evidence.

## Rotation and reinstall behavior

- The same installation digest may register again; this is idempotent.
- Reinstalling the app or clearing app data can produce a new Firebase
  installation identity.
- A new digest never silently replaces an existing secure digest. Registration
  fails with `failed-precondition` and records a rejected-rotation audit event.
- Phone replacement will use a separate, controlled administrative
  re-registration operation. That operation is intentionally not part of this
  launch candidate.

## Arrival and offline replay

For `ARRIVED`, the client supplies the digest only for comparison. The server
re-reads both current Technician profiles in the ticket transaction, confirms
the authenticated UID is the assigned Technician, validates Android App Check,
requires the matching digest and platform, and then validates GPS accuracy,
capture age for queued arrivals, and the property geofence. Only the server can
derive `physicalDeviceBound`, `arrivalInstallationHash`, and
`arrivalDevicePlatform`.

An offline arrival queue item contains a SHA-256 digest, the originating
Technician UID, GPS coordinates, accuracy, and capture time. Replay is not proof
by itself: the callable obtains fresh App Check, rejects cross-account replay,
and compares the queued digest with the current server registration. Stale or
mismatched evidence fails closed.

Protected browser fixtures retain functional lifecycle coverage. A matching
server-created `protected-*-browser` fixture can exercise browser arrival, but
the server explicitly records it as `BROWSER_FUNCTIONAL_ONLY` with
`physicalDeviceBound=false` and no arrival installation/platform fields. It can
never satisfy physical Android evidence verification.
