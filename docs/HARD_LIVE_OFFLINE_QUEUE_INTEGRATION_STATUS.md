# Hard-live Offline Queue Integration Status

## Added

- `src/technician/utils/offlineQueue.ts`
  - Durable local-storage queue model.
  - Shared queue key: `bin_offline_queue`.
  - Helpers: load, save, enqueue, remove, clear, mark retrying, mark failed.
  - Dispatches `bin-offline-queue-updated` browser event after queue changes.

- `src/technician/utils/offlineJobActions.ts`
  - Callable wrapper for Firebase job actions.
  - Queues job actions when browser is offline or callable fails with network-like errors.
  - Added wrappers for:
    - `acceptTechnicianTicket`
    - `updateTicketLifecycle`

## Current blocker

`TechnicianJobDetailPage.tsx` is the live page that calls `acceptTechnicianTicket` and `updateTicketLifecycle`. Direct full-file updates to this page were blocked by the connector safety layer during implementation attempts.

## Remaining integration

- Replace direct `httpsCallable(functions, 'acceptTechnicianTicket')` with `acceptJobWithOfflineQueue(ticketId, technicianId)`.
- Replace direct `httpsCallable(functions, 'updateTicketLifecycle')` with `updateJobLifecycleWithOfflineQueue(...)`.
- When wrapper returns `{ queuedOffline: true }`, show the technician a queued message and route to `/technician/offline`.
- Keep photo uploads online-only until a separate evidence-file queue is implemented.

## Product status

The durable queue and action wrapper are implemented. The final live job-detail binding remains pending because the large page update was blocked.
