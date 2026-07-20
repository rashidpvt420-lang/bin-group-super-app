# BIN GROUP Super App — Controlled Pilot and Post-Deployment Monitoring Runbook

**Production project:** `bin-group-57c60`
**Main hosted surface:** `https://bin-group-57c60.web.app`
**Admin hosted surface:** `https://bin-group-admin-panel.web.app`
**Status claim:** This document does not assert that a production deployment, controlled pilot, or public launch has completed.

## Required runtime binding

Use this runbook only after a protected deployment workflow has produced all of the following:

- exact deployed commit SHA;
- deployment workflow run ID;
- validated artifact digest;
- deployment mode (`bank-pilot` or `public`);
- verified production metadata artifact;
- incident and rollback references.

Do not start a monitoring window from source-code status, local builds, screenshots, or an unverified deployment notification.

## Monitoring windows

### Controlled bank pilot

- Minimum duration: 24 hours.
- Require zero open P0/P1 incidents before hard-clearance.
- Record exact start and end timestamps, monitoring reference, rollback reference and incident-register reference.

### Public release

- Begin the 48–72 hour public monitoring window only after the signed same-run public-release decision passes.
- Public monitoring does not replace the controlled-pilot evidence requirement.

## Public and authenticated watch list

Validate the deployed exact SHA on these surfaces:

| Area | Expected result | Severity if failing |
|---|---|---|
| Main hosted surface | Correct exact-SHA application shell loads | P0 |
| `/login` | Authentication controls render without a fatal error | P0 |
| `/onboarding` | Canonical Owner onboarding loads | P0 |
| `/verify` | Public invoice verification loads | P1 |
| `/verify-cert` | Public certificate verification loads | P1 |
| Admin hosted surface | Authentication boundary loads; no unauthenticated data | P0 |
| Role dashboards | Correct role routing and identity-bound records | P0 |

Custom-domain monitoring may be added only after DNS and certificate state are verified for the same release.

## P0 incident rules

Treat any of the following as P0 and immediately invoke the protected incident and rollback process:

- hosted application unavailable or serving the wrong artifact;
- login unavailable or unable to render;
- unauthenticated Admin data exposure;
- cross-role private-data access;
- rules allowing unauthorized access or rejecting all valid production users;
- activation or payment state unlocking the wrong user or property;
- protected evidence becoming publicly readable;
- critical Functions failures in onboarding, payment, ticket, dispatch, audit or notification paths;
- production metadata, deployed SHA or artifact digest mismatch.

## Protected verification sequence

1. Confirm the deployment run completed successfully.
2. Verify deployment metadata and artifact digest from the same run.
3. Verify hosted App Check for main and Admin surfaces.
4. Run strict public route smoke tests.
5. Seed or repair controlled test accounts through protected tooling.
6. Run the exact-SHA five-profile walkthrough and business evidence suites.
7. Verify production email delivery with a provider message ID.
8. In public mode, verify the live AED payment session, matching event and processed webhook record.
9. Record monitoring, incidents and rollback status in the controlled-pilot operations record.

No local or hosting-only Firebase deployment command is part of this runbook.

## Five-profile evidence

Use dedicated controlled accounts and retain machine-readable artifacts.

| Role | Minimum evidence |
|---|---|
| Owner | Login, activation gate, property, contract, payment and onboarding continuation |
| Tenant | Login or invite, residence binding, request evidence, tracking and review/dispute path |
| Technician | Approved account, assignment, accept, arrival and before/after completion evidence |
| Broker | Identity-bound lead/referral, attribution, commission and protected payout path |
| Admin | Authentication, approvals, dispatch, documents, audit and launch-control review |

Screenshots or hand-written statements do not replace Playwright JSON, workflow artifacts, hashes and server records.

## Logs and service checks

Use protected workflow output, Google Cloud/Firebase Console read-only views and approved observability links. Check for:

- permission-denied spikes;
- missing indexes;
- App Check rejection spikes;
- missing secret or configuration failures;
- payment webhook errors;
- email or notification provider failures;
- scheduled-function timeout or discovery errors;
- unhandled exceptions;
- unexpected deployment or rules changes.

Do not expose secret values in logs, issues or artifacts.

## Rollback and hold conditions

Set an active hold and stop progression when:

- any P0/P1 incident is open;
- deployment state is uncertain;
- the deployed SHA or digest does not match the approved artifact;
- App Check or role evidence is incomplete;
- rollback is active;
- the last deployment failed and the protected retry cooldown has not elapsed.

## Completion rule

A monitoring window is complete only when its exact timestamps, deployed SHA, workflow run, artifact digest, incident state and rollback references are recorded. This source document cannot authorize pilot eligibility, hard-clearance or public launch.
