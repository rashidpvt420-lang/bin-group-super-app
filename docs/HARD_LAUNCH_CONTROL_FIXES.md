# Hard-Launch Control v2

## Objective

A hard public launch may be approved only when one exact `main` commit has:

1. explicit Founder/CEO authorization;
2. clear incident and rollback telemetry;
3. successful Firebase production deployment;
4. verified main and admin production bundles;
5. successful Admin, Owner, Tenant, Technician, Broker, and global business workflows;
6. authenticated Firebase App Check evidence;
7. a complete live launch audit;
8. a signed final decision bound to every evidence artifact.

The system is fail-closed. Missing credentials, missing evidence, stale evidence, invalid signatures, skipped tests, active incidents, deployment skew, or a different commit SHA block hard launch.

## Why v1 was replaced

The previous implementation used mutable fields in `launch-proof-gates.json` and accepted a GUID- or hex-looking value as a founder signature. It also required `production-deployment.json` before deployment, creating a circular dependency. Those controls were not sufficient for a public-launch decision.

The v2 flow does not use `hardLaunchApproved` or `founderAuthorization` fields in a committed JSON ledger.

## Release pipeline

### Stage 1 — Signed predeploy authorization

The manual production workflow accepts:

- exact production confirmation phrase;
- exact hard-launch confirmation phrase;
- full lowercase 40-character `main` SHA;
- Founder/CEO name;
- Founder/CEO email.

`scripts/create-hard-launch-authorization.mjs` creates `launch_package/hard-launch-authorization.json`. The document is HMAC-SHA256 signed and bound to:

- repository;
- exact commit SHA;
- `refs/heads/main`;
- workflow run and attempt;
- GitHub actor;
- founder name and email;
- both confirmation phrases;
- issue and expiry timestamps.

`scripts/hard-launch-predeploy-gate.mjs` verifies the signature, actor/email allowlists, timestamps, commit identity, and `production-incidents.json` before deployment begins.

This stage authorizes deployment only. It does not claim hard launch.

### Stage 2 — Production deployment and live evidence

The workflow deploys and verifies:

- Firebase Hosting;
- Firestore rules;
- Firestore indexes;
- Storage rules;
- Firebase Functions.

The deployment verifier must prove:

- `status: "passed"`;
- exact deployed SHA equals the workflow SHA;
- both production URLs are reachable;
- both bundles target Firebase project `bin-group-57c60`;
- all required deployment components succeeded;
- deployment metadata is recent.

The workflow then runs current-commit execution evidence for:

- Admin credential login;
- Owner business workflow;
- Tenant business workflow;
- Technician business workflow;
- Broker business workflow;
- global business workflow;
- authenticated App Check access;
- main and admin Hosting;
- complete live launch audit.

`npm run launch:status` remains the controlled-pilot eligibility gate and must report `pilotEligible=true` while keeping `hardLaunchClaim=false`.

### Stage 3 — Signed hard-launch decision

`scripts/hard-launch-decision-gate.mjs` revalidates authorization, incidents, deployment metadata, pilot status, and all live evidence. It then hashes the exact files used in the decision and writes:

- `launch_package/hard-launch-decision.json`;
- HMAC-SHA256 signature;
- `hardLaunchClaim: true` only inside that signed decision.

`scripts/hard-launch-status.mjs` independently verifies the decision and writes `launch_package/hard-launch-status.json`.

Only a passing `hard-launch-status.json` is a valid hard-public-launch approval artifact.

## Required GitHub Secrets

Existing deployment secrets remain required, plus:

- `HARD_LAUNCH_APPROVAL_HMAC_KEY` — at least 32 characters;
- `AUTHORIZED_FOUNDER_ACTORS` — comma-separated GitHub logins;
- `AUTHORIZED_FOUNDER_EMAILS` — comma-separated founder emails;
- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`;
- `E2E_OWNER_EMAIL` / `E2E_OWNER_PASSWORD`;
- `E2E_TENANT_EMAIL` / `E2E_TENANT_PASSWORD`;
- `E2E_TECHNICIAN_EMAIL` / `E2E_TECHNICIAN_PASSWORD`;
- `E2E_BROKER_EMAIL` / `E2E_BROKER_PASSWORD`;
- `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`, registered for both production web apps.

Do not commit any of these values.

## Production dispatch procedure

After review and merge:

1. Open **Actions → Firebase Production Deploy → Run workflow**.
2. Select `main`.
3. Enter the exact resulting `main` SHA.
4. Enter `DEPLOY_PRODUCTION_BIN_GROUP_57C60`.
5. Enter `AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP`.
6. Enter the approved Founder/CEO name and allowlisted email.
7. Approve the protected `production` environment when prompted.
8. Wait for all three jobs to pass.
9. Download `hard-launch-decision-<SHA>` and retain it with the release record.

## Blocking conditions

Hard launch remains blocked when any of the following is true:

- PR or commit is not on `main`;
- expected SHA differs from workflow SHA;
- founder actor/email is not allowlisted;
- authorization signature or timestamp is invalid;
- incident telemetry is missing or malformed;
- any active incident exists;
- rollback is required;
- deployment metadata is absent, stale, incomplete, or for another SHA;
- production HTTP or bundle verification fails;
- any required E2E test fails, skips, interrupts, or produces no evidence;
- authenticated App Check access is not observed;
- pilot eligibility is false;
- signed hard-launch decision is missing, altered, stale, or for another SHA.

## Operational truth

Merging code is not a hard launch. A green CI run is not a hard launch. A successful Firebase deployment alone is not a hard launch.

The launch is approved only when the final manual workflow produces a valid signed `hard-launch-status.json` for the exact deployed `main` commit.