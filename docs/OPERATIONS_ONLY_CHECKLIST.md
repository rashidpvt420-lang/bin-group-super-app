# Operations-Only Checklist

Code changes on `cursor/full-system-audit-fix` do **not** complete these items. Do not mark them passed from a laptop audit.

## A. Identity & App Check

1. Confirm Firebase project `bin-group-57c60`.
2. Register App Check debug UUID under **BIN GROUP Web** for E2E only; production remains fail-closed.
3. Confirm admin panel App Check site key secrets in GitHub Environments.
4. Confirm custom claims for founder/admin allowlist (no email-only elevation).

## B. SMTP

1. Confirm `SMTP_USER` / `SMTP_PASS` exist in Secret Manager and are bound to mail + OTP Functions.
2. Run `npm run test:gate12:smtp` against production with real secrets (not simulated).
3. Confirm provider message IDs land in audit/delivery logs without secret leakage.

## C. Stripe

1. Confirm live-mode keys and webhook secret ENABLED versions.
2. Execute one real AED mobilization Checkout for a test owner.
3. Confirm webhook HTTP 200 and Firestore event `processed: true` for that event id.
4. Confirm owner dashboard remains locked until admin activation.
5. Associate evidence with the exact deployed commit SHA.

## D. Five-role live evidence

1. Seed auth + live fixtures for current SHA.
2. Run profile gates / launch walkthrough / critical evidence suites with `E2E_STRICT_LIVE=true`.
3. Store Playwright JSON via `PLAYWRIGHT_JSON_OUTPUT_FILE` only (no stdout pollution).

## E. Protected production deploy

1. Exact current `origin/main` SHA verification.
2. Founder confirmation phrases + HMAC authorization.
3. Incident attestation (active=false unless true incident).
4. Workload Identity → build → deploy → same-run artifact verify.
5. Postdeploy SMTP + App Check + Gate 11 smoke.
6. Signed hard-launch decision artifact only may set `pilotEligible` / `hardLaunchClaim`.

## F. Explicit non-actions for agents

- Do not set `pilotEligible` or `hardLaunchClaim` manually.
- Do not deploy production from audit branches.
- Do not merge to main without human review.
- Do not print or commit secrets.
- Do not fabricate Stripe/SMTP/App Check/five-role evidence.
