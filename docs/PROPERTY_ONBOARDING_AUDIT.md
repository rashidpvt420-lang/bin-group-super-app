# Property Onboarding Audit

**BASE_SHA:** `b4bda2b2d07b951101bc0578581e5040ab8698ed`
**Branch:** `cursor/full-system-audit-fix-v4-30e9`
**Decision:** Code paths are fail-closed; public launch remains **NO-GO** without protected live evidence.

## Canonical journey

1. Public property and ownership intake.
2. Owner Auth account creation and verified email.
3. Proof upload to owner-scoped Storage.
4. Server-authoritative quote preview and locked `quoteHash`.
5. Contract selection and OTP signature bound to the contract hash.
6. Payment package creation before Stripe checkout, or immutable manual receipt upload.
7. Stripe webhook/manual evidence validation.
8. Admin approval through `adminApprovePayment`.
9. Atomic contract, owner, user, intake, property and invoice activation.
10. Dashboard unlock only when the complete activation policy passes.

The disabled `submitOwnerOnboarding` callable is a minimal fail-closed compatibility stub. The live path is `submitOwnerOnboardingPaymentPackage`; it does not accept client-calculated activation authority.

## Canonical lifecycle vocabulary

`draft` → `property_details_complete` → `documents_pending` → `quote_ready` → `contract_selected` → `deposit_pending` → `deposit_processing` → `deposit_paid` → `identity_pending` → `signature_pending` → `admin_review` → `approved` → `active`

Control states: `changes_requested`, `rejected`, `expired`, `suspended`.

Legacy live values including `payment_pending_approval`, `pending_admin_payment_verification` and `payment_verified_pending_admin_approval` normalize to the canonical machine. State normalization is display/recovery logic; authorization always checks explicit server fields.

## Integrity invariants

- Quote and contract hashes are 64-character SHA-256 values generated/locked server-side.
- OTP evidence must match owner UID, contract ID, signature and contract hash and may be consumed only once.
- Canonical activation uses the same intake, contract, payment and receipt-path ID. Divergent legacy records require migration.
- Receipt metadata binds owner UID, payment ID, evidence type, hash, content type, size and immutable Storage generation.
- Stripe completion must match the persisted session, amount, currency and payer. A paid mismatch creates durable manual-reconciliation evidence and never unlocks.
- Owner activation requires `status=active`, `adminApproved=true`, `paymentVerified=true`, `dashboardUnlocked=true`, `dashboardLocked!=true` and a non-empty `activeContractId`.
- Owners cannot client-write activation-adjacent fields in `users`, `owners`, `properties`, contracts or payment ledgers.

## Recovery and idempotency

- Payment package and Stripe session creation use stable IDs and validate existing bindings.
- Expired/closed Stripe sessions rotate checkout attempts.
- Webhook event records and deterministic invoice/commission IDs prevent duplicate side effects.
- Rejected manual evidence can be resubmitted only with newly validated immutable Storage evidence.
- Suspended owners are disabled in Auth, receive a suspension claim and have refresh tokens revoked; resume reverses all three controls.

## Operations still required

- Real AED live Checkout and matching processed webhook evidence.
- SMTP secret and provider-delivery evidence.
- Exact-SHA App Check and five-profile hosted walkthrough.
- Protected production deployment and signed same-run final decision.
