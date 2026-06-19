# BIN GROUP Full Public Launch Execution Plan

## Rule

Public launch is allowed only when every required launch gate is passed with real proof or formally waived. The app must not claim unrestricted public readiness while required gates remain pending.

## Phase 1 — App-side launch tools

Added admin route:

- `/ops/public-launch-command`

The Public Launch Command Center records evidence for:

- Firebase Auth proof
- Storage upload/download/delete proof
- Firebase Functions live smoke proof
- FCM / push proof
- Google Maps / GPS proof
- AI signed-in production proof
- Payment/manual bank activation proof
- UAE data/privacy position
- Admin password / MFA discipline
- Support, complaint, refund/cancellation, and SLA wording
- Android PWA proof
- iPhone/Safari PWA proof
- Technician GPS tracking proof
- Mobile PDF proof
- Arabic RTL sweep
- Every-button audit
- Logout all dashboards

Evidence records are saved to Firestore collection `launch_evidence` with tester name, role, device, production URL, screenshot/log/proof reference, notes, status, and admin recorder.

## Phase 2 — Real production proof

Test on live production with:

- Android phone
- iPhone/Safari
- Desktop Chrome
- Admin account
- Owner account
- Tenant account
- Technician account
- Broker account

Each test record must include:

- tester name
- date/time
- role
- device
- production URL
- screenshot/log reference
- pass/fail
- notes

## Phase 3 — Business launch requirements

Before unrestricted public launch, confirm:

- Firebase App Check production enforcement
- Payment/manual bank activation proof
- Admin password/MFA discipline
- Privacy/data-retention wording
- UAE data/subprocessor position
- Support/complaint handling page
- Refund/cancellation/SLA wording
- Public contact and escalation policy

## Phase 4 — Update launch gate file

Only after real proof exists, update `launch_package/launch-proof-gates.json` from `pending` to `passed` with exact proof text.

Do not mark gates passed from code existence alone.

## Phase 5 — Public launch wording

When all required gates are passed or formally waived:

BIN GROUP Super App is now live for UAE owners, tenants, technicians, brokers, and property operations teams — with proof-based maintenance, owner approval, BIN Connect, AI/WhatsApp intake, and admin command control.
