# BIN GROUP Public Launch Remediation

Generated after repository audit.

## Status

The app is closer to a controlled pilot than a hard public launch. The tenant dashboard crash blocker has been patched in `src/tenant/pages/TenantDashboardPage.tsx` by replacing unsafe `t(...)` usage with `tx(...)` fallbacks.

## Fixed in this pass

- Tenant dashboard no longer references an undefined `t` translator.
- Tenant dashboard user-facing labels in the affected sections now use `tx(key, fallback)` so Arabic/RTL fallback behavior is safer.
- Temporary write probe was neutralized and should be removed manually if visible because the connector blocked direct delete.

## Remaining engineering blockers before public launch

### 1. Admin Live Map must become production telemetry

Current risk: the map page has live Firestore reads, but several UI metrics and map labels are still presentation/demo values. Before public launch:

- Replace static values such as daily AI savings, autonomous dispatch totals, SLA health, forensic sync uptime, and cluster names with derived values from Firestore.
- Show a clear empty state when no GPS is available.
- Show stale GPS warnings when technician location age exceeds the approved freshness window.
- Calculate technician distance/ETA from real coordinates, not fixed `N/A` or decorative labels.
- Remove any wording that implies AI/autonomous routing unless the matching Cloud Function executed the assignment.

### 2. HR module must not expose hardcoded payroll

Current risk: HR page contains a payroll generation path with hardcoded period/salary/allowance/overtime fallback values. Before launch:

- Pull pay period, base salary, allowances, overtime, and deductions from staff payroll records.
- Disable payroll generation if required payroll fields are missing.
- Complete Attendance & Leave tab.
- Complete HR Documents tab.
- Add audit logging for payroll generation.

### 3. Broker module must be hardened

Before public broker onboarding:

- Add RERA/license verification status and block commission activation until verified.
- Add payout approval/proof workflow.
- Add Firestore listener error states to all broker dashboard feeds.
- Add empty states for leads, referrals, and commissions.

### 4. Arabic/RTL completion gate

The app has strong RTL infrastructure, but a word-by-word Arabic QA pass is still required:

- Owner dashboard.
- Tenant dashboard.
- Technician dashboard.
- Broker dashboard.
- Admin dashboard.
- PDF output.
- Toasts, empty states, validation messages, and error states.

### 5. Live Firebase E2E gate

Run and pass these commands before inviting external users:

```bash
npm run test:launch-clearance
npm run test:runtime-audit
npm run test:e2e:business
npm run test:e2e:launch-audit:live
```

Manual pilot checklist:

1. Owner signs up and pays/marks contract verified.
2. Tenant logs in and creates maintenance request.
3. Technician accepts job.
4. Technician moves to EN_ROUTE and GPS permission is granted on mobile.
5. Admin Live Map shows technician location from Firestore.
6. Technician uploads before/after proof.
7. Tenant approves completion.
8. Owner sees ticket completion and audit trail.
9. Broker dashboard loads without permission errors.
10. Admin logout and role protection work across all portals.

## Pilot recommendation

Proceed only with a controlled friend/family pilot after build and E2E pass. Do not advertise it as a public UAE production launch until the remaining blockers above are closed.
