# BIN GROUP Super App Testing and Launch Verification

This repository is a multi-surface Firebase and React platform. Run validation from the current `main` branch or the exact pull-request head under review. Never check out an obsolete feature branch to obtain launch scripts.

## Current app surfaces

- Public and role PWA: root Vite app in `src/`
- Owner portal: `src/owner/`
- Tenant portal: `src/tenant/`
- Technician portal: `src/technician/`
- Broker portal: `src/broker/`
- Main-app Admin status bridge: `src/admin/AdminTerminal.tsx`
- Dedicated Admin panel: `apps/admin-panel/`
- Dedicated Owner package: `apps/owner-app/`
- Shared package: `packages/shared/`
- Firebase Functions: `functions/`
- Firebase rules and launch controls: `firestore.rules`, `storage.rules`, `scripts/`, `test/`, `tests/`

## Install

```bash
npm ci --include=optional --legacy-peer-deps
npm --prefix apps/admin-panel ci --legacy-peer-deps
```

Install the dedicated Owner package only when validating that package:

```bash
npm --prefix apps/owner-app ci --legacy-peer-deps
```

## Mandatory source validation

```bash
npm run test:repo-hygiene
npm run test:launch-honesty
npm run typecheck
npm run lint
npm run build:shared
npm run build
npm run build:admin
npm run build:functions
npm run test:rules
npm run test:stability
npm run test:mobile-store-readiness
```

The protected GitHub workflows run the authoritative CI matrix. A local pass does not prove hosted or provider state.

## Launch gates

```bash
npm run test:pilot-clearance
npm run test:launch-clearance
npm run test:hard-launch-readiness
npm run launch:hard-gate
npm run launch:status
```

These commands are fail-closed evidence validators. They do not replace protected production deployment, hosted App Check, live payment, email-delivery, or five-profile evidence.

## E2E validation

Verify the environment first:

```bash
npm run test:e2e:env
npm run e2e:ensure-appcheck
```

Public smoke:

```bash
npm run test:e2e:public
```

Credentialed launch audit:

```bash
npm run test:e2e:launch-audit
npm run test:e2e:profile-gates
npm run test:e2e:walkthrough
```

Business evidence:

```bash
npm run test:e2e:business
```

Staging route validation:

```bash
npm run test:e2e:gate11:routes
npm run test:e2e:gate11:staging
```

All listed scripts are present on current `main`. If a command is missing, update the branch from `origin/main`; do not switch to a historical feature branch.

## Five-profile checklist

### Owner

- Login resolves the Owner role and routes to the Owner dashboard.
- Dashboard access requires complete active and verified contract state.
- Properties, contracts, financials, payment proof, tenants, requests, approvals, documents, property passport and inspections load from real records.

### Tenant

- Login or invitation resolves the Tenant role and residence binding.
- Maintenance request, emergency, evidence, tracking, review, dispute, documents, access and payment paths remain available.
- Arabic and RTL remain usable.

### Technician

- Login resolves an approved Technician account.
- Assignment, acceptance, arrival and completion remain server-authoritative.
- Arrival uses valid location evidence and completion requires before-and-after proof plus notes.

### Broker

- Login resolves the Broker role.
- Leads, referrals, attribution, commission and payout state remain identity-bound and server-authoritative.

### Admin

- The main-app Admin bridge remains read-only.
- The dedicated Admin panel loads without runtime errors.
- Privileged Owner, Tenant, Technician, Broker, payment, contract, document, audit, unit, HR and launch operations use protected server operations.

## Required hosted production sequence

1. Deploy the exact current `main` SHA only through the protected production workflow.
2. Verify deployment metadata and same-run artifact bindings.
3. Verify hosted App Check for the main and Admin surfaces.
4. Seed or repair the five role accounts through protected tooling.
5. Run exact-SHA live evidence and the five-profile walkthrough.
6. Complete the controlled pilot and record incidents, monitoring and rollback evidence.
7. Run hard-clearance and public-release gates only after all required evidence is valid.

Local Firebase deploy commands intentionally fail closed.

## App Check troubleshooting

Copy `.env.e2e.example` to `.env.e2e` and supply the required role credentials and App Check debug UUID.

If the debug-token limit is reached, remove unused Firebase Console debug tokens and register the same UUID used by `.env.e2e`. Do not rotate the UUID repeatedly.

If `exchangeDebugToken` returns HTTP 403, the UUID is not registered for the Firebase Web App used by the hosted build. Register that exact UUID and rerun:

```bash
npm run e2e:ensure-appcheck
```

If every role receives permission errors, confirm the deployed bundle contains the production App Check site key and was deployed through the protected exact-SHA workflow. Then run:

```bash
node scripts/verify-hosted-appcheck.mjs
npm run test:e2e:profile-gates
```

## Mobile readiness

```bash
npm run mobile:check
npm run mobile:sync
```

Platform shell commands remain available through `mobile:add:*` and `mobile:open:*` scripts.

## Operational boundaries

- Client Firebase configuration is public Web SDK configuration; service-account credentials must never be committed.
- App Check must not be represented as active unless the hosted build and Console enforcement are verified.
- Live payment credentials, branded email delivery, provider verification and Admin credential rotation are operational tasks.
- Source-code and local-test results must never be presented as proof that a production deployment or hard public launch has completed.
