# Release Blockers

**Source branch:** `main`
**Source binding:** Resolve the exact 40-character commit SHA from the protected workflow run. This document intentionally does not embed a fixed SHA because every merge would make that value stale.
**Production deployment claim:** Not asserted by source documentation.
**Pilot eligibility claim:** Not asserted by source documentation.
**HARD PUBLIC LAUNCH:** `NO-GO` unless all protected runtime evidence gates pass for the same exact SHA.

## Code-side disposition

The audited P0/P1 source defects are repaired on `main`, subject to the validation matrix in `TESTING.md` and exact-head CI:

- privileged and financial direct-write paths closed;
- owner activation, OTP and payment evidence bound server-side;
- tenant service and physical-access flows moved to validated callables;
- technician dispatch and lifecycle authority made transactional;
- suspension enforced across Auth, rules and callables;
- Stripe mismatch reconciliation and idempotency hardened;
- protected deployment, artifact and public-decision chain made fail-closed;
- stale rule, workflow and launch-test contracts aligned.

No production readiness claim follows from source-code disposition alone.

## Blocking live evidence

| ID | Severity | Required evidence |
|---|---|---|
| OPS-STRIPE | P0 | Live AED session, matching Stripe event and processed Firestore webhook bound to the deployed SHA |
| OPS-SMTP | P0 | Secret-bound production delivery with provider message ID |
| OPS-APPCHECK | P0 | Main and Admin hosted App Check verification plus strict credentialed E2E |
| OPS-E2E5 | P0 | Exact-SHA Owner, Tenant, Technician, Broker and Admin walkthrough artifacts |
| OPS-PILOT | P0 | Minimum 24-hour pilot report with zero open P0/P1 incidents and rollback/monitoring references |
| OPS-PROD-RUN | P0 | Protected full-stack deployment plus same-run signed final decision |

## Decision rule

Public mode requires all of the following to bind to the same repository, `main` commit, workflow run and validated artifact digest:

1. founder authorization;
2. clear production incident attestation;
3. exact-SHA hard-clearance provenance;
4. complete Firebase deployment metadata;
5. postdeploy public-release status;
6. live Stripe proof;
7. pilot incident report;
8. signed final hard-launch decision.

Any missing, malformed, stale, cross-run or mismatched artifact keeps `hardLaunchClaim=false`. Runtime artifacts and the controlled-pilot operations record are authoritative for current deployment truth; this source document is not.
