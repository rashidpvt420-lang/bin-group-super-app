# BIN GROUP Super App — Launch Consolidation Audit

Date: 2026-07-10  
Branch: `launch-consolidation-2026-07-10`  
Repo: `rashidpvt420-lang/bin-group-super-app`

## Decision

The app remains **NO-GO for unrestricted hard public launch** until the production evidence gates in `launch_package/hard-launch-readiness.json` are genuinely verified.

The credentialed staging run proved that the remaining work is now split into two classes:

1. deterministic software/test defects that can be fixed in code; and
2. production/provider/device/pilot evidence that cannot be fabricated in the repository.

## Correct canonical ownership

| Area | Canonical owner |
|---|---|
| Main public and role shell | `src/App.tsx` |
| Owner portal | `src/owner/OwnerApp.tsx` |
| Tenant portal | `src/tenant/TenantApp.tsx` |
| Technician portal | `src/technician/TechnicianApp.tsx` |
| Broker portal | `src/broker/BrokerApp.tsx` |
| Main-app admin launch/evidence handoff | `src/admin/AdminTerminal.tsx` |
| Dedicated operational admin application | `apps/admin-panel/src/App.tsx` |
| Legacy owner application | `apps/owner-app/src/App.tsx` handoff only |

The dedicated admin application is not a legacy duplicate. Repository history and its operational page set show that it owns owner, tenant, ticket, technician, payment, document, audit, HR, SOS, reports, map, and operations workflows. The main-app `AdminTerminal` is the protected launch/evidence overview and handoff entry.

## Software defects fixed after credentialed staging validation

### Owner onboarding stability

File: `tests/e2e/business-owner.spec.ts`

- Uses the exact Property Location test IDs.
- Supplies and verifies valid UAE coordinates.
- Uses the enabled canonical Continue button instead of an unstable multi-button fallback.
- Removes the duplicate coordinate-save click path that caused intermittent step stalls.

### Technician workflow alignment

File: `tests/e2e/business-technician.spec.ts`

- Removed invalid mixed CSS/text Playwright selector syntax.
- Tests the canonical `/technician/jobs` and `/technician/job/:id` workflow.
- Covers assigned/open mission selection, travel, arrival, PPE/safety confirmation, start work, proof upload, and completion.
- Requires seeded tenant before-proof before mission closure.

### Broker authentication, lead creation, and audit integrity

Files:

- `tests/e2e/business-broker.spec.ts`
- `src/broker/pages/BrokerLeadsPage.tsx`

Changes:

- Adds a clear failure when broker role claims/profile do not resolve.
- Uses the real `/broker/leads/new` route and actual form controls.
- Removes direct client writes to `audit_logs` and `auditLogs`.
- Uses the server-authoritative `logUserAuditAction` bridge.
- Adds stable test IDs for lead creation.
- Verifies lead attribution and commission visibility.

### Dedicated operational admin restored

Files:

- `apps/admin-panel/src/App.tsx`
- `tests/e2e/business-admin.spec.ts`

Changes:

- Restores the dedicated authenticated admin router instead of a redirect-only shell.
- Restores operational routes for dashboard, owners, tenants, tickets, technicians, payments, documents, audit, reports, HR, SOS, map, and operations modules.
- Removes the false boot-release timer.
- Runs admin E2E against `E2E_ADMIN_BASE_URL`, not the main role-app URL.
- Adds injected service-account JSON/base64 support for server-side fixture setup.

### Five-role fixture and credential support

Files:

- `scripts/firebase-admin-bootstrap.mjs`
- `scripts/seed-live-role-test-data.mjs`
- `scripts/repair-e2e-role-claims.mjs`
- `scripts/verify-launch-gate-live.mjs`
- `scripts/verify-e2e-env.mjs`
- `.github/workflows/live-role-smoke.yml`

Changes:

- Supports GitHub Workload Identity, `GOOGLE_APPLICATION_CREDENTIALS`, or injected `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Loads `.env.e2e` inside the fixture process rather than assuming another child process can export it.
- Seeds tenant property/unit/contract data.
- Seeds technician profile and an assigned mission with tenant before-proof.
- Seeds broker profile and a deterministic commission display fixture.
- Adds a claims-only repair command that does not reset account passwords.
- Requires `E2E_ADMIN_BASE_URL` for strict five-profile audits.
- Records both main and dedicated-admin targets in proof manifests.

Fixtures are test data. Their existence is not accepted as hard-launch production proof.

## Route guard

`scripts/verify-route-consolidation.mjs` now enforces:

- Owner, Tenant, Technician, and Broker routes remain in the main app.
- The main-app admin route remains a protected launch/evidence handoff.
- The dedicated admin application retains its real operational router.
- The legacy owner application remains handoff-only.
- No admin auto-redirect or false boot-release timer is allowed.
- The launch register cannot claim `PUBLIC_LAUNCH_READY` while required external evidence is pending.

## Verified staging results already obtained

- Tenant request creation with photo: PASS.
- Tenant completed-work approval: PASS.
- Arabic/English RTL toggle: PASS.
- Google Maps integration: PASS.

These results should be preserved with timestamp, staging URLs, commit SHA, and Playwright artifacts. They must not be represented as production proof unless the hard-launch evidence policy explicitly accepts staging evidence for that gate.

## Remaining live hard-launch blockers

1. Production admin credential works after hard refresh.
2. Main login and role routing work after hard refresh.
3. Owner onboarding → payment verification → admin approval → dashboard unlock.
4. Tenant real-unit request, production upload, and notification delivery.
5. Technician real-device GPS plus before/after evidence.
6. Broker attribution survives contract activation and locks one non-duplicated commission.
7. Admin core operational workflows and staff creation work in production.
8. Payment remains locked until explicit admin approval and activates exactly once.
9. Stripe live AED charge, signed webhook, amount verification, and idempotency.
10. Firebase App Check production enforcement.
11. Admin credentials, service secrets, and privileged access rotation.
12. Approved BIN GROUP branded sender delivery.
13. Renewal watch, document queue, and notification evidence.
14. Controlled 24–48 hour production pilot with no P0/P1 incident.

## Required verification after this correction

```bash
npm run test:route-consolidation
npm run build
npm run build:functions
npm run build:admin
npm run test:stability
npm run typecheck
npm run lint
npm run test:mobile-store-readiness
npm run test:e2e:env
npm run test:e2e:business
npm run launch:blockers
npm run test:hard-launch-readiness
```

Expected truth:

- All software/build/type/lint/staging workflow checks should pass after credentials and fixtures are available.
- `launch:blockers` and `test:hard-launch-readiness` must remain NO-GO until accepted production evidence exists for every required gate.

## Audit conclusion

The staging run exposed real defects that a static green build could not detect. Those deterministic defects have been corrected on the PR branch. The launch register must remain `CONTROLLED_PILOT_ONLY` until the production evidence chain is completed without manual status fabrication.
