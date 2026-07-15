# Operations-Only Checklist

These controls cannot be passed by source review or local tests. Missing evidence is a release blocker.

## Identity and App Check

- Confirm Firebase project `bin-group-57c60` and production web-app registrations.
- Confirm production App Check enforcement and valid site keys for main and admin builds.
- Register only the controlled E2E debug UUID when running protected tests; remove stale tokens.
- Verify founder/admin/staff custom claims and suspension behavior using real accounts.

## SMTP

- Confirm enabled `SMTP_USER` and `SMTP_PASS` Secret Manager versions and Function bindings.
- Run `npm run test:gate12:smtp` in the protected production environment.
- Retain provider message ID, recipient, timestamp and delivery-state evidence without secret values.

## Stripe

- Confirm live API and webhook secret versions.
- Execute a real AED Checkout for an exact-SHA test owner.
- Confirm the selected `checkout.session.completed` event matches the session and the app's Firestore webhook record is `processed=true`, `ignored!=true`.
- Confirm a mismatch creates reconciliation evidence and never unlocks an owner.
- Confirm admin approval, invoice proof and dashboard unlock on the valid payment.

## Five-profile production evidence

- Seed controlled owner, tenant, two-technician, broker and admin accounts for the current SHA.
- Run strict profile gates, five-profile walkthrough and business suites with App Check enabled.
- Exercise owner onboarding/activation, tenant evidence and SOS, technician assignment/proof, broker attribution/payout and admin review/audit.
- Retain Playwright JSON and hashes; do not substitute screenshots or hand-written claims.

## Controlled pilot

- Run at least 24 hours.
- Record exact pilot start/end, monitoring reference, rollback reference and incident reference.
- Require zero open P0/P1 incidents.
- Generate `pilot-incident-report.json` only in the protected hard-clearance workflow.

## Protected deployment

- Dispatch from `refs/heads/main` with the exact current SHA.
- Use authorized founder identity, exact confirmation phrases and protected environment approval.
- For public mode, select a successful exact-SHA hard-clearance run before deployment.
- Verify Workload Identity, deterministic builds, rules emulators, complete artifact digest and full-stack deploy.
- Verify same-run production metadata, hosted App Check, SMTP, routes and live business evidence.
- Accept a public claim only from the signed final decision artifact with empty failures.

## Prohibited shortcuts

- No local or hosting-only production deploys.
- No manual `pilotEligible` or `hardLaunchClaim`.
- No fabricated Stripe, SMTP, App Check, pilot or five-profile evidence.
- No secret values in logs, commits or artifacts.
- No deployment of superseded SHAs.
