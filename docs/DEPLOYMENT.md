# BIN GROUP Protected Deployment Checklist

Production project: `bin-group-57c60`  
Source branch: `main`  
Only deployment authority: `.github/workflows/firebase-production-deploy.yml`

## Code validation

Local commands may validate source but may not change production resources.

```bash
npm ci --include=optional --legacy-peer-deps
npm run test:launch-honesty
npm run typecheck
npm run lint
npm run build
npm run build:admin
npm run build:functions
npm run test:rules
npm run test:mobile-store-readiness
```

## Production requirements

Every production run must bind founder authorization, protected-environment approval, incident state, deterministic artifacts, rules tests, App Check, Admin MFA, rollback references, and post-deployment evidence to the exact current `main` SHA.

Admin MFA enrollment recovery is part of the canonical bank-pilot workflow. Use incident evidence marker `ADMIN_MFA_BOOTSTRAP_HOSTING`. The canonical deployment repairs the required authorized domains, deploys the validated enrollment surface and minimal security callables, and still requires real MFA coverage before the complete stack can proceed.

No separate Admin MFA recovery deployment workflow is authorized.

## Admin authority

Provision Admin and staff accounts through the dedicated Staff Access page backed by `adminCreateUser`. The retired `scripts/grant-admin.mjs` entrypoint fails closed. Local scripts must not create users, set passwords, grant claims, activate profiles, or write privileged audit records.

## AI secrets

AI helper scripts may create Secret Manager versions only after an explicit exact-main preflight. They must not deploy Functions or Hosting.

## Controlled release sequence

1. Validate the exact PR head.
2. Merge without changing the validated head.
3. Dispatch a protected bank-pilot run for the exact current `main` SHA.
4. Run same-SHA live role smoke and hosted App Check verification.
5. Complete at least 24 hours with zero open P0/P1 incidents.
6. Produce protected hard-clearance evidence before public mode.

## Prohibited shortcuts

- No local or hosting-only production changes.
- No selected-Functions workstation deployment.
- No parallel Admin MFA recovery deployment.
- No direct rules deployment.
- No local Admin escalation.
- No fabricated operational evidence.
- No superseded SHA deployment.

Hard public launch remains `NO-GO` until the protected evidence chain passes for the exact deployed SHA.
