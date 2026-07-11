# Phase 0 — Repository Proof

Generated: 2026-07-11 (audit session)

## Identity

| Field | Value |
|-------|-------|
| Local repository path | `C:\Users\My-PC\Desktop\bin app` |
| Git top-level | `C:\Users\My-PC\Desktop\bin app` |
| Starting branch | `gate11-fixes` (switched to `fix/final-hard-launch-audit-2026-07-11`) |
| Starting SHA | `8c9635b713a27dda1ea1c593b75267e856b22163` |
| Remote origin | `https://github.com/rashidpvt420-lang/bin-group-super-app.git` |
| Package name | `bin-group-super-app` |
| Node | v22.22.3 |
| npm | 10.9.8 |

## Verdict

**This is conclusively the full BIN GROUP Super App** — not the smaller `rashidpvt420-lang/BIN-GROUP` Next.js prototype.

Evidence:
- Monorepo with Vite + React 18 main app (`src/`) plus `apps/admin-panel`, `apps/owner-app`
- Firebase project `bin-group-57c60` with Firestore, Storage, Functions, dual hosting targets
- Five role portals: Owner, Tenant, Technician, Broker, Admin (`src/owner`, `src/tenant`, `src/technician`, `src/broker`, `src/admin`)
- Launch-readiness scripts: `launch-fix-all.mjs`, `verify-firestore-launch-hardening.mjs`, `production-stability-guard.mjs`, gate11/gate12 suite
- E2E suite: `tests/e2e/business-*.spec.ts`, `hard-launch-routes.spec.ts`, `launch-audit-*.spec.ts`

## Firebase

| Field | Value |
|-------|-------|
| Default project ID | `bin-group-57c60` |
| Staging project ID | `studio-5724711541-8a962` |
| Main hosting target | `app` → site `bin-group-57c60` |
| Admin hosting target | `admin` → site `bin-group-admin-panel` |

## Expected path checks

| Path | Present |
|------|---------|
| package.json | YES |
| firebase.json | YES |
| .firebaserc | YES |
| firestore.rules | YES |
| storage.rules | YES |
| functions/ | YES |
| apps/ | YES |
| scripts/ | YES |
| tests/ | YES |
| scripts/launch-fix-all.mjs | YES |
| scripts/verify-firestore-launch-hardening.mjs | YES |
| scripts/production-stability-guard.mjs | YES |

## Worktree (snapshot at audit start)

**Dirty: YES** — extensive in-flight launch hardening on `gate11-fixes` (rules, functions, gate12 scripts, admin intake, e2e helpers). No discard/reset performed.

Modified/untracked areas include: `firestore.rules`, `storage.rules`, `functions/*`, gate12 scripts, launch workflow scripts, admin/owner/tenant UI fixes, e2e specs.

## Available launch scripts (package.json)

- `launch:fix-all`, `launch:blockers`, `launch:status`, `launch:record-evidence`, `launch:hard-gate`
- `test:launch-clearance`, `test:pilot-clearance`, `test:hard-launch-readiness`
- `test:gate12:appcheck`, `test:gate12:appcheck:enforce`, `test:gate12:stripe`, `test:gate12:controls`, `test:gate12:secrets`
- `verify:rules-hardening`, `test:stability`, `test:runtime-audit`, `test:mobile-store-readiness`
- `test:e2e:launch-audit`, `test:e2e:business`, `test:e2e:gate11:*`, `test:e2e:gate11:production`

## Available test scripts

- `test:rules`, `test:stability`, `test:repo-hygiene`
- `test:e2e`, `test:e2e:local`, `test:e2e:public`, `test:e2e:launch-audit:live`
- Playwright business specs per role

## Prior readiness posture (hard-launch-readiness.json)

- Decision: `CONTROLLED_PILOT_ONLY`
- Verified hard-launch score: **5.5 / 10** (conditional 9.0)
- Most hard gates: `external_verification_required`

## Audit branch

**Active:** `fix/final-hard-launch-audit-2026-07-11` (created via delayed shell completion).

**Warning:** Git index shows unmerged (`UU`) paths — `package.json`, `hard-launch-readiness.json`, `AdminTerminal.tsx`, `PaymentSubmissionStep.tsx`, `verify-e2e-env.mjs`, `verify-hard-launch-readiness.mjs`, `business-technician.spec.ts`. Resolve before treating baseline as authoritative.

## Credentials policy

No secrets, `.env` values, or service-account contents recorded in this document.
