# Property Onboarding Audit

**BASE_SHA:** `3f9da3a0cb9df940c9780ead237167b8992ffa66`  
**Branch:** `cursor/full-system-audit-fix`  
**Decision:** Code-side onboarding is recoverable and server-gated; **public launch remains NO-GO** until payment/SMTP/App Check ops evidence exists.

---

## Canonical state machine

Defined in `src/lib/onboardingStateMachine.ts` (mirrored in `functions/onboardingStateMachine.ts`):

`draft` → `property_details_complete` → `documents_pending` → `quote_ready` → `contract_selected` → `deposit_pending` → `deposit_processing` → `deposit_paid` → `identity_pending` → `signature_pending` → `admin_review` → `changes_requested` | `approved` → `active`

Terminal / control: `rejected`, `expired`, `suspended`.

Legacy aliases (examples): `pending_admin_review` → `admin_review`; `PAYMENT_PENDING` → `deposit_pending`; `APPROVED_PENDING_OWNER_SIGNATURE` → `signature_pending`.

Recovery snapshot fields: `progressPercent`, `currentBlocker`, `nextRequiredStep`, `lastCompletedStep`, `actionRequired`, `supportReferenceId`, `adminReviewReason`, `unlocksDashboard` (true only for `active`).

---

## Stage map (A–V)

| Stage | UI | Server write / callable | Unlock effect |
|-------|----|-------------------------|---------------|
| A Public landing | `/`, `/owner-landing` | none | none |
| B–E Property intake | `/onboarding/*` steps | local zustand draft (`bin-group-onboarding-v3`) | none |
| F Proof upload | ProofUploadStep | storage under owner paths; package submit | none |
| G–H Quote | QuoteModelingStep | client quote engine; hash required on accept | new quote version if changed |
| I Contract selection | ContractSelectionStep | stored on submit | none |
| J–K Deposit + plan | PaymentSubmissionStep | `submitOwnerOnboarding` then Stripe checkout | dashboard stays locked |
| L–N Auth + profile + contract | AccountCreation / callables | owners/users/contracts | locked |
| O OTP signature | ContractSignatureOtp + `ownerSignContractAndQueuePdf` | OTP hashed server-side | locked |
| P Payment proof | Stripe webhook / admin payment approval | payment docs; `processed` registry | locked until admin |
| Q–R Admin approve + activate | admin callables | `paymentVerified`, `adminApproved`, `activeContractId` | **then** unlock |
| S–U Units / invites / IBAN | owner portal after unlock | scoped creates + verification | operational |
| V Dashboard | `/owner/dashboard` | `OwnerActivationGuard` | requires three server flags |

**Rule:** Client Stripe success or query params never unlock. Activation requires server-confirmed payment + valid contract binding + admin approval.

---

## Findings

### P1 — Status vocabulary fragmentation (partially closed)

| Field | Detail |
|-------|--------|
| Actual | Intake/owner docs used `AWAITING_VERIFICATION`, `PAYMENT_PENDING`, `pending_admin_review` |
| Expected | Canonical states above |
| Fix | Submit callable now writes `admin_review` / `deposit_pending` and returns recovery snapshot |
| Status | **Fixed for submit path**; other admin/Stripe writers still alias-compatible |

### P1 — Dashboard unlock UX vs guard

| Field | Detail |
|-------|--------|
| Actual | Activation page could show progress using `dashboardUnlocked` without `adminApproved` |
| Fix | Page + guard aligned to `paymentVerified && adminApproved && activeContractId` |
| Status | **Fixed** |

### Ops (not code-pass)

| ID | Blocker |
|----|---------|
| O-1 | Live Stripe AED checkout + webhook HTTP 200 + Firestore `processed: true` for current main SHA |
| O-2 | SMTP Secret Manager values cannot be verified from this workstation |
| O-3 | Protected production deploy + signed decision artifact not run (by design) |

---

## Idempotency / abandoned flows

- `submitOwnerOnboarding` uses `idempotencyKey` / session id document ids.
- Stripe webhook uses processed-event registry (`processed: true` / ignore duplicates).
- Abandoned drafts remain in localStorage until cleared; resume does not imply payment.

---

## Quote integrity

Quote engine: UAE zone/age/type/units/floors/lifts/facilities/package/VAT/deposit. Accepted quotes must not be silently mutated — generate a new version/hash (engine already versions; server package store must retain `quoteHash` / `quoteVersion` — client cannot alter protected property fields per `safeOwnerPropertyUpdate`).
