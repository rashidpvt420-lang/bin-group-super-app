# Owner Rent Notification Scope — 2026-06-25

## Added in this branch

- Owner rent payment submission now writes a self-notification after the `payment_transactions` record is created.
- Notification type: `OWNER_RENT_PAYMENT_SUBMITTED`.
- Notification route: `/owner/dashboard`.
- Notification metadata includes amount, property name, and payment transaction ID.

## Security note

Admin-group notification helper was added to the client notification service for consistency, but the browser flow does not call it yet because the callable Cloud Function allow-list still blocks that new admin-group event type. This prevents owners from creating arbitrary admin-group notifications.

## Still left

- Add server-side allow-list support for `OWNER_RENT_PAYMENT_SUBMITTED` admin-group notifications.
- Add approval/rejection notifications when admin verifies the payment transaction.
- Add rent statement PDF export.
