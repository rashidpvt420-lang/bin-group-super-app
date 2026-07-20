# BIN GROUP Protected Deployment Checklist

This is the current production deployment guide for the BIN GROUP Super App. It replaces the obsolete HOME OS deployment plan and all local or partial Firebase deployment instructions.

## Production scope

- Firebase project: `bin-group-57c60`
- Source branch: `main`
- Deployment authority: `.github/workflows/firebase-production-deploy.yml`
- Public release state: not asserted by this document

## Pre-deployment requirements

A production run must bind all of the following to one exact current `main` SHA:

- founder authorization and authorized GitHub actor/email;
- protected production-environment approval;
- clear or hold-aware incident attestation;
- deterministic root, Admin, and Functions builds;
- Firestore and Storage rules tests;
- App Check and Admin MFA requirements;
- complete deployment metadata and artifact digests;
- rollback, monitoring, and evidence references.

For public mode, the workflow must also bind a successful same-SHA hard-clearance run and real live payment/webhook evidence.

## Local validation only

The following commands validate source locally. They do not authorize or perform production deployment.

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

No local command may deploy Hosting, Functions, Firestore rules, indexes, or Storage rules to production.

## Protected deployment sequence

1. Confirm the exact current `main` SHA immediately before dispatch.
2. Use the START HERE production workflow with the required exact confirmation values.
3. Select `bank-pilot` unless all public-mode evidence already exists.
4. Allow the protected workflow to perform credentials preflight, authorization, builds, rules validation, full-stack deployment, and post-deployment verification.
5. Preserve the successful workflow run ID, exact SHA, deployment metadata, and artifact digests.
6. Run same-SHA live role smoke and hosted App Check verification.
7. Complete the controlled pilot for at least 24 hours with zero open P0/P1 incidents.
8. Produce protected hard-clearance evidence before any public-mode run.

## Admin provisioning and recovery

Admin/staff provisioning must use the dedicated Admin Staff Access page backed by the `adminCreateUser` callable. Initial founder recovery must use the protected Admin MFA bootstrap workflow and its runbook.

Local scripts must not create Auth users, set passwords, set custom claims, activate Firestore profiles, or write privileged audit records. The retired `scripts/grant-admin.mjs` entrypoint fails closed.

## AI secrets

AI secret setup may create Secret Manager versions only after an explicit exact-main preflight. The helper scripts must not deploy Functions or Hosting. After secret configuration and validation, deployment still occurs only through the protected production workflow.

## Rollback

Rollback is a protected production workflow decision. Do not check out an old commit and deploy it locally. Record the rollback reason, target SHA, incident reference, and monitoring evidence, then use the repository's protected rollback/deployment controls.

## Prohibited shortcuts

- No local or hosting-only production deployment.
- No selected-Functions production deployment from a workstation.
- No direct Firestore or Storage rules deployment.
- No local Admin claim/password escalation.
- No fabricated Stripe, SMTP, App Check, pilot, or five-profile evidence.
- No deployment of a superseded SHA.

## Release decision

Source builds and green CI establish code readiness only. Hard public launch remains `NO-GO` until the protected operational evidence chain passes for the exact deployed SHA.
