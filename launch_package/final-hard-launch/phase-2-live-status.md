# Phase 2 — Live Run Status (user terminal)

**UTC:** 2026-07-11T16:47Z  
**Branch:** `fix/final-hard-launch-audit-2026-07-11`  
**Commit:** `6773454b`

## Fixed since Phase 1

| Item | Status |
|------|--------|
| E2E shared passwords | **FIXED** — `rotate-e2e-role-passwords.mjs` + `seed:e2e:auth` |
| `test:e2e:env` | **PASS** |
| `test:e2e:auth-rest` | **PASS** (all five roles) |
| App Check console | **PASS** — Firestore + Storage ENFORCED |
| SMTP live delivery | **PASS** |
| Functions deploy | **PASS** (full stack) |
| Gate 12 controls (bank-only mode) | **PASS** with `LAUNCH_BANK_ONLY=1` |
| Firestore evidence recorded | `mainCredentialLogin`, `brandedEmailSender`, `appCheckProduction` |
| Pilot window | **STARTED** |

## Still failing

### 1. Stripe Secret Manager format (critical for card billing)

`firebase functions:secrets:set` created new versions (116 / 115) but `test:gate12:stripe` still reports:

- `STRIPE_SECRET_KEY` — unrecognized format (must start with `sk_live_`)
- `STRIPE_WEBHOOK_SECRET` — unrecognized format (must start with `whsec_`)

The error changed from *email-like* to *unrecognized format*, so values were updated but are still wrong. Common mistakes:

- Pasted **publishable** key (`pk_live_…`) instead of **secret** key (`sk_live_…`)
- Pasted Stripe **Dashboard password** or account email
- Pasted webhook **URL** instead of signing secret (`whsec_…`)
- Leading/trailing spaces or quotes included in the pasted value

**Verify without exposing the full secret** (prefix only):

```powershell
(gcloud secrets versions access latest --secret=STRIPE_SECRET_KEY --project=bin-group-57c60).Substring(0,8)
# Must print: sk_live_

(gcloud secrets versions access latest --secret=STRIPE_WEBHOOK_SECRET --project=bin-group-57c60).Substring(0,6)
# Must print: whsec_
```

Re-set if wrong:

```powershell
firebase functions:secrets:set STRIPE_SECRET_KEY --project bin-group-57c60
# paste ONLY the sk_live_… string from Stripe → Developers → API keys → Secret key

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project bin-group-57c60
# paste ONLY whsec_… from Stripe → Developers → Webhooks → your endpoint → Signing secret

npm run test:gate12:stripe
```

### 2. Live Stripe payment proof

`npm run launch:verify-stripe` — **FAIL** (no `payment_transactions` STRIPE + PAID in Firestore).

Requires a real AED checkout on production owner activation **after** valid secrets are in place.

### 3. Business workflow E2E (5 failures)

- `business-admin.spec.ts` — property/tenant import, ticket assignment
- `business-broker.spec.ts` — attributed lead + commissions
- `business-technician.spec.ts` — accept job, upload proof
- `business-tenant.spec.ts` — service request + photo upload

4 other business specs passed. Re-run after smoke passes:

```powershell
npm run test:e2e:business
```

### 4. `launch:fix-all` in progress

Last output cut off at `→ Production five-profile smoke...` with `LAUNCH_BANK_ONLY=1`. Let that run finish, then:

```powershell
npm run launch:status
npm run test:pilot-clearance
```

## Bank-only pilot path

With `LAUNCH_BANK_ONLY=1`, Stripe **format** checks are advisory for a bank-transfer controlled pilot. **Public card billing launch still requires** valid `sk_live_` + `whsec_` + `launch:verify-stripe` PASS.

## Decision (current)

```text
HARD LAUNCH: NO-GO
CONTROLLED PILOT (bank-only): IN PROGRESS — re-run launch:fix-all to completion
```
