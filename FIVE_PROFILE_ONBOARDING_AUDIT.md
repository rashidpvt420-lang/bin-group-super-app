# BIN GROUP Five-Profile and Property-Onboarding Audit

Audit baseline: `main` after PR #305.

## Executive status

Launch status remains **NO-GO**. All five roles have routed profile surfaces and Arabic/RTL foundations, but several workflows still depend on client-side profile writes or incomplete server authority.

## Admin profile

Implemented:

- Admin-only `/profile` route.
- Firebase Auth identity and custom claims.
- MFA enrollment visibility.
- Server-registered security sessions.
- Revoke-all-session control.
- Emergency self-lock.
- Arabic and RTL rendering.

Missing before launch:

- Live MFA enrollment/recovery journey and protected E2E evidence.
- Recovery-code or approved fallback process.

## Owner profile

Implemented:

- Identity, company/portfolio, billing contact, notification language and password recovery.
- Arabic and RTL.
- Separate IBAN/payout-account workflow.

Missing before launch:

- Phone changes require OTP verification.
- Billing identity must be matched server-side against approved KYC/legal identity.
- Sensitive billing changes require immutable audit history.

## Tenant profile

Implemented:

- Identity, emergency contact, password recovery and assigned-residency summary.
- Arabic and RTL.

Critical defect:

- The profile selects `unitSnap.docs[0]`; it does not render all active and historical units/leases.

Missing before launch:

- Multi-unit and historical lease timeline.
- Unit-link correction with owner/admin review, rejection reason and immutable audit events.
- OTP verification for phone changes.

## Technician profile

Implemented:

- Identity, trade, service-zone preference, emergency contact, duty-derived availability display and password recovery.
- Availability switch is correctly non-editable in the profile.
- Arabic and RTL.

Critical defect:

- Dispatch authority still does not uniformly reject missing or expired credentials on the server.

Missing before launch:

- One server-authoritative gate combining certificate expiry, medical/driving documents, duty status, GPS/device readiness, shift readiness and workload capacity.
- Enforcement before assignment, accept, en-route, arrival, start and completion.

## Broker profile

Implemented:

- Callable-only KYC submission.
- Private KYC vault for identity, licence and bank data.
- Versioned commission terms and server submission hash.
- RERA and payout-readiness display.
- Arabic and RTL.

Missing before launch:

- OTP-backed agreement-signature evidence.
- Withdrawal MFA.
- Immutable payout/withdrawal history visible to Broker and Finance/Admin.

## Property onboarding

Implemented:

- Eleven internal steps grouped into five visible stages.
- Account creation occurs before title-deed OCR and asset intake.
- Safe interrupted-session persistence stores only step and intake ID.
- Multi-property store model and monthly/quarterly/annual plan fields.
- Server-loaded AED payment configuration.
- 15% activation-deposit calculation.
- Versioned payment configuration and hash.
- Mosque-specific verified-facts workflow.
- Arabic shell, Asset/Mosque and payment blocking copy.

Missing before launch:

- Server quote must include `issuedAt`, `expiresAt` and quote version and reject expired submissions.
- Contract-plan mapping must be server-validated for `FM_ONLY`, `PM_ONLY` and `BOTH`.
- Full English and Arabic protected Playwright journey from account creation through payment submission.
- Production payment configuration and beneficiary data must be verified in the deployed environment.

## Required launch sequence

1. Restore and retain fully green CI on every exact PR head.
2. Implement Technician server compliance enforcement.
3. Implement Tenant multi-unit/history and correction workflow.
4. Add Owner OTP and billing/KYC authority.
5. Add Broker withdrawal MFA and payout history.
6. Add quote expiry and plan-mapping authority.
7. Run five-role English/Arabic protected Playwright journeys.
8. Validate production payment configuration.
9. Deploy through protected Firebase release workflow.
10. Run post-deployment smoke, authorization and audit-evidence checks.
