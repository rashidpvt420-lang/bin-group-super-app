# BIN GROUP Super App — Launch Consolidation Audit

Date: 2026-07-10  
Branch: `launch-consolidation-2026-07-10`  
Repo: `rashidpvt420-lang/bin-group-super-app`

## Decision

The software route ownership has been consolidated, but the app must remain **NO-GO for unrestricted hard public launch** until live production evidence is recorded for the external gates in `launch_package/hard-launch-readiness.json`.

The correct current launch state remains controlled pilot / verification mode because the hard-launch register still contains required gates with `external_verification_required`.

## What was fixed in this pass

### 1. Legacy admin panel stopped acting like a second app

File changed: `apps/admin-panel/src/App.tsx`

- Converted the legacy admin-panel bundle into a manual handoff shell.
- Removed automatic redirect behavior.
- Removed timer-based redirect risk.
- Stated that the canonical admin route is `/admin/dashboard` in the main app.
- Prevents operators from editing old admin routes and thinking they are changing the real launch command center.

### 2. Legacy owner app stopped acting like a second Super App

File changed: `apps/owner-app/src/App.tsx`

- Replaced the stale standalone owner-app router with a manual handoff shell.
- Removed old duplicate ownership over tenant, technician, broker, and owner routes.
- Preserved path handoff to the canonical main app.
- Blocks the confusion where a dashboard fix lands in `apps/owner-app` but production users are actually served from `src/owner/OwnerApp.tsx`.

### 3. Canonical admin dashboard now includes the missing command coverage

File changed: `src/admin/AdminTerminal.tsx`

Added merged operational coverage for:

- Owner activation
- Tenant operations
- Technician dispatch
- Broker attribution
- Open SLA load
- Payment review
- Launch evidence gates
- Route consolidation state

Also added:

- Canonical SLA policy display from `CANONICAL_SLA_POLICY`
- Workflow ownership map tied to launch gates
- Route consolidation guard in the admin verification runbook
- Clear warning that hard public launch is blocked until evidence gates pass

### 4. Role quick-action panel contrast fixed across dashboards

File changed: `src/components/RoleQuickActionsPanel.tsx`

- Fixed light/dark dashboard contrast issues.
- Owner, Technician, and Broker dashboards now use a readable light-panel surface.
- Tenant/Admin dark portals keep dark-surface behavior.

### 5. Route consolidation guard added

File added: `scripts/verify-route-consolidation.mjs`

This script blocks future confusion by checking that:

- Main app owns all five profile route shells.
- `/owner-dashboard` and `/dashboard` redirect to `/owner/dashboard` instead of separate dashboard files.
- Owner, Tenant, Technician, and Broker simple dashboards are the default entry points.
- Full dashboards remain available only under `/dashboard/full`.
- Legacy admin-panel and owner-app are handoff-only.
- The launch register cannot claim `PUBLIC_LAUNCH_READY` while required external gates still need evidence.

### 6. Hard launch test chain updated

File changed: `package.json`

Added:

```bash
npm run test:route-consolidation
```

Updated:

```bash
npm run test:hard-launch-readiness
```

Now hard-launch readiness runs route consolidation first, then the existing hard-launch and profile evidence checks.

## Canonical route ownership after consolidation

| Area | Canonical file |
|---|---|
| Main shell | `src/App.tsx` |
| Owner portal | `src/owner/OwnerApp.tsx` |
| Tenant portal | `src/tenant/TenantApp.tsx` |
| Technician portal | `src/technician/TechnicianApp.tsx` |
| Broker portal | `src/broker/BrokerApp.tsx` |
| Admin command center | `src/admin/AdminTerminal.tsx` |
| Legacy admin-panel | `apps/admin-panel/src/App.tsx` handoff only |
| Legacy owner-app | `apps/owner-app/src/App.tsx` handoff only |

## Dashboard status by profile

### Owner

Canonical entry: `/owner/dashboard`  
File: `src/owner/pages/OwnerSimpleDashboardPage.tsx`

Status:

