# BIN Group Super App — Full Audit & Launch-Readiness Report

**Date:** 2026-07-01
**Scope:** Investigation & reporting only. No code, config, or dependencies were changed by this audit.
**Auditor environment:** Replit sandbox, Node v20.20.0, npm 10.8.2.
**Repo state audited:** working tree at time of writing (root Vite app + `apps/admin-panel` + `apps/owner-app` + `functions/` + `android/`/`ios/`).

> This report is the accurate, current picture of what works, what is stubbed/mocked, and what is broken — the basis for follow-up fix/launch tasks. It changes nothing in the app.

---

## 1. Executive summary (plain language)

The BIN Group Super App is **substantially built and, for the core web experience, in good shape**. The root web app compiles cleanly, type-checks with zero errors, lints clean, and produces a production build. The five portals are mostly wired to real Firebase data — this is not a hollow prototype. The remaining work before launch is concentrated in **a few mocked/stubbed screens, some backend rules/config gaps, and mobile release plumbing (signing + Capacitor sync) that has never been completed.**

### Per-portal status at a glance

| Portal | Status | One-line summary |
|---|---|---|
| **Admin** (`apps/admin-panel`) | 🟡 Working (source audit; build unverified) | Real dashboards, unit control, compliance, AI engineer. Two mock/stub screens + a couple of mislabeled nav links. **Its build could not be run in this sandbox — verify in CI** (see §2). |
| **Owner** (`src/owner`) | 🟢 Working (2 weak screens) | Onboarding, contracts, financials, tickets, approvals all real. P&L report is mock; Inspections queue is a stub. |
| **Tenant** (`src/tenant`) | 🟢 Working | Full maintenance lifecycle, visitor parking, AI concierge, payments — all real. Only amenity/marketplace *categories* are hardcoded. |
| **Technician** (`src/technician`) | 🟢 Working | Job lifecycle, offline sync, HR flows all real. One hardcoded pay-rate fallback. |
| **Broker** (`src/broker`) | 🟢 Working | Leads, referrals, commissions, attribution all real. No broken links found. |
| **Backend** (`functions/`, rules, indexes) | 🟡 Mostly ready | ~112 functions build clean. One confirmed Firestore-rules gap; a few index/storage items to verify. |
| **Mobile** (Android/iOS) | 🔴 Not release-ready | Identifiers/icons/permissions all correct, **but release signing is unconfigured and `npx cap sync` has never been run.** |
| **Docs** | 🟡 Partly stale | Several root docs contradict the code (e.g. "React Native/Expo" — the app is React web + Capacitor). |

**Bottom line:**
- **Public web launch** is achievable after a short list of blockers (auth authorized-domains, App Check decision, backend rules gap, and confirming production env keys). The app already builds and runs.
- **Play Store / App Store submission** is **not** currently possible without completing mobile release plumbing (build → `cap sync` → signing) — this is the single largest gap.

---

## 2. Build & run health check (Step 1)

The commands below were executed in the Replit sandbox on 2026-07-01 — **except** the rows explicitly marked **NOT VERIFIED** / **SKIPPED**, which were not run (reasons in the Notes column). Node is **v20.20.0**, but `package.json` declares `engines.node: "22"` → every `npm` invocation prints `EBADENGINE` warnings (non-fatal, but a mismatch to resolve).

| Target | Command | Result | Notes |
|---|---|---|---|
| Root app — typecheck | `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`) | ✅ **PASS** — 0 errors | Covers `src/` only. |
| Root app — production build | `npm run build` (`vite build`) | ✅ **PASS** — built in ~1m1s, `dist/` = 4.2 MB | Largest chunk `index-*.js` = **1.3 MB** (see perf note below). |
| Root app — lint | `npm run lint` (`eslint src`) | ✅ **PASS** — clean (exit 0) | Root `lint-errors.txt` / `lint_results.txt` in repo are **stale artifacts**, not current. |
| Firebase Functions — build | `npm run build:functions` (`tsc`) | ✅ **PASS** — 0 errors | ~112 exported functions compile. |
| Mobile readiness script | `npm run test:mobile-store-readiness` | ✅ **PASS** | Repo's own static check (does not cover signing / cap-sync). |
| Root app — runtime | workflow `Start application` (`vite`) on port 5000 | ✅ **Runs** | See runtime console findings below. |
| **Admin panel — build** | `npm run build:admin` | ⚠️ **NOT VERIFIED HERE** | `apps/admin-panel/node_modules` is absent; a clean `npm install` exceeded the sandbox's 2-min command limit. Build health should be verified in CI. Its source is analyzed functionally in §4. |
| **Owner-app — build** | `npm run build:owner` | ⏭️ **SKIPPED** | `apps/owner-app` is confirmed **dead/legacy** (see §5). Not part of any live deployment. |

