# BIN GROUP Super App — Repair Changelog

## Independent V2 Surgical Fixes

### `.firebaserc`
- Added `staging` alias for `studio-5724711541-8a962`.
- Kept `production` alias for `bin-group-57c60`.
- Added hosting target separation to prevent accidental production deployment.

### `firebase.json`
- Removed broken/missing `hosting/public` dependency.
- Pointed hosting targets to `apps/owner-app/build` and `apps/admin-panel/build`.
- Removed missing Data Connect reference.
- Kept Firestore, Storage, Functions, Hosting, and Emulator configuration explicit.
- Removed frontend CSP access to `api.openai.com`.

### `database.rules.json`
- Added restrictive Realtime Database rules because database emulator/rules configuration existed.
- Only admin/isAdmin tokens can read/write RTDB.

### Frontend Firebase Config
Files updated:
- `apps/owner-app/src/lib/firebase.ts`
- `apps/admin-panel/src/lib/firebase.ts`
- `packages/shared/src/lib/firebase.ts`
- `apps/owner-app/public/firebase-messaging-sw.js`

Before:
- Firebase frontend config was hardcoded to production project values.

After:
- Config is loaded from `REACT_APP_FIREBASE_*` variables.
- This allows staging builds without pointing the frontend at production.

### Google Maps
Files updated:
- `apps/owner-app/public/index.html`
- `apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx`

Before:
- Global `%REACT_APP_GOOGLE_MAPS_API_KEY%` script existed in HTML.
- Mixed `VITE_GOOGLE_MAPS_API_KEY`/CRA key expectations caused unreliable loading.

After:
- Maps script is loaded by the component only when a valid key exists.
- CRA/CRACO key name is standardized as `REACT_APP_GOOGLE_MAPS_API_KEY`.
- Missing/failing Maps key triggers manual fallback mode and does not block onboarding.

### Add-ons and Pricing
Files updated:
- `apps/owner-app/src/store/onboardingStore.ts`
- `apps/owner-app/src/components/onboarding/AddOnsStep.tsx`

Before:
- Add-ons were visible but not materially connected to ACV calculation.
- Several institutional add-on categories were missing.

After:
- ACV includes selected and mandatory add-ons.
- Added security, cleaning, manpower, concierge, pest control, generator, office units, retail shops, parking, waste management, MEP support, HVAC preventive maintenance, and related items.

### Property Passport
Files updated:
- `functions/index.ts`
- `apps/owner-app/src/pages/PropertyPassportPage.tsx`

Before:
- No canonical `propertyPassports/{propertyId}` ledger was created during owner onboarding.
- UI relied mainly on property records.

After:
- Every normalized property in a submitted portfolio creates/updates a canonical passport.
- Passport includes ownership, location, structure, contract, payment, add-ons, compliance, system status, quote/contract/payment history, and risk fields.
- UI reads canonical passport first and falls back to legacy property data.

### Bulk Importer
File updated:
- `apps/admin-panel/src/components/BulkImporter.tsx`

Before:
- Tenant imports wrote user-like documents without creating real Firebase Auth users.

After:
- PROPERTY imports create properties and passports.
- UNIT imports create root and nested unit records.
- TENANT imports create `tenantInvitations`, nested tenant records, tenant registry records, and unit occupancy updates.
- Import clearly marks tenant Auth creation as pending server-side work.

### Firestore Rules
File updated:
- `firestore.rules`

Before:
- Rules were incomplete for the stated tower/owner/tenant/property passport model.

After:
- Added role/ownership helpers and collection-specific access for users, owners, properties, nested units/tenants/tickets, passports, units, tenants, tenant invitations, tenancies, maintenance tickets, intake submissions, contracts, quotes, payments, broker referrals, add-ons, logs, design requests, and move-out requests.
- Fallback is admin-only.

### Server-side Project IDs
Files updated:
- `functions/index.ts`
- `functions/ocrEngine.ts`

Before:
- Some server-side logic referenced hardcoded production project ID.

After:
- Project ID is resolved dynamically from Firebase/Admin runtime environment where practical.

### Package Cleanup
Removed generated/debug/cache artifacts from the V2 review package, including Firebase debug logs, generated Functions lib output, Android Gradle build/cache files, IDE cache files, and generated mobile web assets.