- Simple dashboard is the default.
- Full dashboard remains at `/owner/dashboard/full`.
- Owner activation guard remains active in `src/owner/OwnerApp.tsx`.
- Legacy units page is explicitly moved behind `/owner/legacy-units`.

Launch-critical checks still needed live:

- Onboarding → contract → payment proof → admin approval → dashboard unlock.
- IBAN, documents, units, tenants, approvals, property passport, and tickets must be verified with production data.

### Tenant

Canonical entry: `/tenant/dashboard`  
File: `src/tenant/pages/TenantSimpleDashboardPage.tsx`

Status:

- Simple dashboard is the default.
- Full dashboard remains at `/tenant/dashboard/full`.
- Request, tickets, emergency, documents, payments, keys, parcels, visitor parking, marketplace, staff directory, messages, community, and renewals routes are registered.

Launch-critical checks still needed live:

- Real tenant linked to a real unit.
- Photo upload request.
- Notification delivery.
- Ticket tracking and completion verification.

### Technician

Canonical entry: `/technician/dashboard`  
File: `src/technician/pages/TechnicianSimpleDashboardPage.tsx`

Status:

- Simple dashboard is the default.
- Full dashboard remains at `/technician/dashboard/full`.
- Jobs, map, history, profile, HR, offline queue, support, and proof readiness routes are registered.

Launch-critical checks still needed live:

- Job assignment.
- Technician accept/on-site/resolve path.
- GPS and before/after evidence from a physical device.
- Closure audit trail.

### Broker

Canonical entry: `/broker/dashboard`  
File: `src/broker/pages/BrokerSimpleDashboardPage.tsx`

Status:

- Simple dashboard is the default.
- Full dashboard remains at `/broker/dashboard/full`.
- Leads, referrals, commissions, attribution, documents, and profile routes are registered.

Launch-critical checks still needed live:

- Broker lead/referral survives owner onboarding.
- Contract activation links to broker source.
- Commission is locked once with no duplicate payout record.

### Admin

Canonical entry: `/admin/dashboard`  
File: `src/admin/AdminTerminal.tsx`

Status:

- Admin dashboard is now the merged command center.
- Legacy admin-panel is handoff-only.
- Admin sees live counts, launch gates, workflow map, SLA policy, audit preview, and runbook.

Launch-critical checks still needed live:

- Rotated admin credential login.
- Payment approval and activation.
- Owner, tenant, technician, broker, ticket, audit, and notification visibility.
- Production App Check, Stripe live, branded email, and secret rotation evidence.

## Remaining hard public launch blockers

These are not code-only fixes. They require live production verification:

1. Production admin credential rotated and confirmed after hard refresh.
2. Main app login and role routing verified after hard refresh.
3. Owner onboarding, payment verification, and dashboard unlock verified end-to-end.
4. Tenant real-unit photo request and notification delivery verified.
5. Technician GPS plus before/after evidence verified on a physical device.
6. Broker commission attribution lock verified once with no duplication.
7. Admin core operational pages and evidence visibility verified.
8. Admin staff/technician creation with correct claims verified.
9. Stripe live mode, webhook, AED charge, and idempotency verified.
10. Firebase App Check production enforcement verified.
11. Admin password, secrets, and privileged access rotated.
12. Branded BIN GROUP email sender approved and tested.
13. Renewal watch and document queue verified.
14. Controlled 24–48 hour production pilot completes with no P0/P1 incident.

## Required commands before merge/deploy

Run locally from the repo root:

```bash
npm run test:route-consolidation
npm run build
npm run build:functions
npm run test:stability
npm run test:hard-launch-readiness
npm run test:mobile-store-readiness
```

Expected truth:

- `test:route-consolidation` should pass.
- `build`, `build:functions`, and `test:stability` should pass before deployment.
- `test:hard-launch-readiness` should still fail until the external production gates are recorded as passed with real evidence.

## Audit conclusion

The duplicate route/dashboard ownership problem is now addressed at the software-structure level. The remaining launch blocker is no longer “which file is real?”; it is production evidence. Do not claim full hard public launch until the hard-launch register and `system_health/admin_summaries` contain verified proof for every required gate.
