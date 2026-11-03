# BIN GROUP Five-Profile Diagnostic Audit
**Audit date:** 3 November 2026  
**Repository:** `rashidpvt420-lang/bin-group-super-app`  
**Baseline main commit:** `3ea1ba43f3865848baf117f22f4519de5954583c`  
**Scope:** Owner, Tenant, Technician, Broker, and Admin / Finance / Operations profile journeys.

## 1. Executive result

The five profiles are implemented as separate routed experiences with shared Firebase identity, role context, Firestore/Storage rules, callable workflows and a dedicated Admin panel. This review did not find grounds to replace or rebuild the five portals. The principal code-level Owner finding was the bounded financial history: up to 100 invoices, up to 50 payouts from each UID/email query and only 25 payout rows shown/exported. That meant the screen could not substantiate a complete account history or reliable lifetime totals once those limits were reached.

The accompanying change adds cursor-based retrieval of the full Owner invoice and payout result sets, using Firestore document ID as a stable page order, a 100-record page size and a 10,000-record safety ceiling per query. The screen clearly labels partial results, blocks payout export until the payout queries are fully read, offers progressive table display, and no longer colours unknown payment states as paid. The historic net figure is no longer described as a forecast of the next payment.

This is a source-code audit and repository change. It is **not** a claim that every production account, Firebase record, Android device, push provider or App Store build has been physically tested.

## 2. Role-by-role diagnostic

### A. Owner

**Expected journey**
1. Owner creates/verifies an identity and completes the inspection-first five-stage property onboarding.
2. Owner supplies property details and real device GPS evidence; the system retains a draft without prematurely collecting payment.
3. Inspection, owner authority and property verification proceed through their server-controlled states.
4. Contract/quote is reviewed and signed; Phase 1 payment collection is recorded through permitted Cash/Cheque proof and independently verified.
5. Activation unlocks only after the server-authoritative conditions are satisfied.
6. Owner manages properties, units, tenants, service contracts, renewals, maintenance, approvals, documents and property passports.
7. Maintenance follows tenant request → evidence → authorization → technician dispatch → GPS arrival → before/after proof → tenant/owner review → finance approval/settlement.
8. Owner financial figures distinguish actual collected rent, paid invoices, pending verification, approved deductions and recorded payout history.

**Source areas checked**
- `src/owner/OwnerApp.tsx`
- `src/pages/PropertyOnboardingPage.tsx`
- `functions/inspectionFirstOwnerOnboarding.ts`
- `src/owner/pages/OwnerDashboardResolvedPage.tsx`
- `src/owner/pages/OwnerFinancialsPage.tsx`
- `src/owner/hooks/useOwnerFinancialTruthData.ts`
- Owner contract, payment-proof, profile, tenant, maintenance, approvals, passport and document pages.

**Already implemented in source**
- Five-step onboarding and inspection-first transition.
- Identity/phone verification and owner activation guard.
- Server-side owner/property binding and contract/payment gates.
- Owner dashboard property, maintenance, payment and approval information.
- Owner/tenant/property/contract/document views, profile corrections and financial truth aggregation.
- Receipt/proof and manual payment workflow.

**Gap fixed by this change**
- Financial history was capped at 100 invoices, 50 payouts for each UID/email query, and 25 displayed/exported payout records. A capped list could be mistaken for the entire account ledger.
- The page now detects when a first-page query reaches its boundary, offers complete cursor pagination, labels partial versus complete history, uses a 10,000-record safety ceiling per query, and prevents exporting payout rows while that history is known to be partial.
- Tables display data in progressive chunks to avoid rendering thousands of rows at once.
- Missing dates/statuses are no longer fabricated as “Today” or “COMPLETED”; unknown statuses use a neutral treatment, pending/failed states have distinct colours, and the financial summary is explicitly historic rather than a next-payment forecast.

**Still requires production evidence**
- Verify that every migrated invoice and payout is correctly keyed by owner UID or the owner’s verified email. Legacy rows with neither identity key will not appear in a self-service Owner query and must be reconciled by Finance.
- Verify multi-property owners, 100+ invoice histories, duplicate UID/email payout matches, and the exact financial totals against the Finance source ledger.
- Confirm the deployed Firestore indexes and rule evaluation for the cursor query with real owner accounts.

### B. Tenant

**Expected journey**
1. Tenant signs in and is linked to an approved property/unit and current tenancy; no unverified property ID is treated as authority.
2. Tenant sees their lease, unit, notices, balances, documents and maintenance history only within that bound residence.
3. Tenant raises a request, selects the correct service/priority and submits the required photos/description.
4. Backend validates the tenancy, unit, evidence and request, and creates a ticket idempotently.
5. Tenant sees an honest status/ETA and can communicate with the assigned team.
6. Technician arrival/work evidence is visible to the authorized parties.
7. Tenant can confirm/reject completed work or reopen a dispute through an authorized workflow.
8. Payment proof, lease renewal and move-in/move-out inspections remain linked to that tenant and unit.

