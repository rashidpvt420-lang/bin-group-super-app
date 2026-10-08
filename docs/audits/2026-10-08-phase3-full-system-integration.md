# Phase 3 — Full System / Firebase Integration

Date: 2026-10-08  
Exact base SHA: `97282826807d2ed33ba68085753616180cab2a97`  
Branch: `fix/phase3-full-system-integration`

## Scope

Phase 3 starts only after Phase 1 foundation and Phase 2 profile/control closure are merged. It proves that individually clean profiles share one canonical system truth across Firebase and the application.

The integration gate covers:

- Owner → Admin → Technician → Tenant workflow authority.
- Maintenance-only (`FM_ONLY`), Property-Management-only (`PM_ONLY`) and combined (`BOTH`) service modes.
- Inspection → final quotation → contract → payment → activation ordering.
- Current Cash/Cheque-only Owner activation payment policy.
- Technician assignment, GPS/live-location authority, arrival and completion notifications.
- Before/after Technician evidence and offline evidence replay.
- Canonical contracts, invoices, receipts and server-generated PDF identity.
- Sovereign AI, AI Design Studio and BIN Connect server boundaries.
- Firestore rules, Storage rules and Functions.
- App Check, Auth/claims and privileged Admin MFA.
- Idempotency, duplicate/replay protection and offline/reconnect paths.
- Audit evidence.
- Arabic/RTL and Android/iOS/desktop shell validation through existing platform E2E.
- Public/marketing/security/privacy claims versus the production policy encoded by the application.

## First integration defect found

The public Security and Privacy surfaces described Stripe/card processing as currently active and made broader audit-retention/hash claims than the repository's actual production authority.

The active provider/payment truth is Cash/Cheque-only for Owner activation, with Stripe/Card and Bank Transfer disabled unless a separately approved provider policy is enabled and verified.

The public Security and Privacy wording is corrected to match that production truth. Audit wording now distinguishes server-authoritative audit evidence from evidence artifacts that carry cryptographic hashes, and retention follows configured data classes and applicable obligations instead of a universal ten-year claim.

## Permanent gate

`npm run test:phase3:integration` binds the major existing integration regressions plus `tests/launch/phase3-full-system-firebase-integration.test.mjs` into one fail-closed contract.

PR Validation runs this gate before stability, compilation and builds.

## Explicit exclusions

Phase 3 does not authorize, repair, restart or certify:
- hard-clearance;
- the frozen 24-hour pilot;
- public-launch release locks;
- hard public launch;
- live external-provider launch evidence.

Those remain parked until the application itself passes Phase 3.

## Exit rule

Phase 3 is complete only when the exact Phase 3 closure head passes the full repository validation matrix and the Phase 3 integration gate with no unresolved application/Firebase integration defect. The merged commit then becomes the baseline for returning to hard-clearance/public-launch work.
