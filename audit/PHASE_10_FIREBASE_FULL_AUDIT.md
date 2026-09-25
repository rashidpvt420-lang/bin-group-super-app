# Phase 10 — Firebase Full Independent Audit

Baseline reviewed: `main@d9cfd292ed925c9a87a45cfb7df24f8b87bc6fe6`  
Audit branch: `audit/phase-10-firebase-full-audit`

## Decision

**STATUS: BLOCKED — do not merge Phase 10 as complete yet.**

The independent pass found three release-blocking gaps:

1. **iOS native Firebase App Check is not provisioned.** The shared production bootstrap had Android Play Integrity support but intentionally failed every non-Android native production runtime. No iOS Firebase App Check provider, native Firebase configuration, or App Attest/DeviceCheck bridge is present in the reviewed baseline.
2. **Apple Sign-In is absent.** Google OAuth exists, but no Firebase `OAuthProvider('apple.com')` / native Sign in with Apple implementation or protected provider configuration is present.
3. **Callable App Check enforcement was incomplete.** The legacy `functions/index.ts` surface and several role-specific callable modules exposed authenticated/privileged endpoints without `enforceAppCheck: true`. This branch hardens those direct callable options and adds a regression gate. Two bounded bootstrap exceptions remain explicit and must not gain privileged authority.

No HARD_CLEARANCE, frozen-release, exact-SHA, payment, inspection, GPS, MFA, or launch-evidence safeguard was weakened.

## Authentication

| Surface | Result | Evidence / action |
| --- | --- | --- |
| Owner | PASS (source) | Firebase email/password and Google sign-in paths exist; password recovery exists; owner authority remains claims/profile-bound. |
| Tenant | PASS (source) | Tenant invite/login flows are authenticated; password recovery exists; cross-tenant Firestore rules are tested. |
| Technician | PASS (source) | Firebase Auth plus approved-Technician profile/claim checks; disabled/suspended handling and session revocation paths exist. |
| Broker | PASS (source) | Firebase Auth, broker role/KYC authority, password recovery and cross-broker isolation present. |
| Admin | PASS (source) | Email/password login; Google Admin redirect is intentionally disabled until MFA return handling is supported; server authorization remains mandatory. |
| Founder | PASS (source) | Founder/CEO protected evidence paths include TOTP readiness and privileged-identity verification. |
| Google OAuth | PASS (source) | `GoogleAuthProvider` is used by public/role login surfaces. |
| Apple OAuth | **BLOCKED** | No Apple provider implementation/configuration found. |
| Password reset | PASS (source) | `sendPasswordResetEmail` exists across role login/profile surfaces. |
| MFA | PASS (source) | Admin MFA challenge/enrollment supports Firebase second factors. |
| TOTP | PASS (source) | `TotpMultiFactorGenerator` is used for enrollment/sign-in; Founder evidence verifies TOTP readiness. |
| Claims | PASS (source) | Canonical role/custom claim issuance and server-side role checks exist; stale privilege repair paths are guarded. |
| Disabled users | PASS (source) | Staff/owner lifecycle disables Firebase Auth users and rules also deny suspended identities. |
| Account recovery | PASS with privileged controls | Admin MFA recovery is dual-authority and requires re-enrollment after reset. |
| Session revocation | PASS (source) | `revokeRefreshTokens` is used for suspension, staff lifecycle, MFA recovery and privileged session controls. |

## Firestore

Production deployment is generated from root `firestore.rules` into `launch_generated/firestore.rules` by `scripts/write-production-firestore-rules.mjs`. The generator keeps the hardened source and deployment artifact identical and refuses known unsafe fragments.

Business-name mapping:

- Property submissions → `intake_submissions`
- Tickets → canonical `maintenanceTickets`; legacy `tickets` is read-only compatibility data
- Technician live locations → `technician_live_locations`
- Broker KYC → `broker_kyc_profiles` plus server-only rate-limit state
- Audit logs → `audit_logs` / `auditLogs`
- Launch evidence → `launch_evidence`
- Private HR → `private_hr_profiles`
- System configuration/secrets → bounded `settings` plus server-only `system_secrets`

### CRUD / isolation conclusions

