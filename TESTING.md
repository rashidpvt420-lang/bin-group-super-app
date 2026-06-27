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

## Notes

- Client Firebase config is public Web SDK configuration; service-account secrets must never be committed.
- App Check should be enabled only when the production site key is configured.
- Stripe/live payment keys, branded email sender, and admin password rotation remain environment/operations tasks, not source-code-only tasks.
