# Technician GPS Server Session Authority

The canonical `technician_live_locations/{technicianUid}` document is the server authority for the currently active tracking ticket and session.

## UPDATE

An UPDATE may continue an unexpired active session only when both `ticketId` and `trackingSessionId` match the canonical document. A stale tab, delayed retry or cross-ticket request is rejected. A new session may replace only a missing, stopped or expired canonical session.

## STOP

A STOP is applied only when its ticket and session match the canonical active state. After acknowledgement, the server preserves `lastStoppedTicketId` and `trackingSessionId`, making a duplicate STOP idempotent only for the same original ticket/session. A delayed STOP from another ticket or superseded session fails closed.

If the original ticket document was deleted after the canonical session began, an exact authenticated ticket/session STOP may still clear the canonical live document and Technician/User mirrors. The missing ticket mirror is skipped; an unrelated or reassigned existing ticket remains permission denied.

## Expiry watchdog

Each stale query candidate is re-read in a Firestore transaction. Reconciliation occurs only when tracking status, ticket, session and expiry still match and the session remains expired at transaction time. Renewed or superseded candidates are skipped and audited without claiming reconciliation.

This document defines source authority only. Production deployment and physical-device evidence remain separate gates.
