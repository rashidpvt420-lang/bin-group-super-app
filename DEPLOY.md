# BIN GROUP Super App — Deployment and Operations Guide

## Production infrastructure

- Firebase project: `bin-group-57c60`
- Primary domain: `https://bin-groups.com`
- Firebase Hosting fallback: `https://bin-group-57c60.web.app`
- Dedicated Admin Hosting target: `https://bin-group-admin-panel.web.app`

## Deterministic local validation

Local commands may build and test the repository, but they may not deploy production resources.

```powershell
npm ci --include=optional --legacy-peer-deps
npm run test:launch-honesty
npm run typecheck
npm run lint
npm run build
npm run build:admin
npm run build:functions
npm run test:rules
```

## Protected production deployment

All production Hosting, Functions, Firestore rules, indexes, and Storage rules must be deployed together through:

```text
.github/workflows/firebase-production-deploy.yml
```

The workflow must run from the exact current `main` SHA with founder authorization, protected-environment approval, incident attestation, deterministic build artifacts, and post-deployment verification. Local Firebase deployment commands and parallel partial production deploys are prohibited.

Admin MFA enrollment recovery uses the canonical bank-pilot bootstrap marker `ADMIN_MFA_BOOTSTRAP_HOSTING` inside that same workflow. No separate recovery deployment workflow is authorized.

## Admin access and recovery

Normal Admin and staff provisioning must use the dedicated Admin panel Staff Access surface backed by the server-authoritative `adminCreateUser` callable. The callable enforces authenticated Admin/founder authority and writes the required server-side records.

The retired `scripts/grant-admin.mjs` entrypoint fails closed and must not be used to create users, set passwords, grant claims, or activate profiles. Initial founder recovery must follow the protected Admin MFA bootstrap runbook under `docs/launch/`.

## Evidence sequence

1. Validate the exact PR head with the required CI matrix.
2. Merge without changing the validated head.
3. Dispatch a protected bank-pilot deployment for the exact current `main` SHA.
4. Run same-SHA live role smoke and hosted App Check verification.
5. Complete the controlled pilot with zero open P0/P1 incidents.
6. Produce hard-clearance and public-release evidence before public mode.

Source documentation cannot assert that those operational gates have passed.
