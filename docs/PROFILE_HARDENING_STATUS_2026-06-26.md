# BIN GROUP Super App — Profile Hardening Status

Date: 2026-06-26
Scope: Owner, Tenant, Technician, Broker, Admin/Operations, and controlled pilot launcher.

This document tracks what has been added, what is still missing, and what must be fixed before controlled friend/team testing and before full public launch.

## Current execution rule

- Controlled pilot sharing is allowed only with trusted friends/team after latest production workflow is green.
- Full public commercial launch is still blocked until live payment, App Check, branded email, and smoke-test requirements are completed.
- Admin is an internal Operations profile, not a public customer profile.

## Repository hygiene status

### Fixed

- Closed unsafe PR #213 because it rewrote the public landing page and had review findings: wrong address translation key and missing legal/support footer links.
- Closed unsafe draft PR #214 because it was not mergeable, build was not run, and it overlapped current `main` tenant shell work.
- Open PR queue is currently clear.

### Still missing

- Latest commit workflow must be observed green before sharing broadly.
- Any future PR must be small, current-main based, and build-verified before merge.

## Owner profile

### Added / fixed

- Owner shell exposes dashboard, property passport, contracts, payments, documents, inspections/handover, approvals, financials, notifications, support, and pilot completion routes.
- Property passport detail page now has an explicit Handover tab and button to Owner Handover Center.
- Root property passport page no longer shows fake `0.0000, 0.0000` GPS; missing GPS now shows `GPS not configured` and disables map open.
- Owner handover backend callables were added:
  - `listOwnerHandoverInspections`
  - `updateOwnerHandoverInspection`

### Still missing / needs fix

- Existing Owner Handover UI still needs safe wiring to use the new callables instead of direct Firestore access.
- Owner payment proof detail drawer/page still needs a stronger proof-review view.
- Live technician ETA/map from owner ticket view still needs final smoke testing.
- Owner dashboard needs final role-smoke test with real owner account and linked property/contract/tenant/ticket data.

### Next safe patch

- Add a new callable-backed Owner Handover page or refactor the existing one in smaller chunks if connector allows it.

## Tenant profile

### Added / fixed

- Tenant header now has visible quick actions:
  - Report Issue
  - Emergency
  - Payments
  - Move In/Out
- Tenant move-in/move-out inspection now loads linked unit/property.
- Tenant inspection submits through `submitTenantMoveInspection` callable, avoiding missing direct Firestore write rules.
- Tenant submission writes owner-visible `propertyInspections` and legacy `inspections` through backend validation.

### Still missing / needs fix

- Tenant dashboard needs final live test with a real tenant linked to a unit.
- Tenant photo upload/storage rule path must be smoke-tested.
- Tenant notification delivery after ticket creation/completion must be checked in production.
- Tenant approval/dispute after technician completion needs end-to-end test.

### Next safe patch

- Add a small tenant workflow checklist card to the dashboard for pilot testers if not already obvious enough.

## Technician profile

### Added / fixed

- Technician header now has visible quick actions:
  - Jobs
  - Live Map
  - Offline Queue
  - Support
- Technician job detail blocks close until proof requirements are ready.
- Technician job detail writes local offline queue items when offline or when lifecycle update fails.
- Offline queue page can replay eligible lifecycle actions using existing protected callables:
  - `acceptTechnicianTicket`
  - `updateTicketLifecycle`
- Completion with proof photos remains manual/live-only for safety.

### Still missing / needs fix

- Automatic offline photo upload is not implemented.
- Technician map/GPS requires real device smoke testing.
- Technician proof upload Storage rules and download URLs must be tested in production.
- Technician performance/leaderboard needs real data validation.

### Next safe patch

- Add field test checklist to technician dashboard: accept, en-route, arrived, in-progress, proof, completion, offline replay.

## Broker profile

### Added / fixed

- Broker routes exist for dashboard, leads, referrals, commissions, attribution proof, documents, and profile.
- Broker attribution proof route exists.
- Broker commission queue is visible in Admin/Operations dashboard logic.

### Still missing / needs fix

- Broker top-bar quick actions are still missing because the attempted shell patch was blocked by connector safety filters.
- Broker referral/new-deal creation needs live account test.
- Attribution chain must be locked on contract activation:
  - broker → lead/referral → owner/property/tenant → contract → commission
- Commission approval proof needs final admin-to-broker workflow test.

### Next safe patch

- Add a minimal broker dashboard card for New Referral / Proof Chain if shell patch remains blocked.

## Admin / Operations profile

### Added / fixed

- Admin recovery UI merge was stabilized after PR #210 risk.
- Admin dashboard previously gained review routing, payment proof queue, broker commission queue, SLA risk, launch health, and no fake MRR fallback.
- Unsafe draft admin dashboard PR #214 was closed because it was not mergeable and build was not run.

### Still missing / needs fix

- Admin/Operations launch checklist panel still needs final direct status for:
  - Stripe live keys
  - Firebase App Check production key
  - branded email sender
  - admin password/secret rotation
  - five-profile smoke test
- Admin dashboard must be rechecked after newest profile changes.
- Firestore rules direct `propertyInspections` rule still useful even though callables now cover submission/list/update paths.

### Next safe patch

- Add or verify a dedicated Launch Readiness panel in Operations with blocked/ready states.

## Public / Launcher

### Added / fixed

- New public pilot launcher page added:
  - `/pilot-launch`
  - `/share`
  - `/friends`
- Launcher has cards for Owner, Tenant, Technician, Broker, invoice verification, certificate verification, feedback, and demo videos.
- Launcher now includes profile-specific test missions and pass criteria.
- Launcher clearly says this is controlled pilot only, not full public commercial launch.
- Launcher now includes Company, Support, Privacy, Terms, and Feedback footer links so public safeguards remain visible.

### Still missing / needs fix

- Latest deploy workflow must be confirmed green before sharing the launcher.
- Public company profile should be rebuilt from current `main` in a small safe patch, not by resurrecting PR #213 as-is.

### Next safe patch

- Add a small public company profile improvement from current `main` only if it preserves footer/legal/support safeguards.

## Final smoke-test checklist

Run after latest deploy is green:

1. Owner: login → dashboard → passport → handover → payments → documents → support.
2. Tenant: login → report issue with photo → emergency → payment/documents → move-in/out report.
3. Technician: login → jobs → job detail → lifecycle → proof readiness → offline replay → map/support.
4. Broker: login → leads → referrals → attribution → commissions → documents.
5. Admin/Operations: login → dashboard → approval queues → payment proof → broker commission → SLA risk → launch health.
6. Public: `/share` → role cards → feedback → invoice verify → certificate verify.

## Current share URL after green deploy

`https://bin-group-57c60.web.app/share`

Use only for trusted friend/team testing until full public launch blockers are cleared.
