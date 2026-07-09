# BIN GROUP Launch Gate Single Source of Truth

This file prevents false green launch status. It is the operational truth table for controlled pilot, public beta, and full commercial launch.

## Status levels

### Controlled pilot

Allowed audience: trusted friends, internal team, selected owners, selected tenants, selected technicians, selected brokers.

Allowed only when:

- Main app deploy is reachable.
- Admin panel deploy is reachable.
- Firebase Auth works for all five roles.
- Firestore rules do not expose cross-role data.
- Tenant can create a maintenance request.
- Technician can accept and complete a test mission.
- Owner can see activation state and approvals.
- Admin can see payments, tickets, owners, technicians, and launch gates.
- Broker can submit a lead and view attribution state.

### Public beta

Allowed audience: limited public users, still with manual oversight.

Allowed only when controlled pilot is passed plus:

- Stripe or approved UAE payment workflow is verified in the intended mode.
- Firebase App Check is configured and tested for production web origins.
- Branded sender email is verified.
- Admin credentials are rotated and documented privately.
- 5-role live smoke test passes on production hosting.
- Public terms, privacy, support, refund, and emergency disclaimers are visible.
- Admin can disable unsafe user accounts or service areas.

### Full commercial launch

Allowed audience: market-wide promotion and commercial onboarding.

Allowed only when public beta is passed plus:

- Payment proof, invoices, contract PDFs, and owner activation are end-to-end verified.
- Technician close workflow requires evidence and notes.
- SLA tracking has one canonical policy across tenant app, admin, and functions.
- Owner reports and financial views use real production data.
- Broker attribution and commissions have backend source-of-truth records.
- Production incident response owner is assigned.
- Backup, restore, and export process is tested.

## Non-negotiable blockers

The app must not be called full-launch ready if any of these are missing:

- Live payment route or verified manual bank transfer route.
- Production App Check enforcement proof.
- Branded email sender proof.
- Admin password rotation proof.
- Five-role smoke test result.
- Firestore rules pass.
- Storage rules pass.
- Functions deploy pass.
- Main app deploy pass.
- Admin deploy pass.

## Current truth for this PR

This PR improves runtime UX and command surfaces, but it does not by itself prove full commercial launch readiness.

Current PR completion:

- Tenant Simple Mode: added and routed.
- Owner Simple Mode: added and routed.
- Technician Simple Mode: added and routed.
- Broker Simple Mode: added and routed.
- Admin Simple Command: added and made the admin dashboard entry point.
- Tenant canonical SLA creation: added.
- Owner live command counts: added.

Still required before full commercial launch:

- Build and CI validation.
- Production deploy validation.
- App Check proof.
- Payment proof.
- Branded sender proof.
- Admin credential rotation proof.
- Five-role live production smoke test.
- Backend SLA aggregation and reports.
- Broker attribution source-of-truth backend.
- Collection naming migration plan and execution.