### Install-time warning (dependencies)
`npm install` reports **15 vulnerabilities (1 low, 12 moderate, 2 high)**. *(A separate task, "Fix security CVEs", is already addressing dependency vulnerabilities — noted here only for completeness; not fixed by this audit.)*

### Runtime console findings (root app, live)
The running app is healthy. Console shows only:
- **React Router v7 future-flag warnings** (`v7_startTransition`, `v7_relativeSplatPath`) — cosmetic, non-blocking.
- **`auth/requests-from-referer-<replit-dev-domain>-are-blocked`** during an owner-registration attempt → cascading **`functions/internal`** "Account Creation Error". **This is a config issue, not a code bug:** the Replit dev domain is not in Firebase Auth's *Authorized domains*. Production (`bin-group-57c60.web.app` / custom domain) must be authorized, and any preview domain used for testing must be added. This is a **launch checklist item**, not a defect.

### Performance note
The main JS bundle is **1.3 MB** (`dist/assets/index-*.js`). Not a launch blocker, but a first-load performance concern worth code-splitting later. Hosting sends `Cache-Control: no-store` on everything (`firebase.json`), which is intentional for freshness but eliminates browser caching — revisit for production performance.

---

## 3. Architecture & repository map (ground truth)

- **Root Vite app (`src/`)** — the **live public web app**. Hosting target `app` → site `bin-group-57c60`. Contains the **Tenant, Technician, Broker, and Owner** portals plus landing/onboarding/shared pages. Mounted via `src/App.tsx` (65 `<Route>`s).
- **`apps/admin-panel`** — a **separate live app** (its own Vite/React project). Hosting target `admin` → site `bin-group-admin-panel`. 54 routes.
- **`apps/owner-app`** — **DEAD / legacy**. Not built, not deployed; `src/App.tsx` even runs a one-time cleanup of its legacy data. Superseded by `src/owner`.
- **`packages/shared`** — shared code (`@bin/shared`), incl. UAE pricing engine/benchmarks.
- **`functions/`** — Firebase Cloud Functions (~112 exports across `index.ts` + ~30 modules). Region **`europe-west3`**.
- **`android/` + `ios/`** — Capacitor native wrappers (appId `ae.bingroups.superapp`).
- **Firebase project:** default `bin-group-57c60`, staging `studio-5724711541-8a962` (`.firebaserc`).

**Sub-router route counts:** App.tsx 65 · Owner 33 · Tenant 28 · Technician 17 · Broker 11 · Admin 54.

---

## 4. Feature-by-feature functional audit (Steps 2 & 3)

Classification legend: **FUNCTIONAL** = reads/writes real Firestore/Functions · **MOCK** = hardcoded/sample data · **STUB** = UI only / thin logic / placeholder · **BROKEN** = nav link to missing route or reference to missing code.

### 4.1 Admin portal — `apps/admin-panel`  🟢
| Flow | Status | Reference |
|---|---|---|
| Dashboard KPIs (properties/units/tenants/missions, SLA queue, approvals) | FUNCTIONAL | `src/pages/dashboard/DashboardPage.tsx` |
| Unit Status Control | FUNCTIONAL — calls CF `updateUnitOpsState` | `src/pages/admin/UnitStatusPage.tsx` |
| Revenue / Profitability intelligence | FUNCTIONAL | `src/pages/admin/ProfitabilityPage.tsx` |
| BIN-GPT Engineer (governed AI code studio) | FUNCTIONAL — writes `binGptEngineerCommands` | `src/pages/admin/BinGptEngineerPage.tsx` |
| Compliance export | FUNCTIONAL — calls CF `exportComplianceReport` | `src/pages/admin/CompliancePage.tsx` |
| **Pricing Matrix 2026** | **MOCK** — static benchmarks from `@bin/shared` | `src/pages/admin/PricingMatrixPage.tsx` |
| **Production Control Center — system health** | **STUB** — health shown as hardcoded `'operational'` strings | `src/pages/ProductionControlCenter.tsx` |

**Nav issues** (`src/components/Navigation.tsx` vs `src/App.tsx`):
- "Institutional Audit" points to `/vault`, but `/vault` maps to `IntakeVaultPage`; the real document vault is `/document-vault` → **mislabeled/misrouted link**.
- `/hr` is **defined twice** in `App.tsx` (`HRManagementPage` and `StaffAccessPage`); the second wins.

