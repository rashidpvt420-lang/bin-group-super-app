# Phase 11 — Payments and Financial Authority

Baseline: `main@d12683b52792c8885684b6f5e980cd02cb83eaeb`  
Audit branch: `audit/phase-11-payments-financial-authority`

## Canonical production policy

The authoritative Phase 1 Owner activation payment policy is:

- Currency: **AED**
- Owner activation methods: **CASH** and **CHEQUE** only
- Bank Transfer: **disabled**
- Stripe/Card: **disabled**
- Owner payment due only **after every required physical inspection is completed and verified**
- The payable 15% amount comes only from the **final server re-quote**
- AED amounts are normalized to **two decimals / fils**
- Admin payment approval requires Firebase Auth, Finance/Admin authority, App Check and a verified MFA session
- Property/contract/dashboard activation occurs only from server-side approval after immutable receipt, quote, OTP, policy, inspection and geo checks

No browser is allowed to choose or calculate the amount that becomes financial authority.

## Quotation

The Owner quote engine is server-side. Quote snapshots carry the annual contract value, 15% activation deposit, quote hash and timestamp. The canonical inspection-first lifecycle stores the signed pre-inspection quote as non-payable, then creates a final verified quote after the physical site visits.

Phase 11 additionally requires the generic payment-creation callable to prove:

- `inspectionVerified === true`
- `quoteRepricedAfterInspection === true`
- `quoteVerificationState === FINAL_VERIFIED_AFTER_ALL_SITE_VISITS`
- final quote hash and signed pre-inspection hash are valid
- final quote snapshot hash matches the final hash
- payment state is an approved post-inspection payment-review state

This closes the path where a signed preliminary quote could otherwise be reused to create an activation payment before the final inspection re-quote.

## Deposit, rounding and fils

Canonical money helpers normalize AED values to two decimal places.

Two reference cases remain protected by the existing cent-precision suite:

- AED 318,784 annual → AED 47,817.60 mobilisation
- AED 82,305 annual → AED 12,345.75 mobilisation

Phase 11 removes active UI/Admin fallbacks that recomputed `annual * 0.15` locally. The payable amount shown by active onboarding/payment screens must come from a server quote/payment record.

The physical payment evidence callable previously tolerated a difference of exactly AED 0.01 because it rejected only differences greater than AED 0.01. Phase 11 changes this to normalized exact equality. A one-fils mismatch now fails closed.

## Inspection before payment

Canonical lifecycle:

1. Five-page Owner submission
2. Admin document/property review
3. One linked physical inspection for every property
4. Verified GPS/checklist/photo evidence
5. Final server re-quote
6. Exact 15% Cash/Cheque receipt evidence
7. Finance/Admin MFA approval
8. Invoice creation
9. Contract/property activation
10. Owner dashboard unlock

Initial submission remains `NOT_DUE_UNTIL_INSPECTION_COMPLETE` / `INSPECTION_REQUIRED_BEFORE_PAYMENT`.

## Stripe intent and webhook

**Current production:** Stripe is not an approved Phase-1 payment provider.

`functions/runtime.ts` deploys the Phase-1 Stripe hold rather than the future Stripe implementation:

- checkout callable rejects with a failed-precondition
- webhook endpoint returns HTTP 410
- adding Stripe secrets cannot silently reactivate card collection

The dormant future Stripe module was reviewed for server-derived amounts, webhook signature verification, event claiming/deduplication and mismatch/failure handling, but it is not production financial authority and must be independently re-audited before Stripe is ever enabled.

## Duplicate payment / duplicate webhook / replay

Current manual Owner payments bind:

- canonical payment ID
- Owner UID
- contract/intake ID
- quote hash
- policy version/hash
- immutable Storage receipt hash/generation
- payment method
- exact server amount

Admin approval is transactional and idempotent. A replay of an already approved payment returns idempotent success without generating a second activation.

Stripe duplicate-webhook behavior is not part of Phase-1 production because the deployed webhook is a 410 hold.

## Failed/rejected payment

Admin rejection:

- cannot reject an already activated payment
- marks the pending transaction rejected
- invalidates any historical Stripe IDs if present
- keeps dashboard locked
- keeps contract activation locked
- records an audit entry

An activated payment is never rewritten as rejected. It must use the cancellation/refund disposition workflow.

## Refund and cancellation

Contract closure is App Check + MFA protected and server-authoritative.

Phase 11 adds explicit financial disposition:

- paid contract closure → `REFUND_REVIEW_REQUIRED`
- already fully refunded → `FULL_REFUND_RECORDED`
- no approved payment → `NO_APPROVED_PAYMENT`

The original approved payment and paid invoice remain historical truth.

Finance/Admin resolves the review through `adminRecordOwnerPaymentRefund`:

- **FULL_REFUND**: amount is copied from the authoritative approved payment; the browser cannot provide the amount
- **NO_REFUND**: records zero refund with audit evidence
- partial refunds: **fail closed** until BIN GROUP defines an approved server-side partial-refund policy
- Cash/Cheque refund reference is mandatory for a full refund
- duplicate calls are idempotent only when the stored disposition/evidence is identical
- refund/disposition is written as a separate `payment_transactions` ledger record
- original payment, contract and invoice receive reconciliation metadata but their original paid history is not erased

The Admin Contract Control UI contains no refund-amount input.

The legacy Contract Termination page no longer directly writes contracts/audit logs from the browser; it delegates to the protected server callable.

## Admin approval, invoice, contract and property activation

Before Owner activation approval, the server re-verifies:

- canonical payment record
- Cash/Cheque method
- active payment policy version/hash
- exact locked amount
- immutable receipt hash/generation
- final quote binding
- durable OTP signature evidence
- completed inspection evidence
- verified/dispatch-ready property geo
- Owner binding

A single approval transaction writes the approved payment state, active contract state, active intake state, Owner dashboard state, property activation, invoice, invoice registry and audit evidence.

Invoice amount is the exact server-authoritative approved amount. Invoice proof hash binds the invoice ID, payment, contract, intake, amount, currency, fee type and quote hash.

## Evidence/verifier consistency repair

Historical `run-owner-onboarding-production-evidence*.mjs` scripts still described the retired BANK_TRANSFER/payment-first model even though active workflows had already moved to the inspection-first Cash/Cheque lifecycle.

Phase 11 retires both legacy scripts as compatibility aliases to:

`run-owner-inspection-first-production-evidence.mjs`

The canonical production evidence runner proves:

- methods exactly CASH/CHEQUE
- payment not due before inspections
- final server quote
- Cash receipt evidence
- exact payment amount
- Admin MFA approval
- approval replay idempotency
- invoice hash
- contract/property activation
- dashboard unlock
- real mailbox OTP evidence

This prevents another policy/verifier split of the type that caused earlier Operational Application Evidence failures.

## Regression gate

`tests/launch/phase-11-payments-financial-authority.test.mjs` fails if:

- Phase-1 methods drift from Cash/Cheque
- Stripe becomes live through the production runtime
- inspection/final re-quote gates disappear
- one-fils mismatch is tolerated
- active UI restores local 15% payment calculation
- BANK_TRANSFER/Stripe re-enter Owner approval
- invoice/activation server writes disappear
- contract closure loses refund review state
- browser-supplied refund amount appears
- direct browser contract closure returns
- old production evidence runners regain a contradictory payment policy

## Release rule

Phase 11 is complete only after the exact PR head passes all existing build/security/launch suites plus the new Phase-11 regression test. No production deployment or HARD_CLEARANCE is run merely by this audit.
