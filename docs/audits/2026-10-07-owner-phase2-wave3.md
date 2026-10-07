# Owner Phase 2 wave 3 — financial truth and handover controls

Base: `0d6475fac34ab5bef247423be65d4bcbc4883b6c`.

## Confirmed defects
- Owner ROI labelled rent collection rate as yield/ROI and hardcoded an 8% management fee, diverging from the canonical Owner Financial Truth used by dashboard/Financials.
- Owner P&L UI and exported PDF also hardcoded 8%, and its maintenance activity feed was email-only instead of canonical Owner UID-bound.
- Owner Payment Proof Review omitted `ownerUid` records even though production payment transactions can be bound that way.
- Owner Inspections and Owner Review Queue were callable-backed but relied only on asynchronous React state for duplicate-submit prevention and lacked page-level RTL direction.

## Repairs
- ROI now consumes `useOwnerFinancialTruthData` and `resolveOwnerFinancialTruth`. True gross/net yield appears only when a recorded property-value basis exists; collection rate is presented separately and explicitly not as investment yield.
- ROI management fees/net payout come from the shared Owner Financial Truth summary.
- P&L uses the canonical 5% management-fee summary for both UI and generated PDF, and maintenance activity is bound by canonical `ownerId`.
- Payment proof merges `ownerId`, `ownerUid`, and Owner email evidence while remaining read-only and light/RTL-aware.
- Inspections and Review Queue use synchronous in-flight guards plus disabled-state locking around the existing protected callable; both are RTL-aware.

## Evidence
`tests/launch/owner-phase2-financial-truth-handover.test.mjs` rejects the old 8%/fake-yield logic, requires all supported payment proof bindings, and locks the callable/double-submit/RTL handover contract.

No hard-clearance, pilot, release-lock or public-launch workflow is modified.
