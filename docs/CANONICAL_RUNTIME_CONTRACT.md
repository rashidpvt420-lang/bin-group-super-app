# BIN GROUP canonical runtime contract

Status: audit in progress; candidate branch, **not** a production authorization. Source baseline `045338098eb637b298cbdf28ace68a233c68be1b`; the current Owner repair PR is #1343. This document describes deployed exports and the intended authority separately. Existing violations below are release blockers until corrected and verified.

## Entry points and trust boundaries

| Surface | Implementation | Authority |
| --- | --- | --- |
| Public site and five role portals | `src/App.tsx`, `src/{owner,tenant,technician,broker}/*`, `src/admin/*`; `/onboarding/*` | Client display and submission only; `ProtectedRoute` and `RoleContext` never confer server authority. |
| Separate Admin and Owner builds | `apps/admin-panel/src/App.tsx`, `apps/owner-app/src/App.tsx` | Alternate clients of the same Firebase project; these are **not** separate authoritative backends. |
| Firebase identity and claims | Firebase Auth; server callables and `firestore.rules` | Auth UID, verified role/claims, Founder MFA and App Check where required; profile failures must close access. |
| Server API | `functions/index.ts`, `functions/runtime.ts` and explicit exported callable modules | Only exported Functions plus privileged Admin SDK may advance protected business states. |
| Data and proof | Firestore `intake_submissions`, `properties`, `property_inspections`, `contracts`, `payment_transactions`, `owner_dashboard_unlocks`, `maintenanceTickets`, `technician_dispatch_jobs`, `notifications`, `audit_logs`; Firebase Storage paths governed by `storage.rules` | Rules protect direct client writes; Functions must validate every transition and evidence binding. Owner supplied `submittedGeo` is untrusted. |
| Hosting and mobile | `firebase.json`, `.github/workflows/firebase-production-deploy.yml`, Android/iOS store workflows, PWA wrappers | Hosted bytes and physical-device results require separate exact-SHA proofs. |
| Release control | `.github/workflows/{live-role-smoke,operational-application-evidence,technician-physical-evidence,production}.yml`, `scripts/*hard*launch*`, `docs/LAUNCH_GATE_SINGLE_TRUTH.md` | Pilot completion and public authorization are separate; neither can be inferred from a green source build. |

## Owner and property lifecycle

Canonical workflow version: `OWNER_FIVE_PAGE_INSPECTION_FIRST_V1`. The public client enters `/onboarding/*`, previews a short-lived authenticated quote through `previewOwnerInspectionQuote` (`functions/inspectionFirstOwnerOnboarding.ts` and pricing in `ownerOnboardingQuote.ts`), verifies signature OTP, uploads identity/property proof and calls `submitOwnerInspectionFirstOnboarding`. This callable owns the atomic transition into `intake_submissions.status=SUBMITTED_FOR_PROPERTY_INSPECTION`, `properties.status=PENDING_PROPERTY_INSPECTION`, `payment_transactions.status` pending, and the linked contract. Owner supplied location starts `verified=false`, `dispatchReady=false`, `requiresGeoReview=true`. A quote, including the 15% amount, is information at submission; collection is **not due** until all linked physical inspections pass. `ownerInspectionAdminLink.ts` owns Admin inspection linkage; `ownerInspectionCompletion.ts` owns completion with field evidence per property. `adminRecordOwnerMobilizationPaymentEvidence` and `securePaymentApproval.ts` own recorded exact-amount manual Cash/Cheque payment and approval. Contract and Owner/dashboard activation must independently check signed/verified inspection, approved geo, identity, and payment prerequisites. New status writes must use the uppercase lifecycle values of the canonical callables; read aliases for legacy documents belong at a single documented compatibility boundary.

`adminPropertyReview.ts` now treats inspection-first document review separately: it checks a linked submitted intake, keeps the property pending inspection and does not promote Owner coordinates. `propertyGeoAuthority.ts` still permits Founder MFA verification of a submitted coordinate for legacy properties. This does **not** establish physical inspection. A physical inspection must be linked to each submitted property and field GPS/evidence hash/generation, timestamps and checklists validated on the server. Legacy approved property geo verification needs its own migration review, independent of the inspection-first transition.

## Other business transitions