**Dead code:** `src/layout/AdminLayout.tsx` (unused, references outdated routes), `src/pages/dashboard/DashboardPageStable.tsx` (recovery placeholder), and root `src/admin/AdminTerminal.tsx` (not referenced by the admin app).

### 4.2 Owner portal — `src/owner` (LIVE)  🟢
Core is FUNCTIONAL: `/owner/dashboard`, `/owner/properties`, `/owner/property-passport/:id`, `/owner/contracts` (CF `ownerSignContract`), `/owner/financials`, `/owner/tickets`, `/owner/ticket/:id` (CF `ownerReviewTicketCompletion`), `/owner/complaint`, `/owner/ai-intelligence`, `/owner/approvals` (CF `submitOwnerApprovalDecision`), `/owner/damage-estimate` (CF `assessDamage`), `/owner/units` (CF `ownerGenerateUnits`).

| Weak spot | Status | Reference |
|---|---|---|
| **P&L Report** (`/owner/p-l-report`) | **MOCK** — static months / empty-state scaffolding | `src/owner/pages/OwnerPLReportPage.tsx` |
| **Inspections / Review Queue** (`/owner/inspections`) | **STUB** — thin logic vs other flows | `src/owner/pages/OwnerReviewQueuePage.tsx` |
| `/legacy-units` (`OwnerUnitsPage`) | **DUPLICATE** of `/units` | `src/owner/OwnerApp.tsx` |

No broken nav links found in the live owner nav.

### 4.3 Tenant portal — `src/tenant`  🟢
FUNCTIONAL: maintenance lifecycle (`TenantRequestPage`, `TenantTicketDetailPage` — real reads/writes + completion approval), visitor parking full CRUD (`TenantVisitorParkingPage` → `visitorParkingRequests`), AI concierge (`TenantAIConciergePage` — `addDoc` + Storage upload), payments ledger, documents.

| Mock spot | Status | Reference |
|---|---|---|
| Amenities categories | **MOCK** list, but **real** bookings to `amenityBookings` | `src/tenant/pages/TenantAmenitiesPage.tsx` |
| Marketplace categories | **MOCK** categories, **real** providers from Firestore | `src/tenant/pages/TenantMarketplacePage.tsx` |

No broken nav links.

### 4.4 Technician portal — `src/technician`  🟢
FUNCTIONAL: job lifecycle (CFs `acceptTechnicianTicket`, `updateTicketLifecycle`), robust offline queue with replay (`TechnicianOfflinePage` via `localStorage`), HR flows (`staffRequests`, `hrAiConversations`, `staffMoodCheckins`).

| Mock spot | Status | Reference |
|---|---|---|
| Earnings pay-rate | **MOCK fallback** `RATE_AED = 150` when `technicianEarning` missing on the ticket | `src/technician/pages/TechnicianEarningsPage.tsx` |

No broken nav links.

### 4.5 Broker portal — `src/broker`  🟢
FUNCTIONAL: leads (`BrokerLeadsPage`), referrals (`BrokerReferralsPage`), commissions/payouts (CF `submitBrokerPayoutRequest`), attribution proof joining `brokerLeads`/`referrals`/`broker_commissions` (`BrokerAttributionProofPage`). No broken nav links.

### 4.6 Backend — Cloud Functions, rules, indexes, storage

**Cloud Functions (~112 exports, region `europe-west3`)** build clean. Grouped: maintenance/tickets, onboarding/contracting, technician ops, payments (Stripe), HR/admin, AI/guidance, and scheduled/trigger jobs.

**⚠️ Important correction to earlier internal notes — "missing callables" are NOT a live blocker.**
An initial scan flagged frontend calls to functions that "don't exist." On verification, **every function called by a *live, routed* screen exists.** The apparent mismatches are only in **unrouted legacy pages** under `src/pages/` that are not mounted in any router:
- `src/pages/TicketDetailPage.tsx` calls `startTechnicianWork` / `pauseWork` / `finishWork`; the real functions are `pauseTechnicianWork` / `finishTechnicianWork` (`functions/index.ts:2983,3012`). This page is **dead** (not routed).
- `src/pages/TechnicianPortalPage.tsx` (dead) references `startTechnicianDuty` / `endTechnicianDuty` — which **do** exist.
- `DesignStudioPage` (the live one) is fine; the `generateAIDesignConceptImages` vs `generateDesignConcept` naming difference is again only in stale references.
→ **Action = dead-code cleanup**, not a runtime fix. (Live: `assessDamage`, `ownerSignContract`, `createOwnerPaymentTransaction`, etc. all exist.)

