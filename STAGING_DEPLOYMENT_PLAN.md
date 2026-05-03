# BIN GROUP Super App — Staging Deployment Plan

## Staging target
- Firebase project alias: `staging`
- Firebase project ID: `studio-5724711541-8a962`
- Production project ID: `bin-group-57c60`

Production must remain untouched until staging smoke tests pass and a separate production approval is given.

## Required frontend environment variables
Create staging `.env.local` files for `apps/owner-app` and `apps/admin-panel` using staging Firebase Web App values:

```bash
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=studio-5724711541-8a962.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=studio-5724711541-8a962
REACT_APP_FIREBASE_STORAGE_BUCKET=studio-5724711541-8a962.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
REACT_APP_GOOGLE_MAPS_API_KEY=...
```

Google Maps browser key must be restricted to staging hosting domains and only the required Maps APIs.

## Required server-side secrets
Set secrets only in Firebase Functions / Google Secret Manager. Do not put these in frontend `.env` files.

```bash
firebase functions:secrets:set OPENAI_API_KEY --project staging
firebase functions:secrets:set STRIPE_SECRET_KEY --project staging
firebase functions:secrets:set SMTP_PASSWORD --project staging
```

## Deploy sequence

```bash
firebase use staging
firebase deploy --only firestore:rules --project staging
firebase deploy --only firestore:indexes --project staging
npm run build
firebase deploy --only functions --project staging
firebase deploy --only hosting:owner-app --project staging
firebase deploy --only hosting:admin-panel --project staging
```

## Smoke test gate
1. Owner account can sign in to staging only.
2. Owner creates a portfolio with more than one property.
3. `submitOwnerOnboarding` persists every property and creates `propertyPassports/{propertyId}`.
4. Quote/ACV is non-zero and changes when units, age, grade, emirate, and add-ons change.
5. Google Maps loads with the restricted key, or manual fallback works without blocking onboarding.
6. Admin can import PROPERTY, UNIT, and TENANT CSV rows.
7. Admin can view 53+ tenants with pagination.
8. Owner cannot read another owner's property, contract, payment, or passport.
9. Tenant cannot read unrelated tenant/unit records.
10. Technician cannot read unassigned tickets.
11. Browser console has no Firebase permission errors for valid actors.
12. Unauthenticated users cannot read private collections.

## Production promotion checklist
- Independent code review approved.
- Staging smoke test screenshots captured.
- Firestore rules access matrix verified.
- Functions logs clean.
- Google Maps domain restriction verified.
- Production `.env` values reviewed.
- Manual written approval before `firebase use production`.
