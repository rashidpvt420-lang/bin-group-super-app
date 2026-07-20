# BIN GROUP Five-Profile and Property-Onboarding Audit — Historical Index

> **Superseded report:** Earlier profile findings in this file were point-in-time observations and are not authoritative for current `main`. They were removed because later server-authority, profile-readiness, credential-renewal, tenant-correction, payment and workflow changes made the old missing-item list inaccurate.

## Current authoritative sources

- `docs/FULL_FIVE_PROFILE_AUDIT.md` — current five-profile authority boundaries and architectural constraints.
- `docs/PROPERTY_ONBOARDING_AUDIT.md` — canonical property-onboarding journey and integrity invariants.
- `docs/RELEASE_BLOCKERS.md` — fail-closed public-release evidence requirements.
- `TESTING.md` — current exact-head validation and hosted evidence sequence.
- `docs/OPERATIONS_ONLY_CHECKLIST.md` — production evidence that source review cannot establish.
- Protected GitHub workflow artifacts — exact-SHA build, rules and focused five-profile validation.

## Interpretation rule

Do not infer current missing features, deployment truth, pilot eligibility or public-launch status from historical audit text. Reproduce any suspected defect against current `main`, add regression coverage, and validate it on the exact pull-request head.

## Current decision boundary

- Source and rules validation must pass on the exact commit under review.
- Hosted five-profile evidence must bind to the deployed exact SHA with App Check enabled.
- Payment, email delivery, incident, rollback and controlled-pilot evidence remain operations-only.
- **HARD PUBLIC LAUNCH remains `NO-GO` unless the protected runtime evidence chain passes.**
