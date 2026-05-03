# BIN GROUP Super App — V2 Test Verification Report

## Static Checks Completed in ChatGPT Sandbox

### JSON validation
Passed for:
- `.firebaserc`
- `firebase.json`
- `firestore.indexes.json`
- `database.rules.json`

### Source review completed
High-risk files reviewed/modified:
- `firestore.rules`
- `functions/index.ts`
- `functions/ocrEngine.ts`
- `apps/owner-app/src/store/onboardingStore.ts`
- `apps/owner-app/src/components/onboarding/AddOnsStep.tsx`
- `apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx`
- `apps/owner-app/src/pages/PropertyPassportPage.tsx`
- `apps/admin-panel/src/components/BulkImporter.tsx`
- frontend Firebase config files
- `firebase.json`
- `.firebaserc`

### Secret exposure static check
- Removed frontend OpenAI API endpoint allowance from CSP.
- No frontend `VITE_GOOGLE_MAPS_API_KEY` dependency remains.
- Google Maps key standardized to `REACT_APP_GOOGLE_MAPS_API_KEY` for CRA/CRACO.
- OpenAI API use remains in Firebase Functions only.

## Checks Not Completed in ChatGPT Sandbox
The sandbox cannot fully reproduce the local Antigravity/Codex environment, installed dependencies, Firebase login, staging project credentials, or secrets. These commands must be executed locally before staging deployment:

```bash
npm install
npm run build
npm run lint
npm run typecheck --if-present
cd functions && npm install && npm run build && cd ..
firebase use staging
firebase emulators:start --only firestore,functions,hosting
```

## Mandatory Staging Smoke Tests
1. Owner signup/login works against staging Firebase Auth.
2. Owner submits portfolio with more than one property.
3. Each property creates a `propertyPassports/{propertyId}` document.
4. Add-ons visibly update ACV.
5. All 3 contract types are visible and selectable.
6. Google Maps loads with restricted staging key; fallback works without key.
7. Admin bulk imports PROPERTY CSV.
8. Admin bulk imports UNIT CSV.
9. Admin bulk imports TENANT CSV and tenant invitation documents are created.
10. Firestore emulator denies cross-owner and cross-tenant reads.
11. Technician cannot read unassigned tickets.
12. Arabic/English switch persists and RTL/LTR is correct.