- `owners`: self/admin/manage-tenant access; owner activation fields remain server-authoritative.
- `properties`: owner/authorized role access; canonical geo, verified, dispatch-ready, inspection and activation fields are protected.
- `intake_submissions`: owner-readable; create/update/delete is Admin/server authority.
- `units`: tenant/owner/property-management scoped; cross-tenant isolation enforced.
- `tenants`: self/participant/admin read; Admin-only lifecycle mutations.
- `maintenanceTickets`: canonical server/Admin create; bounded actor updates; Admin delete; legacy `tickets` rejects client writes.
- `technician_live_locations`: dispatch-authority read; all client writes denied.
- `inspections`: tenant ownership on create/read with Admin review mutation.
- `payments` / `payment_transactions`: client writes denied; finance queue read is role/module-bound.
- `design_quotes` / turnover quotes: scoped reads and server/Admin-authoritative state changes.
- `contracts`: participant/owner/admin reads; protected activation and bounded owner draft mutation.
- `broker_kyc_profiles`: Broker/Admin scoped read; client mutations denied.
- `audit_logs`: Admin/Auditor read; writes server-only and immutable.
- `launch_evidence`: Admin read; browser-created manual evidence cannot forge GitHub/execution/hard-launch provenance; update/delete denied.
- `private_hr_profiles`: browser read/write denied even to Admin; Admin SDK callables are the authority.
- `system_secrets`: browser read/write denied.
- Unknown collections remain fail-closed except the deliberately bounded generic Admin fallbacks.

This branch adds Phase-10-specific Firestore tests for owner submission authority, sensitive evidence/config immutability, unauthenticated denial, Broker KYC isolation, payment isolation and quote isolation.

## Storage

Reviewed namespaces and canonical paths:

- Owner title-deed / Emirates-ID style evidence: `owners/{ownerId}/...` and onboarding staging under `temp_kyc/{uid}/...`
- Owner property/listing photos: `home-listing-media/{ownerId}/{requestId}/...` and owner evidence paths
- Technician before/after evidence: `maintenanceTickets/{ticketId}/proofPhotos|completionPhotos|proofs` and `evidence/{ticketId}/...`
- Invoices: `invoices/{invoiceId}/...`
- Contracts/certified documents: `contracts/{contractId}/...`, staff document paths
- Broker KYC: `brokerDocuments/{brokerId}/...`, `kyc_documents`
- HR: `staffDocuments`, `hrDocuments`
- Private HR: `privateHrDocuments` (browser deny-all)

The baseline had only **3 Storage emulator tests**. This branch adds role-isolation coverage for owner identity/property documents, technician before/after proof, Broker KYC create-only metadata binding, temporary KYC, invoice access, unauthenticated access, MIME restrictions and private-HR deny-all behavior.

## Cloud Functions

Every Function must be evaluated by endpoint class:

- callable: Firebase Auth where required, claims/profile authorization, App Check except explicitly approved bootstrap exceptions, input validation, ownership binding, safe retries/idempotency for mutations, audit evidence, bounded secrets and errors;
- HTTP/webhook: method/signature/shared-secret verification and replay/idempotency controls as applicable; App Check is not a substitute for third-party webhook authentication;
- background/scheduled: event binding, idempotent/retry-safe writes, audit/error handling and service-account-only authority.

### Remediation in this branch

- Added App Check enforcement to 33 direct legacy callables in `functions/index.ts`.
- Added App Check enforcement to direct callables in QR security, contract activation, owner handover inspection, onboarding proof upload and Phase-1 profile workflows.
- Added `tests/launch/phase-10-firebase-callable-appcheck.test.mjs`, which scans directly configured exported callables and fails on any unapproved omission.
- Approved exceptions are restricted to:
  - `ownerOnboarding.ts:upsertOwnerOnboardingProfile`
  - `publicRoleAssignment.ts:assignPublicPortalRole`
  
  Both exceptions are required to remain explicit as `enforceAppCheck: false` and retain their bounded-auth rationale. Neither may create privileged/Admin authority.

## App Check

| Platform | Result |
| --- | --- |
| Web | PASS (source) — production requires App Check and site key; reCAPTCHA Enterprise/v3 supported; failure is fatal in production. |
| Android | PASS (source) — native Play Integrity bridge exists and the Android release has a dedicated verification gate. |
| iOS | **BLOCKED** — no native Firebase App Check provider/configuration exists in the reviewed baseline. |

The branch contains shared-WebView preparation for an iOS native App Check provider, but Phase 10 remains blocked until the native provider is actually provisioned and verified. A partial bridge must not be treated as evidence.

## External prerequisites that cannot be fabricated in code

Before Phase 10 may be marked green:

1. Register/confirm the production Firebase **iOS app** for bundle `ae.bingroups.superapp` and provide its protected iOS Firebase configuration.
2. Enable Firebase App Check for that iOS app using **App Attest** (DeviceCheck fallback only if deliberately approved), then prove a real release/device token is accepted while missing/invalid attestation is rejected.
3. Configure **Sign in with Apple** in Apple Developer + Firebase Auth with the production identifiers/keys, then run account-linking/login/error/revocation tests.
4. Run the full Firestore + Storage emulator suite and the Phase-10 callable App Check regression on the exact PR SHA.
5. Verify production App Check enforcement independently for Web, Android and iOS before merging.

## Merge rule

Phase 10 may be merged only when every Phase-10 test and existing repository/launch/security check is green **and** the protected iOS/Apple prerequisites above have real evidence. Do not mark Phase 10 complete based on source changes alone.
