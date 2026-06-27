# BIN GROUP Super App — Blocker Fix Log

Date: 2026-06-27
Mode: hard-live blocker cleanup

## Fixed in this pass

### Repo / PR hygiene

- Closed PR #219 because it was draft, not mergeable, and duplicated role-first homepage work already safely pushed to `main`.
- Closed PR #218 because it was not mergeable and rewrote the admin dashboard from an old base with 508 deletions.

### Public UX blocker

- Added `src/pages/public/SimpleStartPage.tsx`.
- Switched `src/pages/LandingPage.tsx` to render the simple role-first page.
- Home now asks users whether they are:
  - Tenant
  - Landlord / Owner
  - Real Estate Broker
  - Technician
- The page supports English and Arabic.
- The page narrows users to only the relevant first actions instead of sending everyone into a long interface.

### Launcher blocker

- `/share`, `/pilot-launch`, and `/friends` already exist.
- Launcher includes profile test missions.
- Launcher now includes Company, Support, Privacy, Terms, and Feedback links.

### Broker blocker

- Fixed broken `/broker/leads/new` route.
- Broker dashboard already linked to `/broker/leads/new`, but the route was not defined in `BrokerApp.tsx`.
- Added the route so Add New Lead no longer falls through.

### Owner handover blocker

- Added callable-backed owner review queue page: `src/owner/pages/OwnerReviewQueuePage.tsx`.
- Wired `/owner/inspections` to `OwnerReviewQueuePage`.
- The page uses:
  - `listOwnerHandoverInspections`
  - `updateOwnerHandoverInspection`
- Owner can now see submitted move-in/move-out evidence and action records through Functions instead of direct Firestore reads.

## Still blocked by environment or production secrets

These cannot be fixed purely by code in chat. They require live configuration or production testing.

1. Stripe live keys
   - Required before real payment collection.
   - Must be set in Firebase/hosting/functions environment.

2. Firebase App Check production key
   - Required before broad public sharing.
   - Must be enabled for production domain.

3. Branded email sender
   - Required before real customer notifications.
   - Must be verified through the email provider and Firebase Functions config.

4. Admin secret/password rotation
   - Must be performed in the live secret store / auth provider.

5. Latest workflow verification
   - GitHub connector often does not expose direct-main workflow runs.
   - Confirm in GitHub Actions UI that latest production deploy is green.

6. Full five-profile live smoke test
   - Requires real test accounts and linked live records:
     - Owner with property/contract/payment
     - Tenant linked to unit
     - Technician assigned to ticket
     - Broker with lead/referral
     - Admin/Operations account

## Remaining code-hardening backlog

### Owner

- Add richer payment proof drilldown.
- Add owner rent collection KPI/table from tenant ledger.
- Add map/ETA summary for active assigned tickets.

### Tenant

- Live smoke test tenant photo upload path and notification delivery.
- Add an even simpler dashboard checklist if testers still get lost.

### Technician

- Smoke test real mobile GPS and Storage proof URLs.
- Automatic offline photo upload remains intentionally manual for now.

### Broker

- Improve `/broker/leads/new` so it opens the Add Lead dialog immediately instead of opening the leads page first.
- Confirm attribution lock from lead/referral to contract and commission after live conversion.

### Admin / Operations

- Add explicit Launch Health rows for:
  - Stripe live mode
  - App Check production
  - Branded email
  - Admin secret rotation
  - Five-profile smoke status
- Existing Launch Health panel is present, so this should be a small current-main patch, not an old dashboard rewrite.

## Share only after green deploy

Controlled testing URL:

`https://bin-group-57c60.web.app/share`

Do not use for full public commercial launch until the environment blockers and smoke test are complete.
