# BIN GROUP Super App — Public Launch Audit

**Audit date:** 10 July 2026  
**Repository:** `rashidpvt420-lang/bin-group-super-app`  
**Audit branch:** `fix/public-launch-audit-bridge-2026-07-10`  
**Pull request:** `#227`  
**Current decision:** **NO-GO FOR UNRESTRICTED PUBLIC LAUNCH** until the live evidence gates in this document are all proven.

## 1. Audit standard

This audit does not accept a successful page render, static green badge, old screenshot, emulator result, manually edited Boolean, or documentation statement as production proof.

A launch-critical workflow is considered proven only when:

1. the active route is registered;
2. the active component reads/writes the intended Firebase project;
3. Firestore/Storage Rules permit the legitimate actor and deny unauthorized actors;
4. the server-side function exists and is exported;
5. the repository build and guard commands pass;
6. the workflow is completed with real production credentials and evidence;
7. the canonical evidence is recorded in `system_health/admin_summaries`.

## 2. Active application topology

The deployed product is one unified Vite/React application with five role portals:

- Owner: `/owner/*`
- Tenant: `/tenant/*`
- Technician: `/technician/*`
- Broker: `/broker/*`
- Admin: `/admin/dashboard` and protected admin routes

The default role dashboards intentionally use a simplified action-first layout, while advanced operational dashboards remain available under each role's full-dashboard route.

## 3. Launch-critical defects fixed in PR #227

### 3.1 Audit-log writes were incompatible with hardened Firestore Rules

**Defect:** Several legacy screens used browser `addDoc()` against `audit_logs` or `auditLogs`. Production Rules deny client audit creation by design. A business mutation could succeed and the follow-up audit write could fail, making a successful action appear unsuccessful or interrupting a multi-step operation.

**Fix:**

- Added a compatibility bridge in:
  - `src/lib/firebase.ts`
  - `apps/admin-panel/src/lib/firebase.ts`
  - `packages/shared/src/lib/firebase.ts`
- Exact writes to `audit_logs` and `auditLogs` now call the authenticated `logUserAuditAction` Cloud Function.
- Non-audit collections still use native Firestore `addDoc()`.
- Simultaneous duplicate legacy audit writes are deduplicated while pending.
- Added `scripts/verify-audit-write-bridge.mjs`.
- Added `npm run verify:audit-bridge` to `test:stability`.

### 3.2 Admin dashboard displayed false static launch readiness

**Defect:** The canonical admin command center displayed every public-launch item with a green check and called the path ready without reading live production evidence.

**Fix:**

- `/admin/dashboard` now reads `system_health/admin_summaries`.
- It reports the exact ten launch gates as PASS or PENDING.
- It reports **NO-GO** until all ten gates are true with accepted live evidence.
- Evidence text and verification timestamps are displayed where available.

### 3.3 Legacy Admin Settings called a nonexistent localhost REST API

**Defect:** The legacy Settings page exposed editable production-looking controls and posted to `/api/admin/settings` through an Axios client defaulting to `http://localhost:5000`. The repository has no matching REST server.

**Fix:**

- Removed the false operational controls.
- Replaced the page with a read-only Firebase launch-evidence view.
- Production policies such as maintenance mode, dispatch limits, fee rates, payroll values, and notification behavior are not presented as editable until protected server workflows consume and enforce them.

### 3.4 Stripe onboarding skipped persistence of the signed owner package

**Defect:** Manual payment methods called `submitOwnerOnboardingPaymentPackage`, which persists the contract, properties, signature, document URLs, intake record, and canonical payment transaction. The Stripe branch redirected to Checkout before calling that function. Its webhook then wrote a second payment ID and directly unlocked the owner, bypassing the same admin activation sequence.

**Fix:**

- `PaymentSubmissionStep` now persists the complete signed onboarding package before starting Stripe Checkout.
- Stripe Checkout now requires an authenticated owner whose UID and email match the persisted package.
- Checkout refuses to start unless the canonical payment and contract records already exist.
- The canonical onboarding payment ID is now the intake ID for package submission, Stripe verification, admin review, reporting, and activation.
- A Stripe webhook verifies payment but keeps the dashboard locked.
- Final owner activation remains an explicit admin action through `adminApprovePayment`.
- Query parameters are never accepted as payment proof.

