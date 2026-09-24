# BIN GROUP Canonical Runtime Contract

Status: **release contract under repair; not production evidence**

This document defines which implementation is allowed to be write-authoritative for launch-critical BIN GROUP workflows. It does not itself prove deployment, live behavior, device evidence, or hard-public-launch clearance.

## Release-control rule

The completed controlled pilot is not restarted merely because this contract or implementation is repaired. Pilot validity may be changed only by the explicit release-control/hard-clearance rules and exact-SHA evidence. A source change is not, by itself, proof that the prior pilot is invalid.

## Owner acquisition authority

Canonical workflow version: `OWNER_FIVE_PAGE_INSPECTION_FIRST_V1`.

Canonical lifecycle:

1. Verified Owner account and server-authored Owner profile.
2. Owner submits one to 100 real properties, required protected documents, signed contract evidence, and Owner-supplied map/GPS evidence.
3. Owner-supplied geography remains untrusted: `verified=false`, `dispatchReady=false`, `requiresGeoReview=true`.
4. `canonicalOwnerSubmission.submitOwnerInspectionFirstOnboarding` claims canonical property identities before invoking the proven inspection-first submission implementation.
5. Admin creates exactly one physical site inspection per submitted property and links all inspections to the intake.
6. Each physical visit must contain the existing immutable image/PDF evidence, SHA-256 hash, Storage generation, timestamps, checklist completion, and arrival GPS/radius evidence.
7. `canonicalOwnerInspectionCompletion.adminCompleteOwnerPortfolioInspections` invokes the proven portfolio-completion implementation and then promotes the **physical inspection arrival coordinates** into canonical property geography using `PHYSICAL_INSPECTION_EVIDENCE_V2`.
8. Only after every required inspection is complete does the server produce the final commercial terms and make the exact 15% mobilisation amount due.
9. Payment evidence is recorded server-side. Phase 1 public-launch policy remains Cash/Cheque only unless the separately protected payment configuration and launch contract are intentionally changed.
10. `securePaymentApproval.adminApprovePayment` requires the inspection evidence, immutable payment proof, current payment-policy binding, and canonical dispatch-ready `geoVerification` before activation.
11. Final activation remains server-authoritative and fail-closed; browser clients cannot manufacture `verified`, `dispatchReady`, `active`, `paymentVerified`, `adminApproved`, or dashboard-unlock state.

## Canonical property identity authority

Write-authoritative duplicate protection is `property_identity_registry` through `canonicalOwnerSubmission.ts`, using `PROPERTY_IDENTITY_V1`.

Identity signals are intentionally layered and privacy-preserving:

- normalized title-deed/property reference when supplied;
- normalized Google place + unit identity when supplied;
- normalized emirate/area/address + unit identity;
- normalized GPS bucket + unit identity (or whole-property type where no unit exists).

The registry stores SHA-256 identity hashes and canonical binding metadata, not public property details. Claims occur transactionally before canonical property submission, so concurrent submissions cannot both claim the same identity. A failed downstream submission attempts to release only claims created by that request. Existing canonical `properties` are also checked as a compatibility/backfill guard.

`functions/clientTelemetry.ts/checkPropertyUniqueness` is an advisory compatibility pre-check only. It is **not** the write-authoritative duplicate gate and must not be treated as launch proof.

## Property geo authority

There are two controlled compatibility versions:

- `verificationVersion=1`, `FOUNDER_MFA_REVIEW`: legacy compatibility for previously reviewed records only.
- `verificationVersion=2`, `PHYSICAL_INSPECTION_EVIDENCE`: canonical authority for new inspection-first Owner onboarding.

For inspection-first properties, administrative/document review must never itself create operational readiness. `canonicalAdminPropertyReview.ts` therefore rejects the legacy approve/verify action for any `OWNER_FIVE_PAGE_INSPECTION_FIRST_V1` property and rejects `draft` review attempts.

For new inspection-first properties, dispatch readiness requires:

- completed linked inspection;
- evidence status `VERIFIED`;
- valid immutable evidence hash and Storage generation;
- completed checklist;
- visit timestamps;
- `arrivalLocation.withinRadius=true`;
- canonical `geo` sourced from physical inspection arrival GPS;
- matching `geoVerification` evidence binding.

`securePaymentApproval.ts` consumes this canonical geo contract before Owner activation.

## Runtime export classification

