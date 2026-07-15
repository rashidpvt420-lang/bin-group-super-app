# Release Blockers

**BASE_SHA:** `3f9da3a0cb9df940c9780ead237167b8992ffa66`  
**Branch:** `cursor/full-system-audit-fix`  
**PRODUCTION_DEPLOYED:** `false`  
**pilotEligible:** `false`  
**hardLaunchClaim:** `false`  
**HARD_PUBLIC_LAUNCH:** `NO-GO`

---

## Origin/main movement

| Item | SHA |
|------|-----|
| Frozen candidate | `55f4a8972f584dbd0eb142b1f41df1cbcabd1f07` |
| Current origin/main | `3f9da3a0cb9df940c9780ead237167b8992ffa66` |
| Delta | Frozen is ancestor; main is **5 commits ahead** |

Do not deploy superseded SHAs (`a31c764…`, `f524c119…`, `ed66f49b…`, stale package artifacts).

Local `launch_package/production-deployment.json` references older SHA `eb67e2e0…` / ref `e2e-redesign` with `hardLaunchClaim: false` — **not** launch proof for current main.

---

## Code-side P0/P1 (this branch)

| Sev | ID | Status |
|-----|----|--------|
| P0 | Technician direct open-mission claim in committed rules | **Closed** |
| P1 | Canonical onboarding state machine + submit status writes | **Closed** (submit path) |
| P1 | Owner activation gate alignment | **Closed** |
| P2 | Dead localhost ownerToken API clients | **Closed** |

No unresolved **code-side P0** remaining from this audit pass. Residual P1 items are **operations/live-evidence** only (below).

---

## Operational blockers (fail-closed — not code-passed)

| ID | Sev | Blocker | Why not code |
|----|-----|---------|--------------|
| OPS-STRIPE | P0 | Live AED Checkout + signed webhook 200 + Firestore processed event for deploy SHA | Requires live Stripe + production Functions |
| OPS-SMTP | P0 | SMTP_USER/SMTP_PASS Secret Manager delivery proof | Console/runtime secret verification |
| OPS-APPCHECK | P0 | Production App Check token registration evidence for web app | Firebase Console |
| OPS-E2E5 | P0 | Live five-role walkthrough on current hosting SHA | Seeded credentials + hosted build |
| OPS-PROD-RUN | P0 | Protected `firebase-production-deploy` signed final artifact | Must not be run from this audit |

Until the protected workflow emits a signed decision with empty `failures` and both flags true, launch claims stay false.

---

## CI note

origin/main CI for `3f9da3a0…` concluded **success** at audit start. Branch CI status is reported after PR checks run.
