# BIN GROUP Super App — Full Repo Status

Date: 2026-06-27
Branch: `fix/role-service-homepage-hard-live`
PR: #219
Repo: `rashidpvt420-lang/bin-group-super-app`

## Current branch state

- PR #219 is open and still draft.
- Branch has 15 commits in this fix set.
- Branch currently diverged from `main`: ahead by 15 commits and behind by 2 commits.
- Merge status from PR metadata is not mergeable at the time of this status note.
- Required next technical step before merge: update this branch with latest `main`, resolve conflicts if any, then run full checks.

## What was added and fixed in this branch

### Public app / homepage / non-digital users

- Added `src/pages/SimpleAccessLandingPage.tsx`.
- Replaced the public landing entry with a simple first screen.
- The first screen now asks users to choose only one of three paths:
  - Tenant
  - Landlord / Owner
  - Real Estate / Broker
- Added plain language copy for people who are not comfortable with apps.
- Added WhatsApp assisted support path.
- Added safe-access explanation: each role has its own portal and does not share access.
- Preserved Company Profile and Portal Login shortcuts.
- Kept the more detailed `RoleServiceLandingPage.tsx` available in the repo for richer role/service explanation.

### Owner profile / owner dashboard

- Fixed Owner Money Snapshot rent submission.
- Rent submission now creates an admin-review payment record in `payment_transactions`.
- Rent submission now calls the parent ledger callback and writes to tenant ledger flow instead of skipping it.
- Rent submission now carries file reference metadata:
  - `referenceFileUrl`
  - `referenceFilePath`
  - `referenceFileName`
- Owner rent record now includes transaction ID, ledger ID, payment method, reference, review note, return reason, paid amount and balance in the details drawer.
- Owner ROI Add Rent Income action now scrolls to the real Owner Money Snapshot form instead of using an alert-style placeholder.
- Confirmed existing owner handover review page exists at `src/owner/pages/OwnerInspectionsPage.tsx`.
- Confirmed owner handover review supports approve condition, claim/reinspection, settlement, and evidence view.
- Confirmed owner complaint command center supports approve, dispute, revisit, escalate, and evidence export.

### Tenant profile

- Added handover shortcut correction in `src/tenant/pages/TenantDocumentsPage.tsx`.
- If a tenant reaches `/tenant/documents?type=handover`, the page now forwards them to `/tenant/move-inspection/move-out`.
- This fixes the confusing path where Move-In / Move-Out looked like a document filter instead of a real inspection flow.
- Confirmed tenant dashboard already has no-call workflow cards:
  - Report issue
  - Track technician/status
  - Approve or dispute proof
- Confirmed tenant move-in/move-out page submits inspection payload through callable function and creates owner review records.

### Technician profile

- Confirmed technician dashboard already has active mission feed, duty status, accept-job action, SLA risk display, mission pool and performance information.
- No new technician code was changed in this branch.
- Remaining technician work is mainly verification/build/smoke testing, not a newly found missing route.

### Broker profile

- Fixed Broker Dashboard Add New Lead launcher route.
- It previously pointed to `/broker/leads/new`, but the broker router exposes `/broker/leads`.
- Added Broker Attribution Rule panel explaining required attribution fields.
- Recent leads now display attribution ID when available.
- Confirmed broker portal already has leads, referrals, commissions, documents, and attribution proof routes.

### Admin profile

- Added `apps/admin-panel/src/pages/admin/AdminPropertyApprovalsResolvedPage.tsx`.
- Routed `/properties/approvals` to the resolved property approval page.
- Admin property approval page now supports:
  - Approve property
  - Request more documents
  - Close review
  - Admin note / document request note
  - Manual annual contract value review
  - Manual value reason
  - 15% deposit recalculation from manual annual value
  - Dual audit logging to `audit_logs` and `auditLogs`
- Added `apps/admin-panel/src/pages/admin/StaffAccessResolvedPage.tsx`.
- Routed `/staff-access` to the resolved staff access page.
- Staff access page now supports:
  - Add staff record
  - Edit staff role
  - Edit staff module permissions
  - Suspend staff access
  - Restore staff access
  - Dual audit logging to `audit_logs` and `auditLogs` for staff access changes

### Cybersecurity / Firebase Storage

- Updated `storage.rules`.
- Added helper checks for linked owner access through tenant profile and property owner relationship.
- Tenant inspection evidence remains protected by authentication.
- Tenant can still write only their own inspection image evidence.
- Linked owners can now read inspection evidence when they match the tenant or property relationship.
- Added safer property-linked inspection path:
  - `/inspections/{tenantId}/properties/{propertyId}/{fileName}`
- Existing legacy path remains supported:
  - `/inspections/{tenantId}/{fileName}`

### Documentation / audit trail

- Added `docs/HARD_LIVE_DEEP_APP_AUDIT_2026_06_27.md`.
- Added `docs/HARD_LIVE_FIX_BATCH_2_2026_06_27.md`.
- Added this full repo status file.

## What is still left to add or fix

### Repo / merge / verification

- Branch must be updated with latest `main` because it is behind by 2 commits.
- PR is still draft and not mergeable.
- Local/CI commands were not run from this connector session.
- Required checks before merge:
  - `npm run typecheck`
  - `npm run build`
  - `npm run build:admin`
  - `npm run test:hard-launch-readiness`
  - Firebase rules tests
  - Live 5-profile smoke test

### Public app

- Need live UX smoke test on phone for older/non-digital users.
- Need confirm LoginPage honors `role` and `next` query parameters.
- Need decide whether detailed role-service landing should remain reachable from a route such as `/services` or `/role-services`.

### Owner profile

- Need verify owner rent payment writes pass Firestore rules in live project.
- Need owner-side PDF one-click export for:
  - rent ledger
  - property passport
  - evidence pack
  - owner statement
  - inspection/handover report
- Need owner move-in/move-out review smoke test with real uploaded evidence.

### Tenant profile

- Need update the tenant dashboard service button itself to route directly to `/tenant/move-inspection/move-out`; current fix forwards through documents if query type is handover.
- Need add a clearer Move-In vs Move-Out choice screen for tenants.
- Need test Arabic labels for all tenant handover steps.

### Technician profile

- Need verify technician accept/on-site/resolve workflow on live Firebase rules.
- Need confirm before/after evidence upload path works after Storage rules changes.
- Need verify offline/poor connection behavior.

### Broker profile

- Need verify broker attribution records persist across lead to contract to commission.
- Need admin broker commission review smoke test.
- Need PDF commission statement export.

### Admin profile

- Need run admin build after routing to resolved pages.
- Need confirm resolved pages compile with existing admin theme/shared imports.
- Need integrate real smoke-test documents into launch health dashboard, not just visible dashboard summaries.
- Need one-click PDF exports from admin report areas.
- Need verify resolved staff page works with Firebase Auth creation flow. Current resolved page creates/updates Firestore staff records and audit logs; Firebase Auth account creation still depends on existing backend/operations process.

### Cybersecurity

- Need App Check production site key active.
- Need Stripe/live payment webhook hardening and verification.
- Need admin password rotation before public launch.
- Need branded sender domain and email security checks.
- Need production penetration test / abuse test.
- Need backup/restore drill.
- Need security rules tests after Storage rules update.
- Need rate limiting and abuse protection on callable functions.

## Practical conclusion

The app is moving in the right direction. It is now much easier for non-digital users on the public entry point, and the major remaining hard-live gaps were reduced significantly. It is still not safe to call it fully public-launch complete until the branch is updated with `main`, CI/build/rules tests pass, Firebase production settings are verified, and a 5-profile live smoke test is completed.
