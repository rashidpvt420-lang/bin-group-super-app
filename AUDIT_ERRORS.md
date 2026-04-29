# AUDIT ERRORS & FINDINGS - BIN GROUP Super App

## 1. Environment & Infrastructure
- [CRITICAL] Google Maps API Key missing in `apps/owner-app/.env`. Set to `YOUR_PRODUCTION_API_KEY_HERE`.
- [CRITICAL] Google Maps placeholder `%REACT_APP_GOOGLE_MAPS_API_KEY%` in `public/index.html` might not be correctly replaced.
- [WARNING] Node version mismatch (Project requires Node 22, current is Node 24).
- [BUG] Root `package.json` missing `lint` script, causing `npm run lint` to fail at root level.
- [BUG] `onboardingStore.ts` `calculateSummary` function initializes `estimatedACV` to 0 and never updates it based on property metrics.

## 2. Localization & RTL
- [BUG] Language switcher missing from public marketing navigation (`MarketingNav` component in `PublicMarketingPage.tsx` and static shell in `index.html`).
- [BUG] Public landing page (`/`) content is hardcoded in English in `HomeHero` and `SectorHero` components.
- [BUG] PDF Contract generation (`pdfEngine.ts`) lacks Arabic/RTL support.

## 3. Security & Data Integrity
- [WARNING] Firestore rules are too permissive: `properties` and `maintenanceTickets` collections allow read access to all authenticated users.
- [BUG] `PropertyPassportPage.tsx` missing critical fields: floors, lifts, offices, shops, parking, age, active tenants, documents, compliance status, quote history, contract history.
- [BUG] Add-ons in `AddOnsStep.tsx` are limited and do not cover all requested categories (manpower, concierge, pest control, etc.).

## 4. Admin & Scalability
- [BUG] `BulkImporter.tsx` only handles properties (buildings). Does not support bulk importing of floors, units, or tenants.
- [BUG] No streamlined UI for managing large-scale assets (e.g., a tower with 53+ units and tenants).

## 5. UI/UX Defects
- [BUG] Logo image in `SovereignHeader.tsx` and `MarketingNav` has an `onError` handler that hides it if not found, but doesn't provide a fallback.
- [BUG] `PropertyLocationStep.tsx` uses a 8-second timeout for Google Maps which might be too long or too short depending on network, and doesn't handle the failure gracefully beyond manual entry.

## 6. Build & Compilation Warnings
- [INFO] `admin-panel` build has several "unused variable" warnings in pages like `DesignStudioAdminPage`, `HRManagementPage`, and `ProfitabilityDashboardPage`.
- [INFO] `owner-app` build succeeded but bundle size is large (748 kB).