### 3.5 Repository hygiene guard blocked all CI before builds

**Defect:** `scripts/normalize-firestore-rules.mjs` contained literal merge-conflict marker lines as repair patterns. `repo-hygiene-guard.mjs` scanned that script and failed before dependency installation, type-checking, or builds.

**Fix:**

- Conflict markers are now generated from repeated characters rather than stored as literal marker lines.
- The normalization behavior remains intact.

### 3.6 Dashboard data and Arabic UX gaps

**Fixes:**

- Owner monthly maintenance cost variance is calculated from live ticket cost data instead of remaining permanently `null`.
- Owner decision/approval command strip now has Arabic labels and explanations.
- Tenant one-tap maintenance shortcuts and emergency SLA explanation now have Arabic copy.
- Shared Owner/Tenant/Technician/Broker/Admin quick actions now have Arabic labels and descriptions.
- Technician Simple Mode no longer shows a misleading `0% proof complete` when no live job proof data was supplied. It shows the required evidence checklist; live proof readiness remains available from the job-backed proof page.

## 4. Profile-by-profile audit

## Owner

### Working architecture

- Simple and advanced dashboards are routed.
- Property, contracts, documents, invoices, payments, approvals, complaints, tenants, units, maintenance history, reports, IBAN, activation, and property passport routes are registered.
- Owner activation is guarded by admin approval, verified payment, and an active contract/dashboard-unlock flag.
- Contract signing uses a backend callable.
- Payment approval uses an admin-only callable.
- Owner approval counts, high-risk tickets, disputes, expiring documents, and monthly cost variance are live-query driven.

### Required production proof

- Complete one owner onboarding with title/ownership proof.
- Confirm signed contract PDF creation and durable URL.
- Complete a real 15% card or approved offline payment.
- Confirm Stripe verification does not unlock before admin approval.
- Approve payment as admin and verify `activeContractId`, `adminApproved`, `paymentVerified`, and `dashboardUnlocked`.
- Verify units are generated/imported, tenant invitations work, and owner IBAN review is functional.

## Tenant

### Working architecture

- Dashboard, maintenance request, emergency, ticket tracking, notices, keys, parcels, parking, marketplace, staff, messages, community, lease, move-out, payments, documents, invoices, complaints, notifications, and property passport routes are registered.
- One-tap maintenance category parameters are consumed by the request page.
- Exact service location and at least one photo are required before dispatch.
- Tenant unit/property resolution supports UID and normalized email linkage.

### Required production proof

- Link a real tenant to a real unit and property.
- Submit a request with photo evidence.
- Verify ticket creation, SLA fields, notifications, technician assignment, and owner visibility.
- Verify tenant completion review, approval/dispute, rating, and evidence-vault access.
- Verify emergency notification delivery on a physical device.

## Technician

### Working architecture

- Dashboard, jobs, job detail, map, schedule, offline mode, messages, performance, payroll, profile, activity, documents, payments, safety, time tracking, leaderboard, and proof-readiness routes are registered.
- The live proof-readiness page queries active assigned tickets and evaluates before photo, after photo, resolution notes, and parts/material disposition.
- The shared checklist communicates closure evidence requirements without inventing a live score when no job was loaded.

### Required production proof

- Claim/accept a real job.
- Record arrival and GPS evidence.
- Upload before and after evidence through production Storage Rules.
- Record notes and parts disposition.
- Confirm close is blocked when mandatory proof is missing.
- Confirm tenant review, owner visibility, audit trail, payroll/time records, and offline resynchronization.

## Broker

### Working architecture

- Dashboard, leads, submissions, commissions, withdrawals, documents, profile, referrals, agreement, onboarding, reports, earnings, payments, and settings routes are registered.
- Referral URL and broker code are derived from the authenticated broker.
- Live lead and commission signals are read from `brokerLeads` and `broker_commissions`.
- Lead creation records attribution fields before a contract exists.

