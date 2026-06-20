# Public Launch Command Center Audit

## Added

- Admin page: `apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx`
- Admin route target: `/ops/public-launch-command`
- Evidence collection: `launch_evidence`
- Route wiring script: `scripts/wire-public-launch-command-center.mjs`
- Static verifier: `scripts/verify-public-launch-command-center.mjs`
- Execution plan: `launch_package/PUBLIC_LAUNCH_EXECUTION_PLAN.md`
- Proof template: `launch_package/PUBLIC_LAUNCH_PROOF_TEMPLATE.md`
- Checklist data: `launch_package/full_public_launch_checklist.json`

## What the admin page records

- Gate ID and title
- Gate group
- Status: pending, passed, blocked, waived
- Tester name
- Role tested
- Device
- Production URL
- Screenshot/log/evidence reference
- Notes
- Admin recorder
- Timestamp

## Covered required gates

- Firebase Auth
- Storage rules upload/download/delete
- Firebase Functions live smoke
- Firebase Cloud Messaging / push
- Google Maps / GPS
- AI signed-in production proof
- Payment/manual bank activation
- UAE data/privacy position
- Admin password/MFA discipline
- Support, complaint, refund/cancellation, and SLA wording
- Android PWA
- iPhone/Safari PWA
- Technician GPS tracking
- Mobile PDF download/open
- Arabic RTL sweep
- Every-button audit
- Logout all dashboards

## Launch honesty rule

The command center records evidence only. It does not automatically mark `launch-proof-gates.json` as passed. A required gate should be updated from `pending` to `passed` only after real proof exists.
