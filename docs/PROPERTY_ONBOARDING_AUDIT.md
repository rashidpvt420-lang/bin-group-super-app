# Property Onboarding Audit

**Source branch:** `main`
**Source binding:** The exact commit is supplied by the protected CI or deployment workflow. This document intentionally contains no fixed commit SHA.
**Decision:** Code paths are fail-closed; public launch remains **NO-GO** without protected live evidence for one exact SHA.

## Canonical journey

1. Public property and ownership intake.
2. Owner account creation and verified email.
3. Proof upload to owner-scoped Storage.
4. Server-authoritative quote preview and locked quote hash.
5. Contract selection and signature verification bound to the contract hash.
6. Payment package creation before online checkout, or immutable manual receipt upload.
7. Provider webhook or manual evidence validation.
8. Admin approval through the protected payment-approval operation.
9. Atomic activation of contract, owner, user, intake, property and invoice records.
10. Dashboard access only when the complete activation policy passes.

The disabled legacy owner-onboarding callable remains a fail-closed compatibility stub. The live path uses the protected payment-package operation and does not accept client-calculated activation authority.

## Canonical lifecycle vocabulary

`draft` → `property_details_complete` → `documents_pending` → `quote_ready` → `contract_selected` → `deposit_pending` → `deposit_processing` → `deposit_paid` → `identity_pending` → `signature_pending` → `admin_review` → `approved` → `active`

Control states: `changes_requested`, `rejected`, `expired`, `suspended`.

Legacy live values normalize to the canonical state machine for display and recovery. Authorization always checks explicit server fields.

## Integrity invariants

- Quote and contract hashes are generated and locked server-side.
- Signature evidence must match the owner, contract and locked contract hash and may be consumed only once.
- Canonical activation uses the same intake, contract, payment and receipt-path identity. Divergent legacy records require migration.
- Receipt metadata binds the owner, payment, evidence type, hash, content type, size and immutable Storage generation.
- Provider completion must match the persisted session, amount, currency and payer. A paid mismatch creates durable reconciliation evidence and never unlocks access.
- Owner activation requires active status, Admin approval, verified payment, explicit dashboard unlock and a non-empty active contract identity.
- Owners cannot browser-write activation-adjacent fields in user, owner, property, contract or payment records.

## Recovery and idempotency

- Payment-package and provider-session creation use stable identities and validate existing bindings.
- Expired or closed provider sessions rotate checkout attempts.
- Webhook event records and deterministic invoice and commission identities prevent duplicate side effects.
- Rejected manual evidence can be resubmitted only with newly validated immutable Storage evidence.
- Suspended owners are disabled in Auth, receive a suspension claim and have refresh tokens revoked; resume reverses all three controls.

## Operations still required

- Real AED live checkout and matching processed webhook evidence.
- Production email-delivery secret and provider message evidence.
- Exact-SHA App Check and five-profile hosted walkthrough.
- Protected production deployment and signed same-run final decision.

These operations must be proved by protected runtime artifacts. Source documentation cannot assert that they have passed.