### Required production proof

- Create a broker referral and owner onboarding from that URL.
- Confirm attribution survives onboarding, contract creation, payment approval, and activation.
- Confirm one commission is created, locked to the correct broker, and not duplicated.
- Verify withdrawal authorization and payment status changes.

## Admin

### Working architecture

- The canonical command center reads live counts for users, open tickets, payment review, audit events, and launch evidence.
- Owner/property/payment approval and rejection flows are present.
- Protected audit logging now uses server authority.
- Launch status is evidence-backed rather than hard-coded.

### Required production proof

- Login using a rotated production admin credential and current claims.
- Verify owner, tenant, technician, broker, ticket, payment, contract, document, and audit visibility.
- Approve and reject representative records.
- Confirm server audit entries contain authenticated actor identity.
- Complete the five-role smoke test without console errors or permission-denied failures.

## 5. Correct owner onboarding workflow

The production workflow should be:

1. Owner enters company/private-owner identity and contact details.
2. Owner enters property, location, asset, unit, and service-scope information.
3. Pricing engine produces the commercial quotation and 15% mobilization amount.
4. Owner uploads ownership/identity evidence.
5. A restricted owner authentication account is created so uploads and server callables are authenticated.
6. The account remains locked; creation does not imply approval or activation.
7. Owner reviews and signs the bilingual agreement.
8. The signed package is persisted server-side: intake, contract, properties, proof URLs, signature, pricing, payment manifest, and canonical payment transaction.
9. Payment proceeds:
   - Offline methods remain pending admin verification.
   - Stripe may auto-verify funds, but does not auto-approve the owner or unlock the dashboard.
10. Admin verifies ownership evidence, contract data, payment, and operational readiness.
11. `adminApprovePayment` activates the contract and writes owner activation fields.
12. Properties/units become operational, tenant invitations are sent, and owner reporting begins.

This preserves authenticated uploads without allowing account creation or successful card payment to bypass business approval.

## 6. Ten live public-launch gates

All ten must be proven in production and recorded in `system_health/admin_summaries`:

1. `adminCredentialLogin`
2. `fiveProfileSmoke`
3. `stripeLiveMode`
4. `appCheckProduction`
5. `brandedEmailSender`
6. `adminSecretRotation`
7. `tenantNotificationDelivery`
8. `technicianGpsStorageProof`
9. `brokerCommissionLock`
10. `renewalWatch`

## 7. Required repository verification

The PR must be mergeable and green on, at minimum:

```bash
npm run test:repo-hygiene
npm run typecheck
npm run build:shared
npm run build
npm run build:functions
npm run build:admin
npm run test:stability
npm run test:rules
npm run test:hard-launch-readiness
npm run test:mobile-store-readiness
```

A passing build proves code compilation. It does not prove Stripe live mode, App Check enforcement, email delivery, push delivery, GPS/Storage behavior on a device, credential rotation, or a five-profile production transaction.

## 8. Public-launch blockers remaining after merge

These are environment/operational blockers and must not be replaced by code-only claims:

- Stripe live secret key and webhook secret configured in the deployed Functions environment.
- Real card payment and signed webhook proof.
- Firebase App Check production site key active and enforcement enabled for intended services.
- Branded email extension/provider delivering from the approved BIN GROUP sender.
- Production admin password and related secrets rotated.
- Physical-device notification proof for tenant and technician workflows.
- Physical-device technician GPS and Storage upload proof.
- Broker referral-to-contract-to-commission proof.
- Renewal scheduler and notification proof.
- Complete Owner → Admin → Tenant → Technician → Tenant/Owner closure → Broker/Finance evidence chain.

## 9. Launch decision

**Current result: NO-GO for unrestricted public launch.**

The app may continue in a controlled pilot only after PR #227 is green and merged. Public launch becomes eligible only when every repository validation is green and all ten live evidence gates are recorded from genuine production workflows.
