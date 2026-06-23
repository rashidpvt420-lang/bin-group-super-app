# Hard-live Batch 2 Status

Batch 2 targets the internal command dashboard.

## Added

- Replaced the previous dashboard implementation with a hard-live command dashboard that removes confirmed fake fallbacks.
- Corrected Total Properties route to `/properties/passport`.
- Wired action queue REVIEW buttons to review routes by type.
- Added payment proof queue rows.
- Added broker commission queue rows.
- Added SLA breach and near-breach KPIs.
- Replaced fake property fallback with `Property not linked`.
- Replaced fake SLA fallback with `SLA not configured` when no SLA source exists.
- Replaced hardcoded MRR headline with Firestore-driven monthly collections / MRR fields.
- Replaced hardcoded growth with Firestore-driven `monthlyGrowthPct` or `Trend unavailable`.
- Replaced static security badge with Firestore-driven security status/score or `Pending proof`.
- Replaced static expired documents count with a Firestore-driven document expiry check.
- Added Launch Health panel for build, deploy, rules, App Check, payment, email, and BIN Connect status.

## Still left after Batch 2

- Owner dashboard rent ledger, payment proof, approvals, and handover review.
- Technician proof readiness, SLA countdown, offline queue, and close-blocking.
- Broker attribution and commission proof chain beyond dashboard queue visibility.
- Contract and PDF QR/hash proof linkage.
- Passport tabs and real map/GPS state.
- AI Studio status/approval workflow.

## Validation

Not run locally in the connector environment. GitHub Actions should validate the PR.
