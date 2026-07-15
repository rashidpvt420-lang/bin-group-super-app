# Release Blockers

**BASE_SHA:** `2bbb9869804064e56046f0f795fcc59ff7cea7f6`
**Branch:** `cursor/full-system-audit-fix-v4-30e9`
**PRODUCTION_DEPLOYED:** `false`
**pilotEligible:** `false`
**hardLaunchClaim:** `false`
**HARD PUBLIC LAUNCH:** `NO-GO`

## Code-side disposition

The audited P0/P1 source defects are repaired on this branch, subject to the validation matrix in `TESTING.md` and CI:

- privileged and financial direct-write paths closed;
- owner activation/OTP/payment evidence bound server-side;
- tenant service and physical-access flows moved to validated callables;
- technician dispatch/lifecycle authority made transactional;
- suspension enforced across Auth, rules and callables;
- Stripe mismatch reconciliation and idempotency hardened;
- protected deployment/artifact/public-decision chain made fail-closed;
- stale rule, workflow and launch-test contracts aligned.

No production readiness claim follows from this code disposition.

## Blocking live evidence

| ID | Severity | Required evidence |
|---|---|---|
| OPS-STRIPE | P0 | Live AED session, matching Stripe event and processed Firestore webhook bound to deployed SHA |
| OPS-SMTP | P0 | Secret-bound production delivery with provider message ID |
| OPS-APPCHECK | P0 | Main/admin hosted App Check verification and strict credentialed E2E |
| OPS-E2E5 | P0 | Exact-SHA owner, tenant, technician, broker and admin walkthrough artifacts |
| OPS-PILOT | P0 | 24-hour pilot report with zero open P0/P1 and rollback/monitoring references |
| OPS-PROD-RUN | P0 | Protected full-stack deployment plus same-run signed final decision |

## Decision rule

Public mode requires all of the following to bind to the same repository, `main` commit, workflow run and validated artifact digest:

1. founder authorization;
2. clear production incident attestation;
3. exact-SHA hard-clearance provenance;
4. complete Firebase deployment metadata;
5. postdeploy public release status;
6. live Stripe proof;
7. pilot incident report;
8. signed final hard-launch decision.

Any missing, malformed, stale, cross-run or mismatched artifact keeps `hardLaunchClaim=false`.