| Workflow | Canonical write authority | Read/status boundary |
| --- | --- | --- |
| Property uniqueness | **Gap**: `clientTelemetry.ts:checkPropertyUniqueness` only searches `active_contracts` and `onboarding_leads` with exact unit/community. Must check canonical `properties` and open `intake_submissions` atomically, with stable document/property identifiers and no private response fields. | Three `PublicSecurityRegistry.ts` clients currently mirror the same legacy callable. |
| Tenant maintenance | `functions/index.ts` ticket callables and `maintenanceTickets`, assignment/dispatch callables | Tenant/Owner/assigned Technician reads and update permissions must match `firestore.rules`. |
| Technician field proof | `functions/technicianBeforeWorkEvidence.ts`, `technicianAfterWorkEvidence.ts`, `ownerInspectionCompletion.ts` | Field/device attestation and location provenance remain independently evidenced. |
| Broker commission | Server attribution/commission/payment callables exported from `functions/runtime.ts` | Broker reads scoped to own identity; exactly-once payout/commission lock. |
| Admin/Founder claims | Server Auth/custom claims, MFA enforcement and App Check | An Admin UI button is never an authorization decision. |
| Mail and notifications | `mailDelivery.ts`, `notificationDelivery.ts`, Firestore `mail`/`notifications` | Enqueueing is distinct from provider delivery proof. |
| AI and maps | Server AI callables, maps configuration and client map display | Enabled integration requires hosted production evidence; location verification requires field evidence. |
| Phase 1 payment | Server quote, evidence receipt, `securePaymentApproval.ts` | AED Cash/Cheque only; Bank Transfer and cards disabled in `docs/LAUNCH_GATE_SINGLE_TRUTH.md`. |

## Implementation classification and known contradictions

| Implementation | Class | Required treatment |
| --- | --- | --- |
| `inspectionFirstOwnerOnboarding.ts` explicitly exported five-page callables; `ownerInspectionAdminLink.ts`; `ownerInspectionCompletion.ts`; `securePaymentApproval.ts` | CANONICAL | Keep App Check, MFA, idempotency, inspection and amount checks. Validate cross-module transitions in emulator. |
| `ownerOnboardingQuote.ts`, `ownerPortfolioQuote.ts` | CANONICAL for their respective inspection-first and recorded quote consumers | Server amounts and hashes authoritative; do not display persisted quote as verified before a new authenticated response. |
| `ownerOnboardingPaymentPhase1Hold.ts` and Stripe hold exports | RETIRED / FAIL-CLOSED | Keep retired callable names closed for stale clients. |
| `adminOwnerOperations.ts:approveOwnerSubmissionOperationalFlow` | RETIRED / FAIL-CLOSED, **unsafe dead implementation below the throw** | Remove/isolate unreachable privileged writes after preserving the fail-closed endpoint. Audit remaining exports independently. |
| `adminPropertyReview.ts` for inspection-first documents | CANONICAL document review only | Linked submitted intake; approval preserves pending inspection and unverified GPS. |
| `adminPropertyReview.ts` legacy path and `propertyGeoAuthority.ts` | UNSAFE / MUST ISOLATE before public clearance | Legacy Founder review still promotes submitted coordinates; review existing production records and restrict legacy migration separately. |
| `clientTelemetry.ts:checkPropertyUniqueness`, `active_contracts`, `onboarding_leads` exact name/unit check | READ-ONLY LEGACY COMPATIBILITY, inadequate as duplicate decision | Replace authoritative duplicate decision with canonical server identity/claims in the submission transaction. |
| `src/utils/PublicSecurityRegistry.ts`, `packages/shared/src/utils/PublicSecurityRegistry.ts`, `apps/owner-app/src/utils/PublicSecurityRegistry.ts` | Client compatibility copies | One canonical callable and minimal Boolean response; remove duplicated business authority. |
| `PRIVACY_POLICY.md`, `public/privacy-policy.html`, `public/terms-of-service.html`, `TERMS_OF_SERVICE.md`, app-specific legal copies | UNSAFE PUBLIC CONTRADICTION | Entity and email addresses differ; require approved entity/contact/legal wording before declaring public readiness. |

## Exact release/evidence contract

The 24-hour pilot is recorded against the frozen deployed release `7667ff54f9c43e07f78b3710578cd132b1bc7963`; source baseline main `045338098eb637b298cbdf28ace68a233c68be1b` is a separate control-plane SHA. No implementation change by itself proves pilot invalidation; the verifier's release-control contract decides whether a new pilot is necessary. Production operational evidence #91 passed, while hard clearance #699 remained blocked by physical Technician GPS lifecycle proof (diagnostic: registeredNative 0, completed 14, physicalBound 0, gpsVerified 0, orderedLifecycle 0). PR #1343 is undeployed and cannot be counted as a live fix. Source checks, hosted evidence and real-device evidence remain distinct. Evidence records must bind the exact eligible release and control-plane SHA without rewriting historical timestamps or manufacturing proof.

## Open proof requirements

Create behavioral emulator tests for duplicate/concurrent property submissions and all denied transitions; browser tests for review quote, session restoration, Owner portfolio pin selection, Arabic/RTL; full five-role role-to-role E2E; production checks only with designated test identities and disposable records. Treat this document as a map of investigated code, **not** evidence that those workflows have passed.
