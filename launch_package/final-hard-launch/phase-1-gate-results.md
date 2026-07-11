# Phase 1 — Baseline & Gate Suite Results

**Branch:** `fix/final-hard-launch-audit-2026-07-11`  
**UTC:** 2026-07-11T15:54Z  
**Evidence:** `logs/gate-suite-results.tsv`, `launch-phase1-results.txt`

## Software gates — PASS

| Command | Exit | Result |
|---------|------|--------|
| `npm ci` | 0 | PASS |
| `npm run build` | 0 | PASS (~39s) |
| `npm run build:functions` | 0 | PASS |
| `npm run verify:rules-hardening` | 0 | PASS |
| `npm run test:stability` | 0 | PASS |
| `npm run test:repo-hygiene` | 0 | PASS |
| `npm run test:runtime-audit` | 0 | PASS (warn: `VITE_APP_CHECK_SITE_KEY` unset locally) |
| `npm run test:launch-clearance` | 0 | PASS — GO WITH WARNINGS |
| `npm run test:gate12:appcheck` | 0 | PASS — Firestore + Storage **ENFORCED** |
| `npm run test:gate12:smtp` | 0 | PASS — live delivery `state=SUCCESS` from `ceo@bin-groups.com` |
| `npm run test:e2e:auth-rest` | 0 | PASS — all five roles authenticate via REST |

## Software gates — FAIL

| Command | Exit | Blocker |
|---------|------|---------|
| `npm run test:gate12:stripe` | 1 | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` contaminated in GCP Secret Manager (email-like values, not `sk_live_` / `whsec_`) |
| `npm run test:gate12:controls` | 1 | Same Stripe secret format failures (17 pass, 2 fail) |
| `npm run test:hard-launch-readiness` | 1 | Register: `CONTROLLED_PILOT_ONLY`, verified 5.5, **1/16** gates with evidence |
| `npm run launch:hard-gate` | 1 | Same as hard-launch-readiness |
| `npm run test:e2e:env` | 1 | Shared passwords across OWNER/TENANT/TECHNICIAN/BROKER (auth still works) |

## Production reachability (Gate 12 controls)

- Main app `bin-group-57c60.web.app`: HTTP 200
- Admin panel `bin-group-admin-panel.web.app`: HTTP 200
- Stripe webhook endpoint: HTTP 400 without signature (expected)
- Blaze billing: enabled
- SMTP secrets: format PASS

## Critical human action — Stripe secrets

GCP Secret Manager values for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must be replaced with real Stripe keys. Current values appear to be credentials pasted by mistake. Rotate any exposed password immediately.

```powershell
firebase functions:secrets:set STRIPE_SECRET_KEY --project bin-group-57c60
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project bin-group-57c60
npm run build:functions
firebase deploy --only functions --project bin-group-57c60
npm run test:gate12:stripe
```

## Disk warning

C: drive had ~0.2 GB free after `npm ci` + build. Free space before Playwright or large log runs.

## Decision

```text
HARD LAUNCH: NO-GO
```

Software layer is largely green; unrestricted launch blocked by contaminated Stripe secrets and missing live production evidence (15/16 hard gates unattested in register).
