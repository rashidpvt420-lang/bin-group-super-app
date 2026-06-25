# Owner Pending Payment Listener Gap — 2026-06-25

## Status

Open follow-up. The current production-visible Actions screen shows the latest `main` checks green, but one owner-dashboard logic gap remains for older payment records.

## Location

`src/owner/pages/OwnerDashboardResolvedPage.tsx`

## Current behavior

The live pending-payment listener currently queries:

```ts
query(
  collection(db, 'payment_transactions'),
  where('ownerId', '==', authUid),
  where('paymentVerified', '==', false)
)
```

This is safe for new owner rent submissions because the current rent form writes `paymentVerified: false` into `payment_transactions`.

## Remaining risk

Older or alternate payment records may be pending but may not include `paymentVerified: false`. Examples:

- `status: 'PENDING'`
- `paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION'`
- `verificationState: 'ADMIN_VERIFICATION_REQUIRED'`
- `settlementStatus: 'PENDING'`

Those records can be under-counted by the live KPI until the owner dashboard listener is broadened.

## Required fix

Replace the boolean-only live query with an owner-scoped query and in-memory pending-state resolver:

```ts
const pendingPaymentStates = new Set([
  'PENDING',
  'PENDING_VERIFICATION',
  'PENDING_ADMIN_PAYMENT_VERIFICATION',
  'ADMIN_VERIFICATION_REQUIRED',
  'ADMIN_REVIEW',
  'UNVERIFIED',
]);

const verifiedPaymentStates = new Set([
  'PAID',
  'VERIFIED',
  'ADMIN_VERIFIED',
  'APPROVED',
  'SETTLED',
  'RECONCILED',
]);

const normalizePaymentState = (value: unknown) => String(value || '').trim().replace(/\s+/g, '_').toUpperCase();

const isPendingOwnerPayment = (row: any) => {
  if (!row) return false;
  if (row.paymentVerified === true || row.approved === true || row.adminVerified === true) return false;
  const states = [row.status, row.paymentStatus, row.verificationState, row.settlementStatus, row.approvalStatus, row.reviewStatus]
    .map(normalizePaymentState)
    .filter(Boolean);
  if (states.some((state) => verifiedPaymentStates.has(state))) return false;
  if (row.paymentVerified === false) return true;
  return states.some((state) => pendingPaymentStates.has(state) || state.includes('PENDING') || state.includes('REVIEW'));
};
```

Then the live listener should use:

```ts
const payQuery = query(
  collection(db, 'payment_transactions'),
  where('ownerId', '==', authUid)
);

const unsubPay = onSnapshot(payQuery, (snap) => {
  const pending = snap.docs.filter((doc) => isPendingOwnerPayment(doc.data())).length;
  setPendingPayments(pending);
});
```

## Acceptance condition

The owner dashboard pending-payment KPI must count both:

1. new records that use `paymentVerified: false`, and
2. legacy/status-only pending records.

## Notes

Do not make a blind full-file rewrite of `OwnerDashboardResolvedPage.tsx` without local build/typecheck, because it is a large active dashboard file and recent commits are green.