**Source areas checked**
- `src/tenant/TenantApp.tsx`
- `src/tenant/pages/TenantDashboardPage.tsx`
- `src/tenant/pages/TenantRequestPage.tsx`
- `src/tenant/pages/TenantPaymentsPage.tsx`
- `src/tenant/pages/TenantProfilePage.tsx`
- `src/tenant/pages/TenantDocumentsPage.tsx`
- `src/tenant/pages/TenantMoveInspectionPage.tsx`
- Tenant callable workflows and Firestore/Storage rules.

**Already implemented in source**
- Tenant identity/unit binding and tenancy-derived data access.
- Evidence-backed maintenance request creation, including retry-safe deterministic photo paths.
- Cash/Cheque payment-proof submission with server verification.
- Profile correction requests rather than direct edits to protected identity/residence fields.
- Document, move inspection and maintenance ticket flows with visible load/error states.

**Remaining validation**
- Execute the full tenant → assigned technician → before/after evidence → tenant approval/dispute/reopen scenario with linked live accounts.
- Confirm tenants cannot query another unit, read another tenant’s attachments or access a ticket through a guessed identifier.
- Physically validate photo upload retries on poor connectivity and the resulting Storage object ownership.

### C. Technician

**Expected journey**
1. Technician signs in on a registered installation/device and completes required App Check/Play Integrity checks.
2. Profile readiness verifies mandatory identity/visa/medical/licence/certification status and expiry.
3. Technician marks duty status and shares fresh GPS availability when required.
4. Dispatch assigns only an eligible technician to an authorized ticket.
5. Technician sees only assigned mission details and authorized resident contact information.
6. Arrival requires valid GPS evidence; work requires before/after evidence, resolution notes and parts/material disposition.
7. Closeout is blocked until required proof is present and server validation succeeds.
8. Offline actions are queued safely and reconciled on reconnect; history, payroll and HR functions remain separately permissioned.

**Source areas checked**
- `src/technician/TechnicianApp.tsx`
- Technician dashboard, jobs, job detail, map, profile, proof-readiness, HR and offline-sync modules.
- Native App Check/location bridge, dispatch/readiness callables and relevant Storage/Firestore rules.

**Already implemented in source**
- Assigned-ticket access and mission-level restrictions.
- GPS freshness/accuracy checks and device-integrity integration.
- Credential readiness and dispatch freeze behaviour.
- Before/after evidence, completion blockers and offline action queue.
- Credential renewal submission and a staff HR/request experience.

**Clarification**
- The HR page has an emergency disable component, but the production build defaults the HR module to enabled; the production environment writer explicitly sets the HR switch to `true`. This is an emergency kill switch, not evidence of an ordinarily missing HR module.

**Remaining validation**
- Test with a physical supported Android device and the actual Play-distributed build: installation binding, Play Integrity, App Check, mocked-location rejection, geofence accuracy, camera upload, offline replay and recovery.
- Verify actual FCM delivery and notification click/deep-link routing on registered devices. Source code alone cannot prove delivery by Firebase/device providers.
- Compare technician payroll/earnings views to Finance-approved entries and test expired/suspended credentials.

### D. Broker

**Expected journey**
1. Broker creates an account and submits private identity, trade licence, RERA and payout verification information.
2. Admin verifies the current KYC submission and ties approval to its submission evidence/hash.
3. Only an approved broker can retrieve verified listings and submit attributable leads/referrals.
4. Lead lifecycle captures source, broker identity, customer consent/contact details and changes in status.
5. BIN GROUP validates conversion and contract attribution server-side.
6. Only approved, unpaid commissions become payout-eligible.
7. Payout request requires a short-lived, single-use email OTP bound to the specified commission IDs/amount; Finance reviews and records settlement.
8. Broker can see masked identity/payout readiness and download statements without retrieving private vault values.

**Source areas checked**
- `src/broker/BrokerApp.tsx`
- Broker dashboard, leads, listings, commissions, documents and profile.
- Broker KYC callables, listing service, payout OTP functions and Admin KYC review authority.

**Already implemented in source**
- Masked KYC summary and server-side resubmission.
- Verified RERA/listing access and lead lifecycle restrictions.
- Server-side attribution/commission settlement authority.
- OTP-gated payout request and statement workflow.
- Document upload and pending-review state.

**Remaining validation**
- Test a full real broker attribution through a signed/approved contract and Finance-approved commission; a lead status alone must not create payable commission.
- Test OTP expiry, replay, wrong code, changed commission list/amount and payout hold.
- Confirm uploaded KYC/IBAN documents are private and that reviewer roles cannot see unmasked values outside approved review functions.

### E. Admin, Finance and Operations

