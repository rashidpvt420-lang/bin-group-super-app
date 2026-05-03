# BIN GROUP Super App — Independent V2 Repair Completion Report

## Status
- Package: `BIN_GROUP_APP_REPAIRED_SAFE_PACKAGE_V2.zip`
- Branch expected: `fix/production-stability-full-audit`
- Staging target: `studio-5724711541-8a962`
- Production target: `bin-group-57c60`
- Production deployment: **NO-GO** until staging smoke tests pass.
- Staging deployment: **GO only after local Antigravity/Codex build, lint, typecheck, and emulator checks pass.**

## V2 Repairs Completed
1. Added a real staging alias in `.firebaserc` and separated staging from production targets.
2. Removed production-hardcoded frontend Firebase configuration from owner app, admin panel, shared package, and Firebase messaging service worker.
3. Added `.env.example` with the required `REACT_APP_FIREBASE_*` and `REACT_APP_GOOGLE_MAPS_API_KEY` variables.
4. Removed the global Google Maps placeholder script from `owner-app/public/index.html` and moved Maps loading into the location component.
5. Standardized Google Maps frontend key usage to `REACT_APP_GOOGLE_MAPS_API_KEY` because the app uses React Scripts/CRACO, not Vite.
6. Removed frontend CSP access to `https://api.openai.com`; OpenAI traffic must remain server-side through Firebase Functions.
7. Added `database.rules.json` because `firebase.json` referenced Realtime Database emulator/rules behavior.
8. Repaired `firebase.json` hosting public folders to use built app outputs instead of the missing `hosting/public` folder.
9. Added Property Passport creation during `submitOwnerOnboarding` for every property in a multi-property portfolio.
10. Updated Property Passport UI to read from `propertyPassports/{propertyId}` first and fall back to legacy property data.
11. Connected add-ons to ACV calculation in `onboardingStore.ts`.
12. Expanded add-on catalog with institutional services including security, cleaning, manpower, concierge, generator, offices, shops, parking, waste, MEP, and HVAC PM.
13. Converted Bulk Importer tenant imports into invitation/registry records instead of pretending Firebase Auth users exist.
14. Hardened Firestore rules for owners, tenants, technicians, brokers, property passports, units, tenant invitations, payments, quotes, contracts, tickets, and admin-only fallback.
15. Replaced server-side hardcoded project IDs with dynamic project resolution where practical.
16. Cleaned generated/debug/cache files from the review package.

## Verification Performed in ChatGPT Sandbox
- JSON parse validation passed for `.firebaserc`, `firebase.json`, `firestore.indexes.json`, and `database.rules.json`.
- Static grep audit passed for removed frontend Vite Google key usage and removed global Maps placeholder script.
- Source-level review performed on high-risk files.

## Verification Not Performed in ChatGPT Sandbox
The chat sandbox does not have the full installed monorepo dependency graph, Firebase CLI login, staging secrets, or live Firebase project access. Therefore, these must be run locally in Antigravity/Codex before staging deploy:

```bash
npm install
npm run build
npm run lint
npm run typecheck --if-present
cd functions && npm install && npm run build && cd ..
firebase use staging
firebase emulators:start --only firestore,functions,hosting
```

## Required Secrets Architecture
- `REACT_APP_GOOGLE_MAPS_API_KEY`: frontend-safe only when domain/API restricted in Google Cloud Console.
- `OPENAI_API_KEY`: server-side only via Firebase Functions Secret Manager.
- Stripe secret keys: server-side only.
- SMTP credentials: server-side only.
- Firebase Admin/service-account credentials: never committed and never placed in frontend env.

## Independent Readiness Rating
- Staging readiness after local build/emulator pass: **8.0 / 10**
- Production readiness now: **NO-GO**

## Remaining Mandatory Tests
1. Owner creates a portfolio with 2+ properties and each property gets a passport.
2. Owner sees non-zero ACV that changes with add-ons and complexity.
3. Admin bulk imports PROPERTY, UNIT, and TENANT CSV records.
4. Tenant invitation flow is connected to a real server-side Firebase Auth invite/create function.
5. Firestore emulator confirms cross-owner, cross-tenant, and unassigned-technician access is denied.
6. Arabic/English and RTL/LTR are checked on staging URLs.
7. Google Maps key is domain restricted and fallback works when disabled.
