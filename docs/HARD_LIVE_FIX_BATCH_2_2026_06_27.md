# Hard-Live Fix Batch 2 — 2026-06-27

Branch: `fix/role-service-homepage-hard-live`

## Fixed in this batch

### Owner money / rent collection

- Fixed the Owner Money Snapshot rent submission path.
- Before this batch, the rent dialog wrote a `payment_transactions` record but skipped the parent ledger callback using `void onRecordRentPayment`.
- Now rent submission writes:
  - `payment_transactions/{recordId}` for admin payment verification.
  - `tenant_ledger/{recordId}` through the parent callback.
  - `audit_logs/audit_{recordId}` through the parent callback.
  - owner rent-payment notification reference.
- Added file reference fields to the rent payload type:
  - `referenceFileUrl`
  - `referenceFilePath`
  - `referenceFileName`
- The ledger detail drawer can display payment method, payment reference, reference file, transaction ID, ledger ID, review note, return reason, paid amount, and balance.

### Owner ROI rent setup CTA

- Fixed the ROI card rent setup action.
- The old flow could still fall back to an alert-style callback.
- The Add Rent Income button now scrolls to the real Owner Money Snapshot rent form.

### Broker dashboard

- Fixed a dead broker launcher route.
- `Add New Lead` previously routed to `/broker/leads/new`, but the Broker router exposes `/broker/leads` and not `/broker/leads/new`.
- The launcher now routes to `/broker/leads`.
- Added a visible Broker Attribution Rule panel explaining that broker lead/referral/tenant-placement/contract-handoff records must retain:
  - `brokerId`
  - `brokerUid`
  - `brokerEmail`
  - `attributionId`
  - source type
  - linked lead / contract / property
  - admin review status
- Recent leads now show attribution ID when available.

## Already confirmed in codebase while checking this batch

### Admin Dashboard

The admin dashboard already contains major hard-live controls:

- Real action queue for owner intake, technician approval, payment proof, and broker commission.
- Review buttons wired to destination routes.
- Launch health rows for main app, admin panel, owner portal, functions, Firestore rules, Storage rules, App Check, payment verification, broker ops, and document vault.
- SLA breach and near-breach calculation.
- Payment review queue.
- Broker commission queue.
- Document expiry count from Firestore data.
- Listener warning banner when streams fail.
- No fake mission property fallback; it shows `Property not linked` when data is missing.

### Owner Dashboard

The owner dashboard already contains:

- Pending Payments KPI.
- Pending Owner Approvals KPI.
- Permission-warning banner for partial reads.
- Owner Money Snapshot with rent due, rent collected, balance, collection rate, pending verification, and overdue tenants.
- Tenant ledger table and details drawer.
- Real rent record form.

### Tenant Dashboard

The tenant dashboard already contains:

- A no-call workflow strip: report issue → track technician/status → approve/dispute proof.
- Active ticket listeners using tenant ID, requester ID, email, unit ID, and property ID.
- Lease/payment/document panel.
- Move-In / Move-Out route exists in `TenantApp`.

### Broker Portal

The broker portal already contains:

- Leads route.
- Referrals route and new referral route.
- Commissions route.
- Documents route.
- Attribution proof route.
- Lead creation with broker attribution packet.
- Lead conversion creating pending broker commission record.

## Still left after this batch

These are not fully fixed yet in this branch:

1. Owner move-in / move-out owner-side review page and storage owner-read rules.
2. Owner ticket row actions: approve, dispute, request revisit, escalate, download evidence pack.
3. Tenant dashboard service button should route Move-In / Move-Out directly to `/tenant/move-inspection/move-out` instead of documents handover filter.
4. Admin staff access actions should also write `audit_logs` records for every role/module/status change.
5. Admin property approval should write both `auditLogs` and `audit_logs` and support `request more documents`.
6. Contract value review/override panel still needs a dedicated admin UI.
7. PDFs still need one-click exports from every relevant dashboard location.
8. Public launch health must be fed by real smoke-test documents, not only dashboard summary fields.

## Verification note

Changes were made through the GitHub connector. Local build/test commands were not executable from this connector session. CI should run:

```bash
npm run typecheck
npm run build
npm run build:admin
npm run test:hard-launch-readiness
```
