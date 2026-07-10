# BIN GROUP Super App — Launch-Readiness Audit

_Audit performed on branch `cursor/launch-readiness-audit-a1f7`. Scope: the main Vite/React app in `src/` (all five role portals + onboarding), the Firebase layer (`functions/`, `firestore.rules`), and the repo's own launch-gate scripts._

This document is a factual audit of what works, what is broken/missing, and what remains before a full public launch. A first batch of concrete, low-risk bugs has already been fixed in this PR (see **Fixes applied**). The remaining items are grouped by severity with file references so they can be picked up incrementally.

---

## 1. Executive summary

- The app **builds, lints, typechecks, and passes** its Firestore-rules test suite (41/41) and public smoke E2E (10/10). It boots and connects to the live Firebase project.
- The repo ships **attestation-style launch gates** (`test:launch-clearance`, `test:hard-launch-readiness`) that report "GO" by reading config, **not** by exercising the product. Do not treat a green gate as proof a flow works end-to-end.
- The biggest launch blockers are **external provider activation** (Google Maps, App Check, FCM/VAPID push, Stripe live keys, WhatsApp/SMS) — these require account/billing/verification the codebase cannot self-provision (see §5).
- There is **code duplication risk**: a second onboarding fork lives in `apps/owner-app/` with a *different* step count and payment path than the canonical `src/` flow (see §4).

---

## 2. Fixes applied in this PR

| Fix | File | Why it mattered |
|-----|------|-----------------|
| Repo-hygiene guard false positive resolved | `scripts/normalize-firestore-rules.mjs` | The maintenance script embedded literal git conflict-marker lines inside string literals, so `npm run test:repo-hygiene` **failed** (5 false "unresolved merge conflict marker" violations). Marker tokens are now built at runtime; behavior is unchanged and the gate passes. |
| Onboarding success screen rendered literal quotes | `src/components/onboarding/PaymentSubmissionStep.tsx` | The final onboarding confirmation showed the raw text `'Payment Submitted Successfully'` (with surrounding quotes) instead of a proper i18n string. Now uses `t()` with a clean fallback. |
| Owner "open property" button was a dead link | `src/owner/pages/OwnerPropertiesPage.tsx` | The property card arrow navigated to `/owner/properties/:id`, which has **no route** in `OwnerApp.tsx`, leaving a blank pane. Now routes to the existing Property Passport detail/overview. |
| Tenant AI Concierge was built but unreachable | `src/tenant/TenantApp.tsx`, `src/tenant/pages/TenantSimpleDashboardPage.tsx`, `src/tenant/pages/TenantDashboardPage.tsx` | Added the `/tenant/ai-concierge` route plus discoverable entry points on both tenant dashboards. The page is a fully-functional, **provider-independent** guided ticket assistant (local rule-based classification, writes to `maintenanceTickets`), so no AI key is required. |

All fixes are verified by `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:repo-hygiene`.

---

## 3. Dashboard-by-dashboard findings

Portals mount under protected wildcard routes in `src/App.tsx`; post-login defaults live in `src/components/ProtectedRoute.tsx`.

### Owner (`src/owner/`)
- **High:** Contractor marketplace shows a permanent "coming soon" empty state when `contractorProfiles` is empty — `ContractorMarketplacePage.tsx:412`.
- **High (fixed):** Property card dead link `/owner/properties/:id` — `OwnerPropertiesPage.tsx:102`.
- **Medium:** `monthlyCostVariancePct` is initialized to `null` and **never computed**, yet displayed on the simple dashboard — `useOwnerCommandCounts.ts:11,26`, shown in `OwnerSimpleDashboardPage.tsx:29`.
- **Medium:** Orphan/unrouted pages exist: `OwnerStatementsPage.tsx`, `OwnerApprovalsPage.tsx` (blueprint placeholders), and a richer `OwnerInspectionsPage.tsx` that is superseded by the routed `OwnerReviewQueuePage`.
- **Low:** Numerous `alert()` calls used for validation/errors (functional, unpolished) — e.g. `OwnerComplaintPage.tsx:112,182`.

### Tenant (`src/tenant/`)
- **Resolved in this PR:** `TenantAIConciergePage` was fully implemented but had **no route** in `TenantApp.tsx`. It's now routed at `/tenant/ai-concierge` with entry points on both dashboards. (It uses local rule-based classification, not an AI provider, so it works without any external key.)
- **Low:** Simple-dashboard issue shortcuts are a static array, not Firestore-driven — `TenantSimpleDashboardPage.tsx:9-14`.
- **Low:** Widespread `alert()` usage for errors across request/chat/gate-pass/amenities pages.

### Technician (`src/technician/`)
- **Medium:** Simple-dashboard proof checklist renders **static default props**, not live job data — `TechnicianSimpleDashboardPage.tsx:23` + `TechnicianProofChecklist.tsx:17-27`.
- **Expected:** Map degrades gracefully to directions-only links without `VITE_GOOGLE_MAPS_API_KEY` — `TechnicianMapPage.tsx:4-5,30-34`.
- **Low:** Orphan v1 page `TechnicianHRPage.tsx` (route uses `TechnicianHRPageV2`).

### Broker (`src/broker/`)
- Cleanest portal. Live Firestore listeners for leads/referrals/commissions; no stubs or `alert()`/mock data.
- **Cosmetic:** header icon uses a `Paintbrush` glyph but navigates to referrals — `BrokerApp.tsx:58-59`.