**Expected journey**
1. Admin signs in and proves current verified account authority and the required MFA factor.
2. Staff receive an explicit role and only approved module claims; a role change/suspension invalidates stale authority.
3. Admin dashboard shows live, source-backed queues and distinguishes unavailable data from zero records.
4. Operations authorizes and dispatches tickets only to eligible technicians.
5. Finance reviews original proof, quote/contract binding, approvals and settlement; cash/cheque-only Phase 1 policy is enforced.
6. HR manages staff lifecycle, credentials, attendance and payroll through the HR authority model.
7. Sensitive mutations run through App Check/MFA-protected server callables and write audit events.
8. Hard public launch remains a separate protected clearance process; normal Admin access cannot self-approve the launch gate.

**Source areas checked**
- `apps/admin-panel/src/App.tsx`
- `apps/admin-panel/src/components/ProtectedRoute.tsx`
- `apps/admin-panel/src/context/AuthContext.tsx`
- `apps/admin-panel/src/security/staffAccessPolicy.ts`
- Staff provisioning, Admin security, operations mutation and finance callables.
- Firestore rules and Admin authorization regression suites.

**Already implemented in source**
- MFA-enforced Admin routes, role/module path checks and restricted staff defaults.
- Server-derived module permissions and staff lifecycle provisioning.
- Callable-only operational mutations with server-side audit records.
- Finance-specific approval restrictions and separate approver policy in selected high-risk workflows.

**Remaining validation**
- Validate each actual staff account against its approved module matrix; generic role names must never substitute for least-privilege entitlement review.
- Exercise denied routes and denied callable requests for every non-Admin role, including stale claims after suspension/role change.
- Run full finance and operations queues with real data and verify every decision is auditable and independently attributable.

## 3. Cross-profile control checklist

| Control | Source-level result | Runtime evidence still required |
|---|---|---|
| Identity and role binding | Implemented with Firebase identity, role claims, server checks and owner/tenant/property binding | Test all five account types against current production claims |
| Firestore/Storage ownership | Rules and server callables restrict important collections and document paths | Emulator suite plus production read/write attempts on real accounts |
| App Check and privileged MFA | Production code requires App Check and Admin MFA for protected operations | Confirm live App Check provider, valid tokens and enrolled Admin factors |
| Maintenance chain | Tenant request, server ticket creation, dispatcher, technician, evidence and owner/tenant review surfaces exist | Execute the complete chain across distinct live accounts |
| Financial integrity | Cash/Cheque Phase 1, server-authored records, proof and approval controls exist | Reconcile real records and prove no bank/card payment path is active |
| Documents and PDFs | Vault/document and invoice/contract evidence paths exist | Open actual generated files, verify signatures/hashes/access and expired/revoked cases |
| Notifications | In-app/push integration and server notification workflow exist | Real device token registration and end-to-end FCM delivery evidence |
| Language/mobile usability | English/Arabic and RTL support are present in profile experiences | Physical device tests for small screens, Arabic forms, accessibility and screen readers |
| Performance and scale | Query limits, listeners, offline cache and role-specific views exist | Load/performance test against representative 100/1,000/10,000-unit datasets |
| Launch governance | Hard-launch state is fail-closed and separate from normal deploy | Fresh exact-SHA evidence, incident clearance and protected signed decision |

## 4. Changes in this audit branch

1. Owner financial history now has stable cursor pagination by Firestore document ID for invoice and payout queries.
2. The UI explicitly marks partial versus complete history. It never silently implies that the first page is the whole ledger.
3. Payout CSV export is disabled until the UID and verified-email payout query histories are complete.
4. Invoice/payout tables reveal rows progressively after the full data set has been loaded.
5. Unknown payment statuses are displayed neutrally; pending and failed/rejected states are not coloured as paid.
6. Missing transaction dates and descriptions no longer default to fabricated “Today” or “Monthly Rental Payout” values.
7. A historic net-owner-payout calculation is no longer labelled as the “next projected payout”.
8. A regression test protects these pagination, truth-label and export rules.

The full-history action is deliberately bounded at 100 pages × 100 records (10,000 records per query). When the safety ceiling is reached, the page keeps the history marked incomplete and directs Finance to reconcile rather than silently claiming completeness. Historical records without either an owner UID or a verified owner-email key remain outside the self-service query and require data-governance reconciliation.

## 5. Release and evidence decision

- Source-level audit is not equivalent to five live-account end-to-end tests.
- A successful CI build does not prove actual FCM delivery, production App Check, physical GPS integrity or signed store binaries.
- The existing completed 24-hour controlled pilot must not be restarted.
- Keep the hard public launch claim false until fresh operational readiness, incident and authorized signed approval evidence pass the protected launch gate.
- Phase 1 remains AED Cash/Cheque only. Do not enable Stripe, cards or bank transfers.
- This audit report does not assert that this branch is deployed. Production deployment must use the protected current-main Firebase workflow after merge, and the exact workflow result must be checked.

