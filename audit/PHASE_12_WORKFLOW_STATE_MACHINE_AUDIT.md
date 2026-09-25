# Phase 12 — Canonical Workflow / State-Machine Audit

Baseline: `main@98ed9788881c6880f16a4e5719cf1d4489722f7c`

## Authority contract

Phase 12 establishes one canonical uppercase lifecycle vocabulary per operational domain. New writes must use canonical values. Legacy spellings and former pseudo-states are accepted only through normalization on reads/migrations and legacy query compatibility.

The canonical registry is identical in:
- `functions/workflowStateMachines.ts`
- `src/lib/workflowStateMachines.ts`
- `packages/shared/src/workflowStateMachines.ts`

Sensitive server mutations use transition assertions before writing. Firestore client rules either deny lifecycle writes entirely or allow canonical values only.

## Canonical state machines

### Property
`DRAFT → UNDER_REVIEW ↔ CHANGES_REQUESTED → PENDING_PROPERTY_INSPECTION → READY_FOR_SITE_VISIT → INSPECTION_IN_PROGRESS → INSPECTION_COMPLETED → QUOTE_READY → CONTRACT_PENDING → PAYMENT_PENDING → APPROVED/ACTIVE`

Terminal/control states: `REJECTED`, `SUSPENDED`, `CANCELLED`.

The production payment-approval transaction may promote `PAYMENT_PENDING → ACTIVE` atomically after every inspection, quote, contract, payment-policy and receipt prerequisite is revalidated in the same transaction.

### Ticket
`OPEN → PENDING_ASSIGNMENT/PENDING_SCHEDULING → SCHEDULED/ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → WAITING_PARTS/COMPLETED_PENDING_APPROVAL → COMPLETED → TENANT_APPROVED → CLOSED`

Control states: `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED`, `CANCELLED`, `ESCALATED`, `REOPENED`, `ON_HOLD`, `DISPUTED`, `REJECTED`.

Emergency is priority/category metadata, not a lifecycle status. `AUTO_ASSIGNED`, `REASSIGNED`, `ON_THE_WAY`, `WORK_STARTED`, `RESOLVED` and lowercase equivalents are read-only aliases.

### Inspection
`PENDING → READY_FOR_SITE_VISIT → ASSIGNED → IN_PROGRESS → EVIDENCE_RECORDED → COMPLETED → OWNER_REVIEW/APPROVED`

Correction paths: `REINSPECTION_REQUESTED`, `REJECTED`, `CANCELLED`.

### Payment
`PENDING → PARTIALLY_PAID/OVERDUE → APPROVED`

Failure/control states: `REJECTED`, `FAILED`, `CANCELLED`, `REFUND_PENDING → REFUNDED`.

Legacy `PAID`, `VERIFIED`, `SETTLED`, `RECONCILED` and admin-verification variants normalize to canonical states for reads only.

### Quote
`DRAFT → READY → PRESENTED → ACCEPTED → ENGINEER_REVIEW`

Control states: `REJECTED`, `EXPIRED`, `SUPERSEDED`.

Payment-stage names such as `DEPOSIT_PENDING` are no longer quote lifecycle writes.

### Contract
`DRAFT → PENDING_OWNER_SIGNATURE → SIGNED → PENDING_PAYMENT → ACTIVE`

Control states: `SUSPENDED`, `CANCELLED`, `EXPIRED`, `TERMINATED`.

### Tenant link
`PENDING_ADMIN_REVIEW → APPROVED/REJECTED/CANCELLED`

### Broker KYC
`NOT_SUBMITTED → PENDING_REVIEW ↔ CHANGES_REQUESTED → APPROVED`

Control states: `REJECTED`, `EXPIRED`, `SUSPENDED`.

Legacy `VERIFIED` normalizes to `APPROVED`; `INCOMPLETE` is replaced by `CHANGES_REQUESTED` for new writes.

### Technician job
`PENDING_ASSIGNMENT → ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → WAITING_PARTS/EVIDENCE_RECORDED → COMPLETED`

Terminal: `CANCELLED`.

Technician-job lifecycle shares canonical ticket milestones but remains a separately named domain so dispatch-specific transitions can be validated without broadening ticket authority.

### Onboarding
`DRAFT → ACCOUNT_CREATED → PROPERTY_DETAILS_COMPLETE → DOCUMENTS_PENDING → UNDER_REVIEW ↔ CHANGES_REQUESTED → INSPECTION_REQUIRED → INSPECTION_IN_PROGRESS → QUOTE_READY → CONTRACT_SELECTED → SIGNATURE_PENDING → PAYMENT_PENDING → PAYMENT_PROCESSING → PAYMENT_CONFIRMED → APPROVED → ACTIVE`

Control states: `REJECTED`, `EXPIRED`, `SUSPENDED`.

Where production activation is intentionally atomic, a validated server transaction may advance directly from a payment-ready state to `ACTIVE`; no browser is allowed to perform that transition.

## Firestore authority

- `payment_transactions`, Broker KYC private records, design quotes and operational evidence remain server-write-only where already protected.
- Owner property lifecycle fields remain immutable to Owner browser updates.
- Tenant unit-link browser create requires canonical `PENDING_ADMIN_REVIEW`; resolution is server-authoritative.
- Maintenance-ticket browser status changes are restricted to the canonical ticket vocabulary. Legacy/lowercase aliases cannot be newly written.
- Owner-created contract/property drafts use canonical `DRAFT`; Owner contract updates are restricted to non-privileged canonical states.
- Rule-generation scripts are aligned so CI cannot regenerate legacy ticket policies.

## Compatibility rule

Aliases are intentionally centralized in `ALIASES`. Consumers normalize existing data before business decisions. Compatibility query values may still include old stored values while migration is incomplete, but application code must never persist those aliases as new lifecycle state.

## Regression evidence

`tests/launch/phase-12-workflow-state-machines.test.mjs` verifies:
- identical backend/root/shared registries;
- canonical Owner/property/onboarding writes;
- payment/quote/contract transition authority;
- tenant-link and Broker-KYC transition assertions;
- ticket/technician canonical writes and Firestore rule enforcement;
- server-only state authority;
- query/filter/report normalization;
- legacy compatibility boundaries.

Phase 12 does not weaken App Check, MFA, inspection, GPS, payment, exact-SHA, frozen-release, or HARD_CLEARANCE controls.
