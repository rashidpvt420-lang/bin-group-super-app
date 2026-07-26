# Technician GPS Retry and Privacy Policy

## Launch policy

BIN GROUP uses **foreground-browser GPS** for the controlled pilot. Tracking is active only while the Technician mission page remains open and the browser continues delivering geolocation callbacks. The server expiry watchdog is a safety fallback; it is not evidence that the browser successfully stopped a session.

## Retry storage

The browser may temporarily retain failed GPS actions so a short network interruption does not leave the canonical server state inconsistent.

- Storage: `sessionStorage` only.
- Scope: one key per authenticated Technician UID.
- Lifetime: maximum 30 minutes per action.
- Capacity: maximum 25 actions per Technician session.
- UPDATE data: ticket ID, tracking-session ID, timestamp, rounded latitude/longitude, accuracy, heading and speed only.
- STOP data: ticket ID, tracking-session ID, requested final state and timestamps; no coordinates.
- Excluded data: names, email addresses, phone numbers, Firebase tokens, App Check tokens and device identifiers.

`sessionStorage` survives an application reload in the same browser tab but is removed when the tab/session ends. Secure Technician logout explicitly purges the current UID queue. Starting tracking under another Technician account purges prior-account queues in that tab.

## Retry semantics

1. Pending STOP actions are replayed before a new tracking session may begin.
2. A server-acknowledged STOP records `STOPPED`.
3. A failed STOP records `STOP_REQUEST_QUEUED`; it is never reported as stopped.
4. Retryable failures use bounded exponential backoff.
5. Permission, authentication, invalid-argument and failed-precondition responses become terminal reconciliation records.
6. Expired or capacity-disposed actions are removed only through the explicit disposal policy and are logged without coordinates.
7. The server watchdog may expire abandoned canonical sessions, but a terminal STOP still requires operational review.

## Physical acceptance evidence

The controlled pilot must prove on real Android and iPhone devices:

- normal foreground updates;
- offline UPDATE capture throttling;
- offline STOP followed by reconnect and replay;
- app reload in the same tab/session;
- account change and logout purge;
- browser/tab close and server-watchdog expiry;
- no false `STOPPED` diagnostic before server acknowledgement.

This document does not claim native background-location support.
