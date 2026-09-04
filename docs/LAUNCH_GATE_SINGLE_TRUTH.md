# BIN GROUP Launch Gate Single Source of Truth

This document defines the current launch-status vocabulary and prevents false-green claims across source code, Admin UI, CI, hosted production, and physical-device testing.

## Current release policy

- Payment policy: `PHASE1_CASH_CHEQUE_V1` / workflow value `phase1-manual`.
- Currency: AED.
- Approved payment methods: Cash and Cheque only.
- Bank Transfer: disabled.
- Stripe/Card: disabled.
- `bank-pilot` is only a legacy internal deployment-mode name; it does not enable Bank Transfer.
- Final hard-public-launch authorization can be issued only by the protected signed hard-launch decision chain for the exact current `main` SHA.

## Evidence layers

### Source

Compile, lint, static security contracts, rules tests, unit/integration tests, workflow-policy regressions and exact-SHA source assertions.

Source evidence proves implementation properties. It does not prove hosted provider behavior or physical-device behavior.

### Hosted

Execution against protected production Hosting, Firebase Auth, Functions, Firestore/Storage authority, App Check, branded email, AI provider behavior and other server/provider surfaces for the exact release SHA.

A deployment record by itself is not enough when a gate requires runtime execution proof.

### Physical device

Real-device proof for GPS/maps, push notification delivery and denied-permission fallback, required mobile/PWA journeys, Phase 1 Cash/Cheque activation, mobile PDF/RTL behavior, and other gates explicitly classified as physical-device evidence.

A GitHub-hosted runner or manually selected evidence label must never manufacture physical-device proof.

## Status levels

### Controlled pilot

Allowed audience: trusted/internal users and selected pilot participants.

Pilot eligibility may use explicitly documented pilot waivers where the protected policy allows them, but a waiver remains non-passing for hard public launch. The pilot must stay bound to the exact deployed SHA and its incident/rollback evidence.

### Public release evidence coverage

The Admin evidence center may show how many required exact-SHA records have status `passed` at or above the required evidence layer. It may record manual evidence with explicit provenance.

Evidence coverage is **not** launch authorization. A manual Admin record, 100% coverage display, committed checklist, source test, or waiver cannot set `hardLaunchClaim=true`.

### Hard public launch

Hard public launch is allowed only when the protected release chain succeeds for the exact current `main` SHA and validated artifact. At minimum, the chain must bind:

- protected production deployment and artifact digest;
- exact-SHA live role and hosted evidence;
- required physical-device evidence;
- Firebase App Check enforcement proof;
- clear P0/P1 incident state and verified rollback/monitoring evidence;
- Phase 1 Cash/Cheque production policy proof;
- required owner payment activation/approval/rejection evidence;
- protected founder authorization and production-environment controls;
- successful postdeploy public-release clearance;
- final signed decision with `hardLaunchClaim=true`.

## Phase 1 payment gate

The current payment gate must prove all of the following:

- AED policy resolves to exactly `CASH` and `CHEQUE`;
- Bank Transfer is disabled;
- Stripe/Card is disabled;
- execution-generated payment-policy proof is bound to the same release SHA, workflow run, release ID and validated artifact digest;
- real physical-device Owner activation succeeds with Cash or Cheque evidence;
- Admin approval unlocks the intended access exactly once;
- rejection/manual-review paths do not unlock access;
- receipt/evidence and audit records are present;
- proof artifacts exclude sensitive banking values.

Dormant Stripe implementation may remain hardened in source for a separately reviewed future migration, but it is not a selectable current production policy and cannot satisfy any current launch gate.

## Non-negotiable hard-launch blockers

Hard public launch must remain NO-GO when any required item is missing, stale, from another SHA, below its required evidence layer, waived instead of passed, or not bound to the protected workflow chain. This includes, where required:

- exact current `main` release identity;
- production Hosting/Functions deployment proof;
- five-role authentication and live smoke proof;
- Firestore and Storage authority proof;
- App Check enforcement;
- Phase 1 Cash/Cheque payment proof;
- physical-device GPS/maps and push notification proof;
- physical-device Owner payment activation proof;
- mobile PDF/RTL and other required device gates;
- branded sender/provider evidence;
- privileged Admin security and rotation evidence;
- clear incident state, monitoring and rollback proof;
- postdeploy public-release clearance;
- signed final hard-launch decision.

## Truth rules

1. Exact SHA beats historical status.
2. `passed` is the only status that can satisfy a required hard-launch evidence gate; `waived` never does.
3. A stronger evidence layer may satisfy a weaker requirement; a weaker layer never satisfies a stronger one.
4. Configuration is not verification.
5. Deployment is not runtime proof.
6. Evidence coverage is not launch authorization.
7. Stripe/Card and Bank Transfer remain disabled until a separate, reviewed future policy migration changes the canonical release contract.
8. No source change, merge, CI result, Admin click, or checklist entry should be described as a production deploy or hard-public-launch clearance unless the protected evidence proves it.
