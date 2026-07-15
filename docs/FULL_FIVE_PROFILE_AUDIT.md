# Full Five-Profile Audit

**Audit date:** 14 July 2026  
**BASE_SHA (origin/main):** `3f9da3a0cb9df940c9780ead237167b8992ffa66`  
**Branch:** `cursor/full-system-audit-fix`  
**Frozen candidate compared:** `55f4a8972f584dbd0eb142b1f41df1cbcabd1f07` (ancestor; origin/main moved **+5** commits)  
**Decision:** **HARD PUBLIC LAUNCH = NO-GO** (`pilotEligible=false`, `hardLaunchClaim=false`)

Superseded SHAs must not be deployed: `a31c764…`, `f524c119…`, `ed66f49b…` (ancestors of HEAD); `372ebf0d…` not on this ancestry path.

---

## Topology (Phase 1)

| Portal | Base URL | Auth | Guard | Primary backend |
|--------|----------|------|-------|-----------------|
| Public / marketing | `/`, `/owners`, `/tenants`, … | Optional | `publicOrPilot` | Firebase hosting + public read |
| Owner onboarding | `/onboarding/*` | Public → auth after payment package | `submitOwnerOnboarding` callable | `intake_submissions`, contracts, payments |
| Owner | `/owner/*` | Required `owner` | `protectedRoute` + `OwnerActivationGuard` | Callables + scoped Firestore |
| Tenant | `/tenant/*` | Required `tenant` | unit/lease scope | Tickets, notices, handover callables |
| Technician | `/technician/*` | Required `technician` | approved profile | `acceptTechnicianTicket`, lifecycle callables |
| Broker | `/broker/*` | Required `broker` | lead ownership | `brokerCommissions` server authority |
| Admin (in-app) | `/admin/*` | Admin staff claims | `ADMIN_STAFF_ROLES` | Claims + Admin SDK |
| Admin panel app | `apps/admin-panel` | Dedicated hosting | App Check + claims | Same Firebase project |

Admin privilege is claims-backed in `firestore.rules` (`hasAdminClaim` / `isAdmin`); profile email alone is not authority.

---

## Findings repaired on this branch

### P0 — Direct technician open-mission claim path

| Field | Detail |
|-------|--------|
| Portal | Technician |
| Route/file | `firestore.rules` `match /tickets/{ticketId}` |
| Actual | Committed rules OR’d `safeOpenMissionClaim()`, allowing approved techs to self-assign via client `updateDoc` (race-prone; dual-write vs `maintenanceTickets`) |
| Expected | Assignment via dispatcher/`canDispatchJobs` or `acceptTechnicianTicket` transaction only |
| Root cause | Claim helper left in committed rules; `prepare:rules` stripped it only at CI time |
| Risk | Duplicate assignment / stolen missions under concurrency |
| Fix | Remove claim helpers and `\|\| safeOpenMissionClaim()` from committed rules (aligned with `apply-ticket-rule-binding.mjs`) |
| Test | `test/security-rules.test.js` (approved tech claim fails); `test/five-profile-audit-guards.test.mjs` |
| Status | **Fixed** |

### P1 — Fragmented onboarding status vocabulary

| Field | Detail |
|-------|--------|
| Portal | Owner onboarding |
| Route/file | `functions/index.ts` `submitOwnerOnboarding`; multiple legacy status strings |
| Actual | Mixed `pending_admin_review`, `PAYMENT_PENDING`, `AWAITING_VERIFICATION`, etc. |
| Expected | Canonical deterministic state machine |
| Root cause | Incremental feature writes without shared lifecycle module |
| Risk | Wrong unlock gates, operator confusion, broken resume |
| Fix | `src/lib/onboardingStateMachine.ts` + `functions/onboardingStateMachine.ts`; submit path writes `admin_review` / `deposit_pending` and returns recovery snapshot |
| Test | `test/onboarding-state-machine.test.mjs` |
| Status | **Fixed** (normalize aliases retained for legacy reads; remaining write sites still migrating) |

### P1 — Owner activation UI inconsistency

| Field | Detail |
|-------|--------|
| Portal | Owner |
| Route/file | `OwnerActivationPage.tsx`, `OwnerActivationGuard.tsx` |
| Actual | Page treated `dashboardUnlocked` OR weak payment “in review” when `mobilization > 0` |
| Expected | Unlock only with `paymentVerified && adminApproved && activeContractId` |
| Fix | Align page + guard; payment in-review no longer forces true on amount alone |
| Test | `test/five-profile-audit-guards.test.mjs` |
| Status | **Fixed** |

### P2 — Dead localhost REST `ownerToken` clients

| Field | Detail |
|-------|--------|
| Portal | Owner (legacy) |
| Route/file | `src/services/api.ts`, `apps/owner-app/src/services/api.ts` |
| Actual | Axios default `http://localhost:5000` + `localStorage.ownerToken` |
| Expected | No fake REST auth surface |
| Fix | Fail-closed stubs that throw |
| Test | `test/five-profile-audit-guards.test.mjs` |
| Status | **Fixed** |

---

## Portal completeness (code-side)

### Owner
- Registration / onboarding callables present; activation guard server-flag based.
- Property/docs/contracts/IBAN/payments/tickets routes registered under `/owner/*`.
- Remaining ops: live five-role E2E + Stripe live webhook evidence (operations).

### Tenant
- Unit-bound ticket create enforced in rules; evidence updates constrained.
- Privacy: cross-unit reads denied by ownership helpers (rules suite).
- Remaining ops: live invite/SOS proof with production credentials.

### Technician
- Accept/lifecycle via callables + transactions; offline queue is local retry only.
- Direct open claim closed on this branch.
- Remaining ops: concurrent live claim evidence on production.

### Admin
- In-app `/admin/*` + `apps/admin-panel`; App Check enforced on Functions globally (`europe-west3`, `enforceAppCheck: true`).
- Launch dashboard must not invent readiness (see prior audit #227).
- Remaining ops: Console App Check UUID, SMTP Secret Manager live delivery.

### Broker
- Lead/commission paths use server transactions in `brokerCommissions.ts`.
- Remaining ops: live commission/withdrawal proof.

---

## Inventory notes

- **Unreachable / alias routes:** several marketing redirects (`/company` → hash); `/tech/*` → technician dashboard.
- **localStorage:** language, theme, onboarding draft, technician offline queue — **not** used as role authorization after #257.
- **Mock/placeholder:** form placeholders only; no role mock auth in production paths audited.
- **Dual ticket collections:** `tickets` and `maintenanceTickets` both exist; prefer callables for mutations.

---

## Test commands proving code repairs

```bash
node --experimental-strip-types --test test/onboarding-state-machine.test.mjs test/five-profile-audit-guards.test.mjs
npm run test:stability
npm run test:launch-honesty
npm run typecheck
npm run lint
npm run build
npm run build:admin
npm run build:functions
npm run test:rules
npm run test:mobile-store-readiness
```

Live E2E is **not** claimed pass unless credentials + App Check + hosted evidence are present in the runner environment.
