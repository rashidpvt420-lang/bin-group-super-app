# BIN GROUP Contract Renewal, Expiry Notification & PDF System

Date: 2026-06-27
Status: implementation file added, index export still must be wired before deploy

## Purpose

This system makes the app remember every contract, lease, tenant occupancy, renewal deadline, document, and expiry event before it becomes a problem.

It is designed for all five profiles:

1. Owner / Landlord
2. Tenant
3. Technician
4. Broker / Real Estate
5. Admin / Staff

The core rule is simple:

> No contract, lease, payment plan, document, tenant stay, broker attribution, or handover should expire silently.

## New backend file

Added:

`functions/contractRenewalPdfSystem.ts`

It includes:

- `runContractRenewalWatch` scheduled function.
- `rebuildContractRenewalWatch` admin callable.
- Contract/lease expiry scanning.
- Renewal milestone detection.
- PDF generation request creation.
- Notification creation for all relevant profiles.
- Email outbox creation.
- Audit log creation.
- System health update.

## Renewal reminder milestones

The system watches these days before expiry:

- 120 days
- 90 days
- 60 days
- 45 days
- 30 days
- 14 days
- 7 days
- 3 days
- 1 day
- 0 days / expiry day

It also keeps overdue records visible up to 30 days after expiry.

## Data collections scanned

The renewal engine checks:

- `contracts`
- `leases`
- `tenant_ledger`
- `propertyPassports`

It reads these expiry/date fields when available:

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

### 1. Renewal watch records

Collection:

`contract_renewal_watch`

Each milestone produces a deterministic record ID:

`{sourceCollection}_{sourceId}_{milestoneDays}d`

This prevents duplicate reminders.

### 2. Notifications

Collection:

`notifications`

Each relevant user gets a notification with:

- title
- body
- role
- link
- contract ID
- lease ID
- property ID
- unit ID
- expiry date
- days remaining
- milestone days
- source record

### 3. Email outbox

Collection:

`mail`

Used for branded email delivery when the email provider is connected.

### 4. PDF generation records

Collection:

`document_generation_requests`

Type:

`CONTRACT_RENEWAL_NOTICE_PDF`

The system tries to call the existing `generateContractPDF` engine. If PDF generation fails, it still stores a pending generation record so Admin can see the issue.

### 5. Audit logs

Collection:

`audit_logs`

Action:

`CONTRACT_RENEWAL_MILESTONE_PROCESSED`

## What each profile receives

### Tenant

Tenant receives:

- Contract expiry reminder.
- Rental renewal notice.
- Lease/rent terms reminder.
- Document renewal action.
- Move-out / renew decision reminder.
- Link to tenant documents/payment area.

Tenant should know before one year is completed that renewal is coming.

### Owner / Landlord

Owner receives:

- Tenant lease expiry reminder.
- Renewal decision reminder.
- Rent collection / pending balance warning.
- Contract PDF / renewal notice record.
- Approval action reminder.
- Link to owner contracts.

### Admin

Admin receives:

- All expiry and renewal risk notices.
- Missing PDF generation warnings.
- Overdue contract/lease alerts.
- Tenant/owner/broker link visibility.
- Audit trail.

### Broker / Real Estate

Broker receives:

- Renewal/new contract attribution warning when broker ID or email is linked.
- Commission-attribution chain reminder.
- Link to attribution page.

### Technician

Technician receives:

- Only when linked to a handover, inspection, or renewal-related maintenance task.
- Useful for move-out inspection, condition report, preventive visit, or handover readiness.

## Required export wiring before deploy

The connector allowed the new implementation file to be added, but branch creation and safe index patching were blocked.

Before deploying Functions, add this line near the top-level exports in `functions/index.ts`:

```ts
export { runContractRenewalWatch, rebuildContractRenewalWatch } from "./contractRenewalPdfSystem";
```

Without this line, Firebase Functions will not deploy the new scheduled/callable functions from the new file.

## Required Firestore index checks

Likely no new composite indexes are needed because the first implementation scans limited records from the four collections.

For large production scale, replace broad scans with indexed queries:

- `contracts.expiryDate`
- `contracts.contractEndDate`
- `leases.leaseEndDate`
- `propertyPassports.contractEndDate`
- `tenant_ledger.leaseEndDate`
- `renewalStatus`

## Required Admin dashboard additions

Add a Renewal Watch panel to Admin Dashboard:

- Contracts expiring in 120/90/60/30/7/1 days.
- Tenant leases expiring.
- Owner decisions pending.
- Renewal PDFs generated.
- PDF generation failed/pending.
- Notifications sent.
- Overdue renewals.

Data source:

`contract_renewal_watch`

## Required Owner dashboard additions

Add card:

`Renewals & Expiry`

Show:

- Tenant leases expiring soon.
- Property contracts expiring soon.
- Renewal decision status.
- PDF notice download.
- Approve renewal / request change / mark non-renewal.

## Required Tenant dashboard additions

Add card:

`My Rental Renewal`

Show:

- Lease start date.
- Lease end date.
- Days remaining.
- Renewal status.
- Download renewal PDF.
- Renew / Move out / Contact BIN GROUP.

## Required Broker dashboard additions

Add card:

`Renewal Attribution`

Show:

- Renewal contracts tied to broker.
- Attribution locked / missing.
- Commission pending after renewal.

## Required Technician dashboard additions

Add card only when relevant:

`Handover / Renewal Tasks`

Show:

- Upcoming move-out inspection.
- Move-in/move-out proof requirement.
- Preventive check before renewal.

## Required PDF types for every user

The app should generate or request these PDFs:

### Owner

- Owner contract PDF.
- Renewal notice PDF.
- Monthly owner statement.
- Rent collection statement.
- Maintenance evidence pack.
- Property passport report.
- Handover/damage settlement PDF.

### Tenant

- Lease agreement PDF.
- Lease renewal notice PDF.
- Rent receipt PDF.
- Payment ledger PDF.
- Move-in report PDF.
- Move-out report PDF.
- Maintenance completion proof PDF.

### Technician

- Job completion report PDF.
- Before/after evidence report PDF.
- Monthly job summary PDF.
- Attendance/payroll/payslip PDF.

### Broker

- Referral proof PDF.
- Contract attribution PDF.
- Commission statement PDF.
- Payout statement PDF.

### Admin

- Audit report PDF.
- SLA breach report PDF.
- Renewal risk report PDF.
- Compliance export PDF.
- Launch readiness report PDF.

## Deploy checklist

1. Add export line to `functions/index.ts`.
2. Run `npm --prefix functions run build`.
3. Run full app build.
4. Deploy Functions.
5. Open Admin dashboard and run `rebuildContractRenewalWatch` once.
6. Confirm `contract_renewal_watch` records are created.
7. Confirm `notifications` records are created for tenant, owner, admin, broker where linked.
8. Confirm `document_generation_requests` records are created.
9. Confirm email outbox `mail` records are created.
10. Confirm audit events are written.

## Hard-live rule

Do not mark this green until a real tenant lease expiring inside 120 days produces:

- Tenant notification.
- Owner notification.
- Admin notification.
- Renewal watch record.
- PDF generation record.
- Audit log.