**Firestore rules gaps** (`firestore.rules`; catch-all `match /{document=**}` = admin-only at line 1172):
- 🔴 **`security_audit_logs` has NO match block** → falls through to the admin-only catch-all, so **non-admin writes fail** with permission-denied. Writers include `src/utils/PublicSecurityRegistry.ts` (also `apps/admin-panel/.../PublicLaunchOpsPanel.tsx`). **Verify whether any non-admin/anonymous path writes this collection at runtime**; if so, it needs an explicit rule. *(Confirmed absent via search; this is the one concrete rules gap.)*
- 🟡 `pricingAuditLogs` (rule at line 927) is admin/finance-scoped; the **dead** `apps/owner-app` tries to write it — moot while owner-app is unused, but confirm no live pricing writer needs it.
- 🟡 `binConnectThreads` rules require the user already be in `participantIds` — confirm thread *creation* by a first participant is allowed.

**Firestore indexes** (`firestore.indexes.json`): composite indexes exist for `brokerLeads` (brokerId+createdAt) and `referrals` (brokerId). 🟡 If the UI ever filters these by another field (e.g. `status`, `propertyId`) **and** orders by `createdAt`, those queries will fail until matching composite indexes are added. Verify against actual query shapes before launch.

**Storage rules** (`storage.rules`, catch-all admin-only): explicit blocks exist for `maintenanceTickets`, `inspections`, `design_requests`, `onboarding-proof`, `kyc_documents`, `payment-references/owners/`, `evidence/`. 🟡 Any owner/tenant Storage path **not** explicitly listed will hit the admin-only catch-all and fail — spot-check any new upload paths.

**Firebase deploy state:** rules/indexes/functions exist in-repo with a hardening pipeline (`npm run prepare:rules` → normalize/harden scripts; `npm run test:rules` runs the emulator). **Whether the current rules/indexes are actually deployed to `bin-group-57c60` cannot be verified from this sandbox** (no deploy credentials) — confirm via `firebase deploy`/console before launch.

---

## 5. Consolidated markers & dead code (Step 2)

Searched across `*.ts/tsx/js/jsx` (excluding `node_modules`/`dist`/`build`):
- **946 `TODO`/`FIXME`/`PENDING`/`HACK`/`XXX` occurrences across 206 files.** Heaviest: `apps/admin-panel/src` (247), `functions/` (172), `src/owner/pages` (126), `src/owner/components` (98), `apps/owner-app/src` (94 — dead), `src/pages` (70).
- **171 "coming soon / not implemented / placeholder / stub / WIP" occurrences across 91 files.**

**Confirmed dead/legacy code to prune (not fixed here):**
- `apps/owner-app/**` (entire legacy app).
- Root `src/pages/TicketDetailPage.tsx`, `src/pages/TechnicianPortalPage.tsx` (unrouted; source of the false "missing function" alarms).
- Admin: `layout/AdminLayout.tsx`, `pages/dashboard/DashboardPageStable.tsx`; root `src/admin/AdminTerminal.tsx`.
- Duplicate route `/legacy-units` in owner.

**Stale documentation (flagged, not corrected — per scope):**
- `FRONTEND_ARCHITECTURE.md:3` states *"All mobile applications are built using **React Native (Expo)**"* — **false**; the app is **React web + Capacitor**. This is the single most misleading doc.
- Root contains many overlapping status docs (`FULL_APP_AUDIT_REPORT.md`, `AUDIT_ERRORS.md`, `BUILD_SUMMARY.md`, `COMPLETION_REPORT.md`, `NEXT_ERRORS_TO_SEND_TO_CHATGPT.md`, `build-errors.txt`, `lint-errors.txt`, `lint_results.txt`) that predate the current clean build/lint/typecheck state and should be treated as **historical**, not current.

---

## 6. Configuration, environment & secrets

**Firebase client config** (`src/lib/firebase.ts`) reads `VITE_*` env vars with **committed public fallbacks** (e.g. a fallback `apiKey`, `authDomain`, `projectId`). Firebase web keys are public client config (not service-account secrets), so this is acceptable — but production values should still be set via env, and **Firebase App Check is disabled by default** (`VITE_ENABLE_FIREBASE_APPCHECK=false`), which `.env.example` notes is **required for public launch**.

