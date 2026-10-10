# Antigravity: BIN GROUP full-app audit and protected launch handoff

**Baseline when prepared (2026-10-10):** `origin/main` = `f9573e4fc81302752b39e5f594ae86b14b203197`. Re-resolve at execution; never treat this SHA as permanent. **No claim of hard-launch readiness is made.**

## Current evidence snapshot
- Exact-main BIN GROUP CI and Five Profile and Onboarding Audit: success on baseline SHA, but not substitutes for hosted proofs.
- Firebase Production Deploy #1213: [run 38061356557](https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/38061356557) was **in progress** at handoff, with deployment stack step running and five-role/live-launch checks pending. Recheck before making any claims.
- Previous Deploy #1212: [run 38048046452](https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/38048046452) failed. Prior failures included Owner/Tenant business evidence and transient browser geolocation at Technician arrival. Do not infer current failure from previous evidence; inspect #1213 first.
- Recent GPS fixes: #1750 merged; check newer merges/PRs. Do not merge stale conflicting branches. The previous #1752 branch was superseded/conflicting; recheck state.
- Finance Admin TOTP was verified in a prior protected deployment step; continue to verify on each exact-SHA run.
- Protected bank-pilot dispatch is not a public launch. Public gate must stay disabled pending final evidence.

## Antigravity mission

1. **GitHub sync and baseline:** Verify remote; protect dirty changes; `git fetch --prune origin`; compare `HEAD`, `origin/main`, production deployed SHA and any active runs; fast-forward a clean `main`, otherwise use clean worktree. Show sync report and live run links.
2. **Current production checkpoint:** Inspect #1213 and latest run; record the exact first failing step (if any), log snippet without secrets, runtime artifacts, and any deployment side effects. Never rerun or cancel an active deploy blindly. Address only current blockers.
3. **Full route/control matrix:** Enumerate all frontend and dedicated Admin routes/buttons. For each record role, authorization, data owner, click/network/server result, loading, empty/error/success, retry, double click, refresh/direct URL, Arabic/RTL, desktop/mobile, Android/iOS applicability. Separate not-run from passed.
4. **Five role journey evidence:** Owner intake/property/quote/pricing-only variants/inspection/contract/invoice/activation; Admin document/GPS/inspection/payment/units/MFA/HR/launch; Technician dispatch, App Check/Play Integrity, ON_THE_WAY, ARRIVED via authentic GPS, photos, completion/offline replay; Tenant invitation/unit binding/ticket/tracking/approval/dispute; Broker KYC/listings/referrals/deals/commission/payout. Prove cross-role and unauthorized-path denial.
5. **Backend/financial authority:** Firestore/Storage rules, Functions Auth/claims/App Check/MFA/transactions/idempotency, Firestore-state consistency, normalized property lifecycle, maps/keys/device registration, payment/quote/VAT rounding/invoice/contract hash, notification/OTP email, PDF/private vault, provider/AI auth and rate limits.
6. **Operational production proofs:** Exact-SHA protected Firebase deploy metadata and artifact digest; Apps Check hosted and device, Founder and Finance MFA, SMTP message delivery, payments CASH/CHEQUE only, Technician real physical GPS & photos, mobile push/links, five-role live smoke, incidents/pilot/rollback/monitoring; list missing external evidence explicitly.
7. **Fix by severity:** Reproduce P0/P1 with error logs, add negative and positive regression tests, make smallest repair in a branch, run affected gates and required `TESTING.md` checks. Submit one reviewable signed PR at a time. Never suppress gates. Coordinate merges and production deployment only after authorization.
8. **Final sign-off:** Only after all evidence is available and valid on the exact immutable release chain request owner review for hard clearance. Hard-public-launch publish remains blocked until protected gate passes and owner explicitly approves. Do not re-run the completed 24-hour pilot merely to make a gate green; verify evidence binding.

## Acceptance matrix
| Gate | Required proof | Current state |
| --- | --- | --- |
| Source (root/Admin/Functions/Android/iOS/rules) | Exact-head tests and protected CI | Partially verified; recheck current SHA |
| Every route/control and role isolation | Coverage matrix plus reproducible tests | NOT YET AUDITED by this handoff |
| Full Firebase production deploy | Successful exact-SHA full run, metadata digest, no pending steps | PENDING #1213 |
| Finance Admin MFA | Real enrolled factor and protected E2E proof on current run | Recheck #1213 |
| Owner/Tenant/Technician/Broker/Admin live business evidence | Strict no-skip artifact from protected run | PENDING #1213 |
| Operational App Check / SMTP / payment / GPS / Play Integrity | Real hosted/provider and physical-device evidence | NOT REVALIDATED |
| Existing controlled pilot | Frozen 24-hour report, incidents, monitoring and rollback proof | Historical completion reported; binding NOT REVALIDATED |
| Hard clearance / signed release | Successful protected exact-SHA gate and signed final decision | NOT VERIFIED — NO-GO |

## Safe sync commands (after inspecting git status)
```sh
git remote -v
git status --short --branch
git fetch --prune origin
git rev-parse HEAD
git rev-parse origin/main
# ONLY if the checkout is clean and main has no unpushed commits:
git switch main
git pull --ff-only origin main
# Otherwise keep local work and use a separate clean worktree:
# git worktree add ../bin-group-antigravity-audit origin/main
```

Use `TESTING.md` for the exact commands, not commands copied from historical audits. Node 22 is the runtime baseline. No credentials or production mutations from the local audit terminal. Every finding must include **path, observed result, expected result, reproduction, proof, severity, affected SHA, PR, retest state, owner decision**.

**Completion definition:** Antigravity local workspace and GitHub `main` synchronized to the same VERIFIED SHA, changes submitted through reviewed/approved PRs, protected production metadata verified, and hard-launch gate truthfully green before any public publication.
