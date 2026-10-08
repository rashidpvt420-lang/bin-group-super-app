# Phase 2 — Every-Control Closure

Date: 2026-10-08  
Base: `40c5e21ac2c665636e2668920c3a523e310d0733`  
Branch: `fix/phase2-every-control-matrix`

## Why this closure exists

The five-profile workflows and authority repairs were green, but the original Phase 2 definition also required a reusable control matrix across every registered profile route. The existing inventory was labelled Phase 3 and was report-only. It discovered 2,378 controls across 303 files but did not fail when mutation-like actions lacked a loading/double-submit guard.

This closure makes the control matrix a Phase 2 requirement.

## Enforced matrix

The authenticated route audit already verifies direct URL, browser refresh, mobile viewport, Arabic/RTL, route persistence, visible content, authorization and route-aware Back controls across Owner, Admin, Technician, Tenant and Broker routes.

The source inventory now:
- inventories every interactive control under the main and Admin applications;
- rejects visible controls without a testable/accessibility identity at runtime;
- rejects contradictory disabled/busy semantics;
- classifies action controls separately from local form edits/navigation;
- fails when a mutation-like action control has no disabled/loading protection;
- remains bound to the protected hard-route audit.

Domain tests continue to prove server mutation authority, permission denial, idempotency/double-submit behavior, success/error handling and persistence for protected workflows.

## Additional repair found by the closure

Tenant parcel collection still used a direct Firestore browser update. It is now routed through `confirmTenantParcelCollection`, protected by Auth + App Check, Tenant ownership validation, server timestamps and an audit record. Firestore rules deny direct Tenant parcel mutation.

## Exclusions

Hard-clearance, frozen pilot, release-lock and Public Launch command authority are unchanged.

## Exit rule

Phase 2 is complete only when the exact PR head passes:
- Phase 2 every-control matrix;
- Five Profile and Onboarding Audit;
- PR Validation;
- BIN GROUP CI;
- Firestore verification;
- Expression Budget;
- Play Integrity;
- iOS arm64;
- Founder preflight;
- Firebase extension guard;
- Codacy with no new issues.

After merge, the merge commit becomes the Phase 3 baseline.