**Frontend env vars** (`.env.example`): `VITE_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,STORAGE_BUCKET,MESSAGING_SENDER_ID,APP_ID}`, `VITE_APP_CHECK_SITE_KEY`, `VITE_ENABLE_FIREBASE_APPCHECK`, `VITE_FIREBASE_VAPID_KEY` (web/mobile push), `VITE_GOOGLE_MAPS_API_KEY` (maps + technician GPS), `VITE_API_URL`.

**Backend secrets** (Firebase Secrets Manager, per `.env.example`): `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `SMTP_PASSWORD`, `GEMINI_API_KEY`. Presence in the live project was **not** inspected by this audit (no secret values read) — verify all are set before launch.

---

## 7. Mobile store-readiness audit (Step 4)

| Area | Status | Detail |
|---|---|---|
| App identifiers | ✅ Consistent | `capacitor.config.ts` appId `ae.bingroups.superapp` == Android `applicationId`+`namespace` (`android/app/build.gradle`) == iOS `PRODUCT_BUNDLE_IDENTIFIER` (`project.pbxproj`). |
| Versioning | ✅ Present (initial) | Android `versionCode 1` / `versionName "1.0"`; iOS `MARKETING_VERSION 1.0` / `CURRENT_PROJECT_VERSION 1`. |
| Icons & splash | ✅ Present & custom | Android mipmaps + `splash.png`; iOS `AppIcon` 1024×1024 + `Splash.imageset`. |
| Permissions declared | ✅ Aligned with plugins | Android: `CAMERA`, `ACCESS_FINE/COARSE_LOCATION`, `POST_NOTIFICATIONS`, `READ_MEDIA_IMAGES`, storage. iOS Info.plist usage strings: camera, location-when-in-use, microphone, photo library (add/read). Matches installed Capacitor plugins (camera, geolocation, push, filesystem). |
| Privacy policy / terms | ✅ Available | `PRIVACY_POLICY.md` + `TERMS_OF_SERVICE.md` at root; built site emits `privacy-policy.html` + `terms-of-service.html` (usable as store listing URLs). |
| **Android release signing** | 🔴 **MISSING** | `build.gradle` references `keystore.properties`, but **neither `android/keystore.properties` nor a `.keystore`/`.jks` exists** → cannot produce a signed release AAB/APK. |
| **iOS signing** | 🔴 **INCOMPLETE** | Automatic provisioning, but **no `DevelopmentTeam` set** → needs an Apple Developer team + provisioning profile in Xcode/CI. |
| **Capacitor sync** | 🔴 **NEVER RUN** | `android/app/src/main/assets/public` does not exist; native platforms contain **no web assets**. Must run `npm run build` then `npx cap sync` (and `pod install` for iOS) before any device/store build. |

**Also required for store submission (not code, but launch tasks):** Play Data-Safety form + App Store privacy nutrition labels, store screenshots for required device sizes, feature graphic (Play), age rating, and a hosted privacy-policy **URL**. None of these are blocked by code; they are submission deliverables.

---

## 8. Prioritized blockers vs nice-to-haves

### (A) Public **web** launch
**Blockers (must do):**
1. **Firebase Auth authorized domains** — add the production domain (and any preview/testing domains) or auth is blocked (`auth/requests-from-referer-…-are-blocked`, which currently cascades into onboarding `functions/internal`).
2. **Confirm production env keys are set** — `VITE_GOOGLE_MAPS_API_KEY` (maps/GPS), `VITE_FIREBASE_VAPID_KEY` (push), Firebase web config, and backend secrets (`STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `SMTP_PASSWORD`).
3. **Decide/enable Firebase App Check** — `.env.example` marks it required for public launch; currently `false`.
4. **Resolve the `security_audit_logs` rules gap** — add an explicit rule if any non-admin path writes it, else confirm it is admin-only in practice.
5. **Verify rules/indexes are actually deployed** to `bin-group-57c60` (cannot be confirmed from the sandbox).

**Nice-to-haves (post-launch):**
- Replace mock/stub screens with live data: Admin Pricing Matrix, Admin Production-Control health, Owner P&L, Owner Inspections queue.
- Code-split the 1.3 MB main bundle; reconsider `no-store` caching for static assets.
- Align Node runtime with `engines` (20 vs 22).
- Verify the Admin panel builds in CI (not verifiable in this sandbox).
- Prune dead code and stale docs (§5); fix admin nav mislabel + duplicate `/hr`.

