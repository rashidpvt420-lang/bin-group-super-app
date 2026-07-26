# Technician GPS Retry Privacy and Durability

## Scope

The browser retry queue exists only to reconcile foreground Technician GPS updates and STOP requests with the protected `updateTechnicianLiveLocation` callable. It is not a background tracker, route history, attendance record, or permanent location archive.

## Storage boundary

- Retry data is stored in `sessionStorage`, not persistent `localStorage`.
- The storage key contains a SHA-256 hash of the authenticated Technician UID; the raw UID is not written into queued entries.
- Account changes purge every queue that does not match the current authenticated Technician.
- Technician logout explicitly purges the scoped queue, and the portal then clears all session storage.
- The former `bin-technician-gps-queue-v1` persistent key is removed rather than migrated.

## Data minimization

An UPDATE record contains only the ticket ID, tracking-session ID, one most-recent coordinate, measured accuracy, optional heading/speed, device timestamp, retry metadata and expiry. Multiple failed UPDATEs for the same session are coalesced so the browser does not retain a route history.

A STOP record contains no latitude, longitude, heading, speed or accuracy. It contains only the ticket ID, tracking-session ID, requested final status, retry metadata and expiry.

## Retention

- UPDATE retry records expire after **15 minutes**.
- STOP reconciliation records expire after **24 hours**.
- Expired, malformed and foreign-account records are disposed through explicit queue sanitation.
- The queue is capped at 25 records. New UPDATEs may supersede the oldest UPDATE, but STOP records are never silently displaced. A STOP-only saturated queue fails closed.

## Replay and truthfulness

STOP actions are replayed before UPDATE actions. On portal reload, the Technician shell resumes the queue for the authenticated UID. Before a new tracking session starts, unresolved STOP actions must be acknowledged by the server; otherwise the new session is blocked.

A failed STOP is recorded as `STOP_REQUEST_QUEUED`, not `STOPPED`. `STOPPED` is written only after the protected callable acknowledges the STOP, whether immediately or through replay. Terminal callable errors and retry exhaustion are recorded as `STOP_RECONCILIATION_FAILED` for support review.

## Network and battery controls

The ten-second capture throttle advances before network transmission. An outage therefore cannot enqueue every browser geolocation callback. Retry attempts use bounded exponential backoff, stop after six failed attempts or a terminal callable error, and remain subject to the applicable expiry.

## Server authority

The browser queue is transport recovery only. The canonical server document, App Check-protected callable, assignment validation and five-minute expiry watchdog remain authoritative. Client diagnostics never override server tracking state.
