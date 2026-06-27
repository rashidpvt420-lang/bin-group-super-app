# BIN GROUP Contract Renewal, Expiry Notification & PDF System

Date: 2026-06-27
Status: implementation added and runtime export wired in `functions/runtimeAll.ts`.

## What was added

Added backend file:

`functions/contractRenewalPdfSystem.ts`

Wired deploy runtime:

`functions/runtimeAll.ts`

Runtime export:

```ts
export { runContractRenewalWatch, rebuildContractRenewalWatch } from './contractRenewalPdfSystem';
```

## Functions

- `runContractRenewalWatch`: scheduled renewal watcher.
- `rebuildContractRenewalWatch`: admin callable for manual rebuild.

## Renewal milestones

The app checks expiry at:

- 120 days
- 90 days
- 60 days
- 45 days
- 30 days
- 14 days
- 7 days
- 3 days
- 1 day
- 0 days

It also keeps recently overdue expiry records visible for review.

## Collections scanned

- `contracts`
- `leases`
- `tenant_ledger`
- `propertyPassports`

Expiry fields read:

- `contractEndDate`
- `endDate`
- `validTo`
- `expiryDate`
- `expiresAt`
- `leaseEndDate`
- `leaseEnd`
- `renewalDueAt`
- `nextRenewalDate`

## Records created

- `contract_renewal_watch`
- `notifications`
- `mail`
- `document_generation_requests`
- `audit_logs`
- `system_health/contractRenewals`

## Profile behavior

### Tenant

Tenant receives rental renewal and lease expiry reminders before the one-year stay/lease period ends. The reminder includes renewal, rent terms, documents, and move-out/renew decision context.

### Owner / Landlord

Owner receives lease expiry, renewal decision, rent/payment, approval, and renewal PDF visibility.

### Admin

Admin receives the full expiry risk queue, PDF generation status, overdue renewal risk, and audit trail.

### Broker / Real Estate

Broker receives renewal/new-contract attribution visibility when broker ID or broker email is linked.

### Technician

Technician receives renewal/handover task visibility only when linked to inspection, move-out, handover, or preventive maintenance work.

## PDF coverage required by product

Owner PDFs:

- Owner contract
- Renewal notice
- Monthly owner statement
- Rent collection statement
- Maintenance evidence pack
- Property passport report
- Handover/damage settlement

Tenant PDFs:

- Lease agreement
- Lease renewal notice
- Rent receipt
- Payment ledger
- Move-in report
- Move-out report
- Maintenance completion proof

Technician PDFs:

- Job completion report
- Before/after evidence report
- Monthly job summary
- Attendance/payroll/payslip

Broker PDFs:

- Referral proof
- Contract attribution
- Commission statement
- Payout statement

Admin PDFs:

- Audit report
- SLA breach report
- Renewal risk report
- Compliance export
- Launch readiness report

## Dashboard cards still required

Admin:

- Renewal Watch panel from `contract_renewal_watch`.

Owner:

- `Renewals & Expiry` card.

Tenant:

- `My Rental Renewal` card.

Broker:

- `Renewal Attribution` card.

Technician:

- `Handover / Renewal Tasks` card when relevant.

## Deploy verification

After build and deploy, run `rebuildContractRenewalWatch` once and confirm:

- Tenant notification
- Owner notification
- Admin notification
- Renewal watch record
- PDF generation record
- Audit log
- `system_health/contractRenewals` update
