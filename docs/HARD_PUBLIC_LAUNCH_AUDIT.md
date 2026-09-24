# BIN GROUP Super App — Hard Public Launch Audit

> **CURRENT STATUS**: `hardLaunchClaim=false`  
> **PILOT PRESERVATION**: The completed 24-hour controlled pilot remains fully intact and has NOT been reset or restarted.  
> **MISSION DIRECTIVE**: Strict runtime reconciliation and stabilization. No HARD_CLEARANCE. No unauthorized production deployment.

---

## 1. Governance & Lineage Audit

- **Base Protected Main**: `0e31c4c8e174ff117b69e8a463938e1462d617b9` (superseding `7a8766df` via PR #1356).
- **Preserved Source Branch**: `origin/preserve/post-pilot-property-runtime-a914c51d` (PR #1347 reverted by #1352).
- **Candidate Reconciliation Branch**: `fix/final-runtime-stabilization-reconciliation`.
- **Local SHA Verification**: Commit `3cf20858f2eaa0acc1a2f9aeb11f4bcacdfd6536` verified locally (`git cat-file -t` confirms commit object).
- **Single Pull Request Constraint**: Exactly one PR opened against current protected main; no auto-merge; no force-push.

---

## 2. Three-Way Reconciliation Architecture

### A. Preserved Canonical Property Architecture (PR #1347 Restored)
1. **Single Write Authority (`functions/propertyIdentity.ts`)**:
   - `PROPERTY_IDENTITY_V1` deterministic SHA-256 hash generator.
   - Normalizes across four distinct identity layers:
     - `TITLE_DEED`: Normalized title deed or DLD reference.
     - `PLACE_UNIT`: Google Place ID bound with normalized unit token.
     - `ADDRESS_UNIT`: Standardized emirate/area/address with unit token.
     - `GEO_UNIT`: Truncated coordinates (5 decimal precision) with unit or property type.
   - Rejects competing standalone duplication modules (`propertyDuplicateDetection.ts`); maintains exactly ONE canonical transactional write authority in `functions/canonicalOwnerSubmission.ts`.
2. **Transactional Identity Claims**:
   - Reserves claims in `property_identity_registry` inside a Firestore transaction prior to downstream entity creation.
   - Atomically releases claims if downstream intake pipeline fails.
3. **Canonical Geo Authority (`functions/propertyGeoAuthority.ts`)**:
   - `verificationVersion=1`: Legacy compatibility for Founder MFA review.
   - `verificationVersion=2`: Canonical physical inspection evidence (`PHYSICAL_INSPECTION_EVIDENCE_V2`), requiring immutable visit photos/PDF, SHA-256 evidence hash, Storage generation, checklist, and GPS within authorized radius.
4. **Activation Gate (`functions/securePaymentApproval.ts`)**:
   - Enforces `hasDispatchReadyPropertyGeo(property)` before owner activation can proceed.

### B. Resolved Contradictions on Current Main
1. **`functions/adminPropertyReview.ts`**:
   - Removed `"draft"` from `REVIEWABLE_STATUSES`.
   - Prevented legacy approval path from operating on inspection-first properties (`OWNER_FIVE_PAGE_INSPECTION_FIRST_V1`).
   - Kept wrapped behind `functions/canonicalAdminPropertyReview.ts` fail-closed callable.
2. **`functions/clientTelemetry.ts` (`checkPropertyUniqueness`)**:
   - Documented and restricted to an **advisory legacy pre-check** (`active_contracts` and `onboarding_leads`).
   - Does not act as an authoritative gate; authoritative duplicate protection is strictly `property_identity_registry`.

### C. Invariant Preservation (PRs #1354, #1355, #1356)
- **Play Integrity & App Check**: `FirebaseAppCheckBridgePlugin.java` and `verify-android-play-integrity-appcheck.mjs` preserved with legitimate Play signing identities.
- **Android Version Progression**: `versionCode 11`, `versionName 1.0.11` preserved in `android/app/build.gradle`.
- **Diagnostic Workflows**: Safe read-only technician diagnostic endpoint (`technician-runtime-diagnostic.yml`) and UI (`TechnicianInstallationRegistration.tsx`) preserved without regression.

---

## 3. Status Lifecycle Normalization Contract

- **Authoritative Backend Format**: UPPERCASE underscore-delimited strings for all lifecycle-critical server state:
  - `SUBMITTED_FOR_PROPERTY_INSPECTION` (intake status)
  - `PENDING_PROPERTY_INSPECTION` (property status)
  - `READY_FOR_SITE_VISIT` / `READY_FOR_SITE_VISITS` (inspection status)
  - `AWAITING_15_PERCENT_PAYMENT` (quote status / nextState)
  - `ACTIVE` (activated status)
- **Read Normalization**: UI components read both uppercase canonical and legacy lowercase strings (`pending`, `submitted`) through normalization helpers.
- **Write Normalization**: All new writes strictly output canonical uppercase strings. No lowercase aliases are written by canonical producers.

---

## 4. Public Web & Legal Compliance

- **Marketing Truth (`src/pages/public/PublicMarketingPage.tsx`)**:
  - Reconciled both English and Arabic copy to accurately describe the 5-step inspection-first lifecycle (Application -> In-Person Inspection -> Verified Final Quote -> 15% Mobilization -> Dashboard Unlock).
  - Eliminates false promises of instant admin dashboard unlock without physical inspection.
- **Legal Entity Review (`docs/PROPOSED_LEGAL_ENTITY_CHANGES.md`)**:
  - `PRIVACY_POLICY.md` and `TERMS_OF_SERVICE.md` maintained with current baseline facts.
  - Proposed changes isolated and marked `REQUIRES HUMAN LEGAL/FOUNDER CONFIRMATION`.

---

## 5. Verification Matrix & Remaining External Blockers

### Local Automated Test Matrix
1. `npm run typecheck`: TypeScript compilation across frontend and functions.
2. `npm run lint`: ESLint verification across entire monorepo.
3. `npm run build`: Production Vite bundle build.
4. `npm run build:admin`: Production build for `apps/admin-panel`.
5. `npm run build:owner`: Production build for `apps/owner-app`.
6. `npm run build:functions`: TypeScript compilation of Cloud Functions.
7. `npm run test:stability`: Production stability guard and architectural invariants.
8. `npm run test:launch-honesty`: Launch honesty and deployment verifiers.
9. Launch and authority test suites in `tests/launch/`.

### Remaining External & Operational Blockers (Before Hard Launch)
- [ ] Founder physical signature on commercial license documents.
- [ ] Official Google Play Production track submission approval for versionCode 11.
- [ ] Apple App Store review completion for iOS bundle `ae.bingroups.superapp`.
- [ ] Human legal counsel verification of `PROPOSED_LEGAL_ENTITY_CHANGES.md`.
- [ ] Real-device physical inspection dry run with field technician in Dubai.
