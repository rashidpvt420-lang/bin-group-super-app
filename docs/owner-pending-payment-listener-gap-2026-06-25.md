# Owner Pending Payment Listener Gap — 2026-06-25

## Status

Fixed in code.

## Fixed commit

`6a086b8b3767cc2cd0d673fae3d7f4dcabff3fbe` — `fix(owner): broaden pending payment listener`

## Location

`src/owner/pages/OwnerDashboardResolvedPage.tsx`

## Previous behavior

The live pending-payment listener previously queried only:

```ts
query(
  collection(db, 'payment_transactions'),
  where('ownerId', '==', authUid),
  where('paymentVerified', '==', false)
)
```

This was safe for new owner rent submissions because the current rent form writes `paymentVerified: false` into `payment_transactions`, but it could under-count older/status-only payment records.

## Fixed behavior

The owner dashboard now has a status-aware resolver:

- pending states include `PENDING`, `PENDING_VERIFICATION`, `PENDING_ADMIN_PAYMENT_VERIFICATION`, `ADMIN_VERIFICATION_REQUIRED`, `ADMIN_REVIEW`, and `UNVERIFIED`.
- verified/closed states include `PAID`, `VERIFIED`, `ADMIN_VERIFIED`, `APPROVED`, `SETTLED`, and `RECONCILED`.
- `paymentVerified === false` is still counted as pending.
- verified/approved/admin-verified records are excluded.

The initial dashboard load now sets pending payment count from loaded payment records, and the live listener now queries owner-scoped `payment_transactions` and filters pending rows in memory.

## Acceptance condition

The owner dashboard pending-payment KPI now counts both:

1. new records that use `paymentVerified: false`, and
2. legacy/status-only pending records.

## Verification notes

Code-level verification completed through GitHub fetch after the commit:

- `PENDING_PAYMENT_STATES`, `VERIFIED_PAYMENT_STATES`, `normalizePaymentState`, and `isPendingOwnerPayment` are present.
- Initial load calls `setPendingPayments(payments.filter(isPendingOwnerPayment).length)`.
- Live listener now uses `where('ownerId', '==', authUid)` only, then applies `isPendingOwnerPayment` in memory.

## Remaining requirement

Wait for the next BIN GROUP CI result on the fixed commit. If CI fails, inspect the exact failed step and patch that specific issue.
