# BIN GROUP profile fix status

This file tracks concrete fixes landed on branch `p0-profile-fixes-v2` and the remaining launch blockers by profile.

## Landed fixes on this branch

### Admin
- Added `apps/admin-panel/src/pages/dashboard/AdminLiveDashboard.tsx`.
- Replaced `DashboardPage.tsx` with a wrapper that renders the new live dashboard.
- New dashboard includes live KPI cards, action queues, SLA breach/near-breach calculation, finance, compliance, launch-health summary, mission list, and audit activity.

### Broker
- Fixed the Broker Dashboard Add New Lead launcher so it opens `/broker/leads` instead of the missing `/broker/leads/new` route.
- Rebuilt broker referrals to create attribution codes.
- Broker referral submissions now write to `audit_logs`.
- Contract referrals now create `broker_commissions` records with linked referral ID, property ID, owner ID, contract type, rate, amount, and attribution code.
- Broker property picker now reads broker-assigned properties only through `assignedBrokerId`.

### Owner
- Removed the fake Owner ROI rent placeholder action.
- Owner ROI rent setup now scrolls to the real Owner Money Snapshot flow.
- The existing Owner Money Snapshot flow records rent into `tenant_ledger` and writes an `audit_logs` record.

## Already present in current main before this pass

### Admin
- Staff Access page exists at `/staff-access`.
- Property approval route exists at `/properties/approvals`.
- Payment approval routes exist at `/manual-approvals`, `/admin/payments`, and `/payments`.

### Owner
- Owner dashboard already has pending payments and pending approvals KPI cards.
- Owner complaint command center already exposes approve/close, dispute, request revisit, escalate, and evidence-pack export actions inside the row expansion.

### Tenant
- Tenant dashboard already has a three-step workflow strip: report issue, track technician/status, approve or dispute proof.
- Tenant header already has quick buttons for Report Issue, Emergency, Payments, and Move In/Out.

### Technician
- Technician job page already enforces before/after proof, notes, parts/materials disposition, tenant review request, and offline action queue.

## Remaining blockers

### Repository / branch
- `p0-profile-fixes-v2` is currently diverged from `main` and must be refreshed before merge.
- PR creation was blocked by the connector, so the branch exists but no new PR was opened in this pass.
- Local build was not run in this connector session.

### Admin remaining
- Staff Access should write audit logs for create, update, suspend, and restore actions.
- Property approval should be smoke-tested from pending intake to approved active property.
- Launch Health should be backed by actual CI/deploy check results, not only Firestore summary fields.
- Admin dashboard should show five-profile smoke status after deployment.

### Owner remaining
- Move-in/move-out owner review route is still missing.
- Owner handover evidence should be shown in property passport.
- Owner payment proof drilldown drawer is still missing.
- Owner dashboard needs more live listeners for contracts, invoices, leases, occupancies, and property passports.

### Tenant remaining
- Tenant dashboard service grid still points to some routes that are not active in `TenantApp.tsx`; the route-shell fix was attempted but blocked.
- Tenant should show current technician ETA/map when a ticket is assigned.
- Tenant payment receipt download needs smoke testing.

### Technician remaining
- Arrival GPS should write an explicit fallback flag when exact GPS is unavailable.
- ETA/location updates should be visible to tenant, owner, and admin.
- Offline queue needs a replay worker, not only local save.

### Broker remaining
- Broker referrals need document/proof upload for contract evidence.
- Admin commission approval/rejection workflow needs to be verified from broker submission to payout state.
- Broker owner-property lead marketplace is still missing.

### Launcher / public launch remaining
- Refresh branch against latest `main`.
- Create or update PR.
- Run main app build.
- Run admin-panel build.
- Run functions build.
- Run Firestore rules tests.
- Run five-profile smoke test: Admin, Owner, Tenant, Technician, Broker.
- Verify Arabic UI and RTL in all five profiles.
- Verify notifications and PDFs in production mode.
