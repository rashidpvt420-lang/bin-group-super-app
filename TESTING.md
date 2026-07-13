# BIN GROUP Super App Testing & Launch Verification

This repo is a multi-surface Firebase/React platform. Use the root scripts as the source of truth for validation instead of the old `backend`, `admin-panel`, or `tenant-app` folder commands.

## Current app surfaces

- Public / main PWA: root Vite app in `src/`
- Owner portal: `src/owner/`
- Tenant portal: `src/tenant/`
- Technician portal: `src/technician/`
- Broker portal: `src/broker/`
- Admin bridge inside main app: `src/admin/AdminTerminal.tsx`
- Dedicated admin panel: `apps/admin-panel/`
- Dedicated owner app package: `apps/owner-app/`
- Shared package: `packages/shared/`
- Firebase Functions: `functions/`
- Firebase rules / launch scripts: `firestore.rules`, `storage.rules`, `scripts/`, `test/`

## Install

```bash
npm install --legacy-peer-deps
```

For the dedicated admin panel:

```bash
npm --prefix apps/admin-panel install --legacy-peer-deps
```

For the dedicated owner app:

```bash
npm --prefix apps/owner-app install --legacy-peer-deps
```

## Build commands

### Main public / role portal app

```bash
npm run build
```

Low-memory build option:

```bash
npm run build:lowmem
```

### Shared package

```bash
npm run build:shared
```

### Dedicated admin panel

```bash
npm run build:admin
```

Equivalent direct command:

```bash
npm --prefix apps/admin-panel run build
```

### Dedicated owner app

```bash
npm run build:owner
```

### Firebase Functions

```bash
npm run build:functions
```

## Typecheck

```bash
npm run typecheck
```

## Firestore rules validation

Prepare and harden rules:

```bash
npm run prepare:rules
```

Verify rule hardening:

```bash
npm run verify:rules-hardening
```

Run rules tests through the emulator:

```bash
npm run test:rules
```

Run the node-only rule test path:

```bash
npm run test:rules:node
```

## Launch gates

### Pilot clearance

```bash
npm run test:pilot-clearance
```

### Public launch clearance

```bash
npm run test:launch-clearance
```

### Hard launch readiness

```bash
npm run test:hard-launch-readiness
```

### Full hard launch gate

```bash
npm run launch:hard-gate
```

## Runtime and stability audits

```bash
npm run test:runtime-audit
npm run test:stability
npm run test:repo-hygiene
npm run test:mobile-store-readiness
npm run test:uae-platform-config
npm run test:hr-smoke
```

## E2E tests

Verify E2E environment:

```bash
npm run test:e2e:env
```

Run public production smoke tests:

```bash
npm run test:e2e:public
```

Run local production smoke tests:

```bash
npm run test:e2e:local
```

Run launch audit E2E tests:

```bash
npm run test:e2e:launch-audit
```

Run business workflow E2E tests for all profiles:

```bash
npm run test:e2e:business
```

## Mobile readiness

```bash
npm run mobile:check
npm run mobile:sync
```

Android and iOS shell commands:

```bash
npm run mobile:add:android
npm run mobile:open:android
npm run mobile:add:ios
npm run mobile:open:ios
```

## Profile verification checklist

Run or manually verify these surfaces after every launch-blocker fix:

### Owner

- Login resolves owner role and redirects to `/owner/dashboard`.
- Dashboard unlocks only after active/verified contract state.
- Owner can see properties, contracts, financials, IBAN, payment proof, tenants, tickets, approvals, documents, property passport, inspections, AI intelligence, and BIN Connect.
- Owner approval center and pending payment counters match Firestore records.

### Tenant

- Login resolves tenant role and redirects to `/tenant/dashboard`.
- Tenant can report issue, open tickets, view ticket detail, use emergency/SOS, documents, unit view, gate pass, amenities, payments, and move-in/move-out inspection.
- Arabic labels and RTL layout remain usable in the tenant shell.

### Technician

- Login resolves technician role and redirects to `/technician/dashboard`.
- Technician can view jobs, job detail, proof readiness, chat, map, history, profile, HR, offline queue, support, BIN Connect, and pilot completion.
- Accept / on-site / resolve proof workflow must preserve before/after evidence.

### Broker

- Login resolves broker role and redirects to `/broker/dashboard`.
- Broker can manage leads, referrals, commissions, attribution, documents, and profile.
- Commission status and referral attribution must stay linked to broker identity.

### Admin

