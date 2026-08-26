# Product Consolidation Wave 4 — Protected Completion Evidence

Base protected main: `9a8efe59c1a55bf7407caace2715a06e8124afeb`

## Scope

This wave closes the durable Technician **after-work/completion photo** gap documented by Wave 3 without weakening Auth, App Check, Firestore rules, Storage rules, or the protected lifecycle state machine.

### Protected after-work evidence

- Adds `submitTechnicianAfterWorkEvidence` with `enforceAppCheck: true` in `europe-west3`.
- Requires an authenticated, active Technician assigned to the mission.
- Accepts after-work evidence only while the mission is `IN_PROGRESS`.
- Verifies the uploaded Storage object exists, is an image up to 10 MB, belongs to the mission path, and carries the authenticated Technician metadata.
- Writes the verified photo to the ticket through the Admin SDK and records a deterministic server-only `technicianEvidenceConfirmations` document.
- Audits every successful confirmation as `TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMED`.

### Completion lifecycle gate

- `updateTicketLifecycle` continues to require verified Technician before-work evidence before `IN_PROGRESS`.
- `COMPLETED` and `COMPLETED_PENDING_APPROVAL` now additionally require:
  - server-confirmed Technician after-work ticket evidence, and
  - the matching server-only `technicianEvidenceConfirmations` record.
- Generic client-written `afterPhotoUrl`, `completionPhotos`, or local photo state cannot satisfy the protected completion gate by themselves.
- Admin lifecycle authority remains unchanged.

### Durable offline behavior

- The IndexedDB evidence queue now supports both `before_work` and `after_work` image evidence.
- After-work images survive offline sessions and app restarts as Blob data.
- Replay uploads the exact image with `technician_after_work` metadata and calls the protected after-work evidence callable.
- Offline synchronization now replays **photo evidence before mission lifecycle actions**, preventing a queued `COMPLETED` action from racing ahead of its required proof.
- The queue never writes mission completion state directly.

### Technician UX

- Adds a dedicated After-Work Completion Evidence surface to Technician job routes while the mission is `IN_PROGRESS`.
- Offline capture reports that completion remains locked until upload and protected server verification succeed.
- Online capture does not report verified readiness until the protected callable succeeds and the live ticket snapshot converges to server-confirmed evidence.

## Explicit non-goals

- No production deployment.
- No hard-public-launch claim.
- No Firebase/Auth/App Check weakening.
- No Firestore or Storage rules changes.
- No automatic mission completion from offline state.
- No Admin/HR lifecycle changes.

## Required verification

Before merge, require the exact-head PR Validation, BIN GROUP CI, Play Integrity PR Validation, Firestore verification, profile/onboarding audit, and all other automatically triggered protected checks to complete successfully. Protected authenticated and physical-device testing remains separate release evidence.