### (B) Play Store / App Store submission
**Blockers (must do, in order):**
1. **Complete Capacitor sync** — `npm run build` → `npx cap sync` (+ iOS `pod install`). Native shells currently have no web assets.
2. **Android release signing** — create the keystore + `android/keystore.properties` (store securely; not in git).
3. **iOS signing** — set Apple Developer `DevelopmentTeam` + provisioning profile.
4. **Store listing assets** — screenshots (all required sizes), feature graphic, hosted privacy-policy URL, Data-Safety / privacy labels, age rating.
5. Everything in (A) — the mobile app depends on the same backend/auth/env.

**Nice-to-haves:**
- Bump versioning strategy for iterative submissions.
- Add store metadata/release notes automation.

---

## 9. Audit coverage & limitations
- **Verified by execution:** root typecheck, root build, functions build, lint, mobile-readiness script, and live runtime console (all §2).
- **Verified by targeted search/read:** function existence cross-check, `security_audit_logs` rule absence, identifiers/permissions/assets, dead-page routing, doc mismatch.
- **Analyzed via read-only exploration** (structured subagent passes over each portal): the per-flow FUNCTIONAL/MOCK/STUB classifications in §4. File references are cited; line numbers were accurate at audit time and may drift.
- **Not verifiable in this sandbox:** `apps/admin-panel` build (install exceeded the time limit), live Firebase deploy state, live secret values, and on-device mobile behavior.
- **Unchanged by this audit:** no code, config, dependencies, or docs were modified. `node_modules` created during build attempts are git-ignored; the admin lockfile was backed up and restored to its committed state.

---

## Appendix A — Consolidated marker inventory

Reproduce the full list at any time with:

```bash
rg -i -c "TODO|FIXME|PENDING|HACK|XXX" \
  -g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' \
  -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/build/**' \
  | sort -t: -k2 -rn
# 'coming soon / not implemented / placeholder / stub / WIP':
rg -i -c "coming soon|not implemented|placeholder|\bstub\b|under construction|\bwip\b" \
  -g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' \
  -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/build/**'
```

**Totals:** 946 `TODO`/`FIXME`/`PENDING`/`HACK`/`XXX` across 206 files; 171 "coming soon / not implemented / placeholder / stub / WIP" across 91 files.

**Top 25 files by marker density** (file : count):

| Count | File |
|---|---|
| 49 | `functions/index.ts` |
| 43 | `apps/admin-panel/src/pages/dashboard/DashboardPage.tsx` |
| 41 | `src/owner/pages/OwnerDashboardResolvedPage.tsx` |
| 31 | `functions/ownerRegistrationRequest.ts` |
| 27 | `apps/admin-panel/src/pages/smoke-test/SmokeTestPage.tsx` |
| 21 | `test/security-rules.test.js` |
| 21 | `functions/adminOwnerOperations.ts` |
| 19 | `apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx` |
| 18 | `src/owner/utils/ownerAssetTemplates.ts` |
| 15 | `src/pages/BrokerPortalPage.tsx` *(root `src/pages` = mostly legacy/dead)* |
| 15 | `apps/owner-app/src/pages/BrokerPortalPage.tsx` *(dead app)* |
| 13 | `src/pages/DesignRequestDetailPage.tsx` |
| 13 | `src/context/LanguageContext.tsx` |
| 12 | `src/pages/DesignStudioPage.tsx` |
| 12 | `src/owner/components/OwnerExecutiveDashboardSection.tsx` |
| 11 | `src/technician/pages/TechnicianHRPage.tsx` |
| 11 | `src/owner/pages/OwnerActivationPage.tsx` |
| 11 | `src/owner/components/OwnerMoneyRiskDashboardSection.tsx` |
| 11 | `packages/shared/src/context/LanguageContext.tsx` |
| 10 | `src/owner/components/OwnerContractModeMatrix.tsx` |
| 10 | `apps/admin-panel/src/pages/owners/OwnerManagementPage.tsx` |
| 9 | `src/utils/aiDesignStudioWorkflow.ts` |
| 9 | `apps/admin-panel/src/pages/brokers/BrokerCommissionHubPage.tsx` |
| 8 | `src/technician/pages/TechnicianDashboardPage.tsx` |
| 8 | `src/owner/components/OwnerRentHandoverControlCenter.tsx` |

> Note: raw marker counts include many low-severity inline notes; the **actionable** mock/stub/placeholder items are the ones itemized per portal in §4. This appendix gives the full-inventory entry point without bloating the report with all 946 lines.

*End of report.*