| Surface | Classification | Write authority |
| --- | --- | --- |
| `canonicalOwnerSubmission.ts` | **CANONICAL** | Property identity claim + entry to inspection-first Owner submission |
| `inspectionFirstOwnerOnboarding.ts` | **COMPATIBILITY IMPLEMENTATION BEHIND CANONICAL WRAPPER** | Proven workflow implementation; direct submission export retired |
| `ownerInspectionAdminLink.ts` | **CANONICAL** | Creates/links one inspection per property; no payment collection |
| `ownerInspectionCompletion.ts/adminRecordOwnerPropertyInspectionEvidence` | **CANONICAL EVIDENCE RECORDER** | Immutable visit evidence |
| `ownerInspectionCompletion.ts/adminCompleteOwnerPortfolioInspections` | **COMPATIBILITY IMPLEMENTATION BEHIND CANONICAL WRAPPER** | Direct public completion export retired |
| `canonicalOwnerInspectionCompletion.ts` | **CANONICAL** | Physical-evidence geo promotion after proven completion |
| `propertyGeoAuthority.ts` | **CANONICAL AUTHORITY LIBRARY** | Validates Founder-v1 compatibility and physical-inspection-v2 canonical geo |
| `securePaymentApproval.ts` | **CANONICAL** | Final finance/MFA activation gate |
| `adminPropertyReview.ts` | **LEGACY COMPATIBILITY IMPLEMENTATION** | Not directly exported; may serve non-inspection-first legacy records through wrapper |
| `canonicalAdminPropertyReview.ts` | **CANONICAL FAIL-CLOSED BOUNDARY** | Blocks inspection-first/draft use of legacy approve+geo action |
| `secureOwnerRegistrationRequest.ts` | **LEGACY/COMPATIBILITY** | Must not become the acquisition authority for the five-page inspection-first workflow |
| Stripe implementation | **RETIRED/FAIL-CLOSED FOR PHASE 1** | Not an approved Phase 1 public Owner payment route |

No second implementation may be made publicly write-authoritative for the same transition without updating this contract, executable regression coverage, and the release evidence chain.

## Canonical status meanings

New inspection-first writes use uppercase underscore-delimited status values for lifecycle-critical server state.

Key states include:

- `SUBMITTED_FOR_PROPERTY_INSPECTION`
- `PENDING_PROPERTY_INSPECTION`
- `PENDING_ADMIN_SITE_VISIT`
- `READY_FOR_SITE_VISIT`
- `READY_FOR_SITE_VISITS`
- `COMPLETED`
- `AWAITING_SITE_INSPECTION`
- `NOT_DUE_UNTIL_INSPECTION_COMPLETE`
- `PENDING_ADMIN_PAYMENT_VERIFICATION`
- `AWAITING_15_PERCENT_PAYMENT`
- `ACTIVE`

Legacy aliases may be normalized only at controlled compatibility read boundaries. New canonical writers must not introduce additional aliases for these transitions.

## Role-to-role authority

### Owner

May create/submit Owner-controlled evidence and ordinary profile/property inputs. Cannot set canonical verification, dispatch readiness, payment approval, activation, or Admin state.

### Admin / Operations

May create and link inspections, record permitted evidence, and operate the documented lifecycle. Administrative review cannot bypass physical inspection, payment, contract, or activation prerequisites.

### Founder / privileged Admin

MFA remains mandatory for privileged finance and controlled legacy geo review. Founder review is not a substitute for required physical inspection evidence in the canonical Owner workflow.

### Technician / field

Operational property access must derive from an authorized assignment/dispatch. Physical evidence remains bound to GPS/time/evidence controls; no open mission-pool access is created by this contract.

### Tenant

Tenant/service flows remain server-authoritative and property/unit scoped. This Owner repair does not relax Tenant isolation.

### Broker

Broker KYC/referral/commission/payout authority remains server-controlled. This Owner repair does not expand Broker access to property/private Owner records.

## Test contract

Source-shape tests are architecture guards only. They may confirm that the canonical wrapper is exported and a legacy writer is not, but they do not prove workflow behavior.

Required behavioral evidence for this contract includes, at minimum:

- identity normalization for case, whitespace, punctuation and title-deed references;
- same property with changed marketing name / same coordinates;
- legitimate separate units at one building/location;
- duplicate concurrent claim rejection;
- Owner-submitted GPS remains unverified;
- physical evidence must be complete before geo promotion;
- payment approval fails without canonical `geoVerification` for inspection-first payments;
- wrong role / missing App Check / missing MFA denials where applicable;
- one inspection per submitted property;
- immutable evidence and payment receipt checks;
- full Owner workflow plus cross-role regression after deployment.

The repository now includes executable pure identity tests. Firestore/emulator and exact-SHA production evidence remain required before this repair can be declared launch-cleared.

## Production evidence rule

A merged source change is not production truth. Hard-public-launch evidence must bind all of the following to the same eligible release SHA:

- protected merge SHA;
- production deployment run and deployed SHA;
- required CI/regression results;
- Firestore/Storage/security evidence;
- authenticated role evidence using dedicated E2E identities and disposable records;
- physical inspection/GPS evidence where required;
- device/mobile/RTL requirements where required;
- public website/legal-content reconciliation;
- final hard-clearance decision.

Until those are satisfied, this contract describes the intended authoritative architecture, not a claim of live production clearance.