### Admin (`src/admin/`)
- **Architectural gap (High for full admin ops):** `/admin/*` renders a single `AdminTerminal` metrics/runbook page with **no sub-routes**. Real CRUD (payment approvals, ticket management, dispatch, HR, pricing) lives in the separate `apps/admin-panel/` app or scattered root routes, with an explicit fallback link to an external panel — `AdminTerminal.tsx:39,327-328`.
- Live counts for users/tickets/payments and an `audit_logs` preview are real; the launch-gate/runbook content is static.

---

## 4. Onboarding workflow (owner) — map & gaps

Canonical flow: `src/pages/PropertyOnboardingPage.tsx` orchestrates **11 internal steps grouped into 5 visible stages**: Company → Property (asset/location/systems) → Service Plan (live AED quote) → Account (proof upload / signup / review) → Contract & Payment (signature / summary / submit). State persists in a Zustand store (`bin-group-onboarding-v3`) + IndexedDB for proof-file bytes; submission writes `users`, `owner_registration_requests`, `intake_submissions`, `payment_transactions`, `contracts`, and `audit_logs` via callables in `functions/ownerRegistrationRequest.ts`.

Activation (pending → active) is satisfied when `OwnerActivationGuard` sees `adminApproved && paymentVerified && hasActiveContract`, driven by `adminApprovePayment` / `adminApproveContractActivation` / Intake Vault / the `approve_onboarding.cjs` script.

**Gaps / risks (behavioral, not `TODO`-commented):**
- **Fork divergence:** `apps/owner-app/` onboarding has **10 steps (no contract-signature step)** and submits via `submitOwnerOnboarding` **without proof upload**, unlike the `src/` flow. Two implementations of the same critical flow is a launch risk.
- **Title-deed OCR before auth:** `AssetProfileStep.tsx:141-142` throws `AUTH_REQUIRED_FOR_KYC_UPLOAD` at step 2 (pre-signup). It degrades gracefully to manual entry, but the error text ("scanner node busy") is misleading.
- **Stripe partial activation:** the webhook (`functions/stripePayment.ts:175-192`) sets `paymentVerified`/`dashboardUnlocked`/`status:active` but does **not** provision `activeContractId`/contract `ACTIVE`/properties like the admin path — Stripe-only owners may unlock a dashboard with no provisioned contract/properties.
- **Status-string mismatch:** cloud writes `pending_admin_approval` (`ownerRegistrationRequest.ts:197`) but `ProtectedRoute.tsx:102` lock list doesn't include it (dashboard is still gated by `OwnerActivationGuard`, so not a hard breach — worth reconciling).
- **Post-submit dead-end:** success button routes to `/` rather than `/login` or `/owner/activation`, so the owner must rediscover login.
- **Orphaned step components** under `src/components/onboarding/` (e.g. `PropertyIntakeStep`, `QuoteModelingStep`, `AdminSubmissionStep`) are not imported by the orchestrator.

**Tenant/technician/broker onboarding:** Tenant has a real invite flow (`TenantInvitePage.tsx` + `validateTenantInvitation`/`acceptTenantInvitation`). Technician/broker have **no dedicated onboarding wizard** — they enter via login / role-gateway self-assignment.

---

## 5. External / provider launch blockers (cannot be resolved in code alone)

From `npm run test:runtime-audit` and the README launch gates. These need accounts, billing, verification, or secrets set by the product owner:

| Blocker | Signal | Action owner |
|---------|--------|--------------|
| Google Maps key missing | `VITE_GOOGLE_MAPS_API_KEY` not set — GPS dispatch/maps disabled | Create + restrict key, set env |
| FCM/Web Push disabled | `VITE_FIREBASE_VAPID_KEY` missing/default — push won't work | Generate Web Push cert |
| App Check disabled | `VITE_ENABLE_FIREBASE_APPCHECK` not `true`, no site key — Firebase APIs unprotected | Register reCAPTCHA v3, enable enforcement |
| Payments | Stripe live keys + webhook verification; also fix partial-activation gap (§4) | Merchant approval, secrets, webhook |
| AI features (triage/OCR/concierge) | `OPENAI_API_KEY`/`GEMINI_API_KEY` are Functions secrets | Billing + `firebase functions:secrets:set` |
| WhatsApp/SMS notifications | Business verification + approved templates | Provider onboarding |
| Firebase billing plan | Waived in `test:launch-clearance` | CEO/admin confirmation |

---

## 6. Prioritized backlog (post-audit)

1. **Reconcile the onboarding fork** (`apps/owner-app/` vs `src/`) to a single source of truth; ensure Stripe-path provisions contract/properties.
2. **Owner dashboard truth:** compute `monthlyCostVariancePct` or hide it; resolve contractor-marketplace empty state.
3. **Technician simple dashboard:** wire the proof checklist to live job data.
4. **Admin ops parity:** decide whether `/admin/*` should host the full ops console in-app or keep the external panel; remove dead links accordingly.
5. **Tenant AI Concierge:** route + entry point once an AI provider key is configured.
6. **Polish:** replace `alert()` with the existing toast system across tenant/owner pages.
7. **Provider activation** (§5) — the gating dependency for marketing anything as "live".