- Main app `/admin/*` bridge opens the dedicated admin panel.
- Dedicated admin dashboard loads without React hook errors.
- Admin can access owners, tenants, tickets, technicians, map, SOS, document vault, audit, payments, broker management, property approvals, unit status, HR, pricing, contract termination, orphan war room, public ops, and reports.

## Required manual production smoke test

After builds pass, run a real five-profile smoke test in Firebase production or staging:

1. Owner onboarding: property intake → quote → contract → payment proof → activation → owner dashboard.
2. Tenant flow: tenant login/invite → maintenance request with evidence → ticket tracking → verification/dispute path.
3. Technician flow: job assigned → accept → en route/on site → resolve with before/after proof.
4. Broker flow: referral/lead submission → attribution proof → commission queue.
5. Admin flow: owner approval → payment verification → technician approval → broker commission review → audit log check.

## Gate 11 live E2E (Windows / local against production)

These scripts live on branch `cursor/hard-launch-gate-redesign-30e9` (PR #237). If `npm run` reports **Missing script: test:e2e:profile-gates**, pull that branch first:

```bash
git fetch origin
git checkout cursor/hard-launch-gate-redesign-30e9
git pull origin cursor/hard-launch-gate-redesign-30e9
npm install --legacy-peer-deps
```

Copy `.env.e2e.example` → `.env.e2e` and fill all `E2E_*` credentials plus `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`.

```bash
npm run seed:e2e:gate11
npm run test:e2e:profile-gates
npm run test:e2e:walkthrough
npm run test:e2e:launch-audit:live
```

### App Check debug token limit (20 max)

If `e2e:ensure-appcheck` or launch-audit fails with **Maximum number of debug tokens reached (20)**:

1. Firebase Console → **App Check** → **BIN GROUP Web** → **Debug tokens**
2. Delete unused/old E2E tokens (keep the UUID already in `.env.e2e`)
3. Register that **same** UUID once under BIN GROUP Web (`1:123413252227:web:285cb53bc26626d699f3b6`). Main and admin hosting share this Firebase Web App.
4. Re-run — `npm run e2e:ensure-appcheck` validates format **and** live `exchangeDebugToken` registration

### `exchangeDebugToken` HTTP 403 (profile-gates 0/14 after `build:live`)

If hosted-appcheck passes but E2E shows:

`HTTP 403 …/exchangeDebugToken`

the UUID in `.env.e2e` is **not registered** in Console (common after `[guid]::NewGuid()` without Console update).

Fix:

1. Copy fingerprint from `npm run e2e:ensure-appcheck` output (`bf4cc08b…d0d3` style)
2. Firebase Console → App Check → BIN GROUP Web → Debug tokens → Add → paste **exact** UUID
3. Do **not** rotate `.env.e2e` again until profile-gates passes
4. Re-run: `npm run e2e:ensure-appcheck` (must print `[appcheck-registration] ok`)

### App Check in the hosting build (required for credentialed E2E)

If profile-gates fail with `[ROLE-SYNC] Missing or insufficient permissions` or `permission-denied` on every role, the **deployed** bundle likely omitted App Check while Console enforces it.

Add to `.env.e2e` (public site key from Firebase Console → App Check):

```env
VITE_APP_CHECK_SITE_KEY=6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Rebuild and redeploy hosting **from the same commit** you test:

```bash
npm run build:live
firebase deploy --only hosting --project bin-group-57c60
node scripts/verify-hosted-appcheck.mjs
```

**PowerShell** (quote `--only` targets; install deps first if `vite` is not recognized):

```powershell
cd "C:\Users\My-PC\Desktop\bin-app-e2e-redesign"
git fetch origin cursor/hard-launch-gate-redesign-30e9
git reset --hard origin/cursor/hard-launch-gate-redesign-30e9
npm run setup:e2e

# .env.e2e must include BOTH:
# VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=878faabb-b281-4159-a84d-dc1bed73eb2e
# VITE_APP_CHECK_SITE_KEY=6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Register that UUID under App Check debug tokens for BOTH web apps (main + admin).

npm run launch:deploy:hosting
# or manually:
# npm run build:live
# firebase deploy --only "hosting" --project bin-group-57c60
# node scripts/verify-hosted-appcheck.mjs
```

`verify-hosted-appcheck` must print `[hosted-appcheck] ok` for **main** and **admin** before running profile-gates.

Then re-run `npm run test:e2e:profile-gates`.

## Notes

- Client Firebase config is public Web SDK configuration; service-account secrets must never be committed.
- App Check should be enabled only when the production site key is configured.
- Stripe/live payment keys, branded email sender, and admin password rotation remain environment/operations tasks, not source-code-only tasks.
