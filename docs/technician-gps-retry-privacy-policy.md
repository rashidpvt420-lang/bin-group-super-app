# Technician GPS Retry and Privacy Policy

## Launch policy

BIN GROUP uses **foreground-browser GPS** for the controlled pilot. Tracking is active only while the Technician mission page remains open and the browser continues delivering geolocation callbacks. The server expiry watchdog is a safety fallback; it is not evidence that the browser successfully stopped a session.

The Technician interface may show **Live GPS active** only after the browser confirms that a geolocation watch was installed. Unsupported devices, insecure contexts and unresolved prior STOP actions must remain visibly not tracking.

## Retry storage

The browser may temporarily retain failed GPS actions so a short network interruption does not leave the canonical server state inconsistent.

- STOP and reconciliation storage: UID-scoped `sessionStorage`; coordinate-free.
- UPDATE retry storage: memory only; precise coordinates are never written to Web Storage.
- Legacy migration: the persistent `bin-technician-gps-queue-v1` localStorage record is deleted during startup, account change and secure logout.
- Scope: one coordinate-free STOP key per authenticated Technician UID; UPDATEs remain only in the active page memory.
- Lifetime: non-terminal actions expire after 30 minutes. A terminal STOP remains as a coordinate-free reconciliation tombstone until secure purge or successful operational reconciliation.
- Capacity: maximum 25 active retry actions. Queue pressure may dispose UPDATEs but never silently evicts STOP intent.
- UPDATE data: ticket ID, tracking-session ID, timestamp, rounded latitude/longitude, accuracy, heading and speed; memory only.
- STOP data: ticket ID, tracking-session ID, requested final state and timestamps; no coordinates.
- Excluded data: names, email addresses, phone numbers, Firebase tokens, App Check tokens and device identifiers.

`sessionStorage` survives an application reload in the same browser tab, so coordinate-free STOP reconciliation remains available after a reload. Memory-only UPDATEs are intentionally discarded on reload. Secure Technician logout explicitly purges the current UID queue. Starting tracking under another Technician account purges prior-account queues in that tab.

## Retry semantics

1. Stale UPDATEs are explicitly discarded before another ticket session begins.
2. Pending STOP actions are replayed before a new tracking session may begin.
3. A server-acknowledged STOP records `STOPPED`.
4. A failed STOP records `STOP_REQUEST_QUEUED`; it is never reported as stopped.
5. Retryable failures use bounded exponential backoff.
6. Permission, authentication, invalid-argument and failed-precondition responses become terminal reconciliation records.
7. Expired or capacity-disposed UPDATEs are removed only through the explicit disposal policy and are logged without coordinates.
8. A terminal STOP remains blocking beyond the ordinary retry TTL and cannot be evicted by UPDATE saturation.
9. The server watchdog may expire abandoned canonical sessions, but a terminal STOP still requires operational review.

## Physical acceptance evidence

The controlled pilot must prove on real Android and iPhone devices:

- normal foreground updates;
- offline UPDATE capture throttling;
- offline STOP followed by reconnect and replay;
- app reload in the same tab/session;
- account change and logout purge;
- browser/tab close and server-watchdog expiry;
- no cross-ticket UPDATE replay;
- no false `STOPPED` diagnostic before server acknowledgement;
- no false **Live GPS active** state when a watch was not installed.

This document does not claim native background-location support.
