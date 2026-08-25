# Product Consolidation Wave 3

Base protected main: `efb8e3618d26afb95c350cefd2cef93a912fc641`

## Scope

This wave improves truth and resilience without changing production authority or claiming launch readiness.

### Owner financial truth

- Adds one prominent amount-payable equation to Owner Simple Home.
- Uses the same Owner-scoped `propertyPassports` fields and current 5% management-fee rule already used by `OwnerFinancialsPage`.
- Shows the equation inputs, source collection, record count, refresh time and pending-verification amount.
- Fails visibly when the live source cannot be loaded; it does not substitute cached or fabricated values.

### Technician evidence resilience

- Adds an IndexedDB-backed photo evidence queue that preserves the Blob across offline sessions/app restarts.
- Wires durable queuing into before-work evidence when offline or after retryable Storage/network failure.
- The existing protected server callable remains the authority that verifies before-work evidence.
- Start Work remains disabled until that server-backed evidence appears on the ticket.
- The queue utility includes fail-closed completion-evidence replay infrastructure for a later producer integration; this Wave does not claim completion-photo capture is fully wired.
- The technician shell exposes unsent action and photo counts.
- The automatic sync agent replays lifecycle actions and supported queued photo evidence when connectivity returns.
- No offline queue path auto-completes a mission.

## Explicit non-goals

- No Firebase rules changes.
- No App Check/Auth weakening.
- No production deployment.
- No launch evidence generation.
- No Admin/HR lifecycle merge.
- No automatic mission completion from offline state.

## Required verification

Before merge, require the exact-head PR validation and BIN GROUP CI chain to pass. Protected authenticated/real-device testing remains separate release evidence.
