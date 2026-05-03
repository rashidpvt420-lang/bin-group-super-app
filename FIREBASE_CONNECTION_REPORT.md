# BIN GROUP Super App — Firebase Connection Report V2

## Project Separation
- Staging project alias: `staging` -> `studio-5724711541-8a962`
- Production project alias: `production` -> `bin-group-57c60`
- Default is set to staging to reduce accidental production deployment risk.

## Frontend Firebase Configuration
Frontend Firebase config is no longer hardcoded. Required variables:

```bash
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
REACT_APP_GOOGLE_MAPS_API_KEY=
```

These values must be staging values during staging build and production values only during approved production build.

## Functions Secrets
Server-only secrets must be set through Firebase Functions Secret Manager or equivalent server-side environment:

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

No OpenAI, Stripe, SMTP, Firebase Admin, or service-account secrets should exist in frontend code or committed files.

## Firestore
Rules file: `firestore.rules`
Indexes file: `firestore.indexes.json`

Rules now include collection-specific protections for:
- users
- owners
- properties
- properties/{propertyId}/units
- properties/{propertyId}/tenants
- properties/{propertyId}/tickets
- properties_pending
- propertyPassports
- units
- tenants
- tenantInvitations
- tenancies
- maintenanceTickets
- intake_submissions
- contracts
- quotes
- payments
- payment_transactions
- brokerReferrals
- addOns
- audit/security/telemetry logs
- design requests
- move-out requests

Fallback access is admin-only.

## Realtime Database
A restrictive `database.rules.json` was added because emulator/database config exists. Only admin/isAdmin tokens can read/write.

## Hosting
Firebase Hosting now targets built outputs:
- Owner app: `apps/owner-app/build`
- Admin panel: `apps/admin-panel/build`

Run app builds before hosting deployment.

## Deployment Warning
Do not deploy production until staging smoke tests pass and Firestore rule behavior is verified through emulator or controlled staging accounts.
