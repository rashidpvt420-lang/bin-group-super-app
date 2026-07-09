# Public Launch Fixes — 2026-07-09

## Decision

YES — BIN GROUP Super App can proceed to controlled public launch and mobile store packaging after this branch is merged and deployed.

## What this branch fixes

### 1. Admin command center dead-end fixed

Previous risk:

- Main app `/admin/*` rendered `AdminTerminal`.
- `AdminTerminal` sent admins to `https://bin-group-admin-panel.web.app`.
- The admin-panel app redirected back to the main app `/admin/dashboard`.
- Result: a manual bridge dead-end risk.

Fix:

- `/admin/*` now renders an in-app admin command center.
- The in-app command center loads live Firestore metric counts for owners, tenants, technicians, brokers, open tickets and payment review queue.
- It shows launch gates, five-profile smoke test steps, verification runbook and audit preview.
- Legacy admin-panel remains optional/fallback only.

### 2. Public trust routes added

Added public routes:

- `/trust`
- `/trust-center`

These expose the existing Trust Center page and make it reachable by users, owners, tenants, store reviewers and support teams.

### 3. Trust Center expanded

Trust Center now includes:

- Public rules of trust.
- Owner onboarding unlock path.
- Google Play / Apple App Store data-safety category map.
- Controlled pilot trust positioning.

### 4. Admin verification script updated

`scripts/verify-admin-dashboard-access.mjs` now checks the new canonical architecture:

- Main app contains `/admin/*` and Trust Center routes.
- AdminTerminal contains live command center tokens.
- Old bridge-only tokens are forbidden.
- Admin panel remains redirect-only.
- Required launch verification scripts exist.

## Required verification after merge

Run these commands from a clean checkout:

```bash
npm run build
npm run build:functions
npm run test:stability
node scripts/verify-admin-dashboard-access.mjs
npm run test:hard-launch-readiness
npm run test:mobile-store-readiness
```

## Required live smoke test after deploy

Use real or reviewer-safe seeded accounts:

1. Owner: onboarding → contract signature → payment proof → admin approval → dashboard unlock.
2. Tenant: unit linked → maintenance request with photo → ticket tracking → completion review.
3. Technician: open job → claim/accept → arrive → before/after proof → resolve.
4. Broker: referral/lead submission → attribution proof → commission state visible.
5. Admin: `/admin/dashboard` loads in-app command center, metrics, runbook, audit preview and links.

## Mobile store packaging notes

Use Trust Center data-safety map for:

- Google Play Data Safety.
- Apple App Privacy.
- Reviewer notes and demo instructions.

## Final launch statement

After this branch passes build/test and production smoke verification, launch status remains:

**YES — ready for controlled public launch and store submission preparation.**
