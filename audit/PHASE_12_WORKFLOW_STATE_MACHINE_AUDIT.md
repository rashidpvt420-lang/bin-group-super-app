# Phase 12 — Canonical Workflow / State-Machine Audit

## Authority rule

New authoritative writes must use the canonical state shown here. Legacy aliases are accepted only at read/normalization boundaries for existing records. They must not be reintroduced into Firestore writes, Cloud Function primary lifecycle writes, frontend filters, reporting classifications, or security-rule create contracts.

The server and frontend canonical contracts are byte-identical:

- `functions/canonicalStateMachines.ts`
- `src/lib/canonicalStateMachines.ts`

The existing Owner onboarding machine remains canonical in lowercase because that vocabulary already has deployed compatibility. All other Phase 12 machines use uppercase canonical values.

## Canonical machines

| Domain | Canonical states |
| --- | --- |
| Property | DRAFT → UNDER_REVIEW ↔ CHANGES_REQUESTED → PENDING_PROPERTY_INSPECTION → INSPECTION_IN_PROGRESS → INSPECTION_COMPLETED → QUOTE_READY → CONTRACT_PENDING → PAYMENT_PENDING → ACTIVATION_PENDING → ACTIVE; REJECTED/SUSPENDED are explicit side states |
| Ticket | OPEN → scheduling/assignment → ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED_PENDING_APPROVAL → COMPLETED → CLOSED, with explicit WAITING_PARTS / ON_HOLD / RESCHEDULE_REQUESTED / CANCELLATION_REQUESTED / ESCALATED / DISPUTED / REOPENED / CANCELLED / REJECTED |
| Inspection | PENDING → SCHEDULED → IN_PROGRESS → SUBMITTED → OWNER_REVIEW/COMPLETED → VERIFIED, with CHANGES_REQUESTED / REINSPECTION_REQUESTED / DISPUTED / REJECTED / CANCELLED |
| Payment | NOT_DUE_UNTIL_INSPECTION_COMPLETE → PENDING_ADMIN_PAYMENT_VERIFICATION → PENDING_ADMIN_APPROVAL → APPROVED; REJECTED / FAILED / CANCELLED and future REFUND_PENDING → REFUNDED are explicit |
| Quote | DRAFT → PENDING_OPERATIONS_QUOTE → PENDING_OWNER_APPROVAL or PENDING_TENANT_APPROVAL → APPROVED → DEPOSIT_PENDING; READY / REJECTED / EXPIRED / SUPERSEDED are explicit |
| Contract | DRAFT → PENDING_OWNER_SIGNATURE → SIGNED → PENDING_ACTIVATION → ACTIVE; SUSPENDED / CANCELLED / EXPIRED / TERMINATED are explicit |
| Tenant link | PENDING_ADMIN_REVIEW ↔ CHANGES_REQUESTED → APPROVED or REJECTED; approved links can be REVOKED |
| Broker KYC | INCOMPLETE → PENDING_REVIEW → VERIFIED or REJECTED; SUSPENDED / EXPIRED are explicit |
| Technician job | ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED_PENDING_APPROVAL → COMPLETED → CLOSED, with WAITING_PARTS / ON_HOLD / CANCELLED |
| Onboarding | draft → account_created → property_details_complete → documents_pending → quote_ready → contract_selected → identity/signature/deposit/admin-review stages → approved → active, with changes_requested / rejected / expired / suspended |

## Compatibility rules

Examples of read-only aliases:

- Ticket: `AUTO_ASSIGNED → ASSIGNED`, `ON_THE_WAY → EN_ROUTE`, `WORK_STARTED → IN_PROGRESS`, `RESOLVED → CLOSED`.
- Property: `SUBMITTED_FOR_PROPERTY_INSPECTION → PENDING_PROPERTY_INSPECTION`, `AWAITING_ACTIVATION_PAYMENT → PAYMENT_PENDING`.
- Payment: `PENDING_VERIFICATION → PENDING_ADMIN_PAYMENT_VERIFICATION`, `PAID/VERIFIED/ADMIN_VERIFIED → APPROVED`.
- Contract: `PENDING_SIGNATURE → PENDING_OWNER_SIGNATURE`, `READY_FOR_ACTIVATION → PENDING_ACTIVATION`.
- Broker KYC: `APPROVED → VERIFIED`.
- Onboarding: existing fragmented values continue to normalize through the deployed lowercase machine.

## Phase 12 enforcement

The Phase 12 regression test verifies:

1. server/client canonical contracts are byte-identical;
2. all ten requested state machines exist;
3. representative legal transitions are explicit;
4. ticket aliases are outside the canonical primary state set;
5. new ticket, Broker KYC document and inspection writes use canonical values;
6. Firestore Broker document creation requires the canonical review state;
7. reporting normalizes payment and ticket aliases before classifying revenue/completion;
8. the existing onboarding resubmission rule remains `changes_requested → admin_review`;
9. Phase 1 Cash/Cheque policy wording remains consistent.

No Phase 12 change may bypass physical inspection, payment verification, App Check, MFA, GPS evidence, exact-SHA binding, or HARD_CLEARANCE.
