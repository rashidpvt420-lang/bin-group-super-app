# Full Five-Profile Audit

**Original audit date:** 15 July 2026
**Source branch:** `main`
**Source binding:** The exact commit is supplied by the protected CI or deployment workflow. This document intentionally does not embed a fixed SHA.
**Decision:** **HARD PUBLIC LAUNCH = NO-GO** until protected operational evidence is produced for one exact SHA.

## Audited surfaces

| Surface | Entry | Authority boundary |
|---|---|---|
| Owner onboarding | `/onboarding/*` | Server quote, signature evidence and callable payment package |
| Owner portal | `/owner/*` | Complete activation policy plus owner and property binding |
| Tenant portal | `/tenant/*` | Tenant identity or verified residence binding |
| Technician portal | `/technician/*` | Approved technician claims and server lifecycle transactions |
| Broker portal | `/broker/*` | Broker identity binding and server-authored commission state |
| Admin status bridge | `/admin/*` | Read-only status surface |
| Admin operations console | `apps/admin-panel` | Privileged claims, App Check and callable mutations |
| Firebase backend | `functions/`, rules, Storage | Server authority for payments, access, dispatch and audit evidence |

## P0/P1 repairs covered by the audit

- Privileged and financial browser-write paths are closed.
- Owner activation, signature and payment evidence are server-authoritative.
- Tenant service and physical-access flows use validated server operations.
- Technician assignment and lifecycle changes are transactional.
- Suspended or disabled accounts are revoked across Auth, rules and privileged functions.
- Payment mismatch reconciliation and idempotency are fail-closed.
- Production deployment is protected, exact-SHA and artifact-digest-bound.
- AI role, quota and private-context boundaries are server-authoritative.

## Journey results

### Owner

The canonical path is property intake, server quote, signature verification, payment evidence, Admin approval, active contract and dashboard access. The client cannot set activation, payment verification or unlock fields.

### Tenant

Regular service requests remain identity-scoped. Emergency, scheduled and AI-assisted service flows use validated server operations. Physical-access records are signed and server-authored.

### Technician

Only assigned and approved technicians can advance lifecycle state. Arrival requires valid location evidence. Completion requires before-and-after proof and notes.

### Admin

The in-app status bridge is read-only. Privileged operations use the dedicated Admin console and server operations. Financial browser writes remain denied.

### Broker

Lead and referral self-service is identity-scoped. Commission and payout state is server-authored and validated before approval.

## Remaining architectural constraints

- `tickets` and `maintenanceTickets` remain dual collections. New service flows use `maintenanceTickets`; mutations must remain behind canonical server authority until migration is complete.
- Authenticated hosted E2E requires seeded credentials and registered App Check evidence.
- Payment provider, email delivery, App Check and production deployment truth cannot be inferred from source code.

## Code validation

The authoritative commands are in `TESTING.md`. Every proposed change must pass root, Admin and Functions builds, typecheck, lint, rules emulators, launch-honesty tests, stability tests and mobile readiness before merge. The protected workflow context supplies the exact commit under review. Live production checks remain operations-only and must never be represented as local passes.
