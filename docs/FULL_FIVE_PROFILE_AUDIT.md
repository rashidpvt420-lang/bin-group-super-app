# Full Five-Profile Audit

**Audit date:** 15 July 2026
**BASE_SHA (`origin/main`):** `b4bda2b2d07b951101bc0578581e5040ab8698ed`
**Branch:** `cursor/full-system-audit-fix-v4-30e9`
**Decision:** **HARD PUBLIC LAUNCH = NO-GO** until the operations evidence in `OPERATIONS_ONLY_CHECKLIST.md` is produced by protected workflows.

## Audited surfaces

| Surface | Entry | Authority boundary |
|---|---|---|
| Owner onboarding | `/onboarding/*` | Locked server quote, OTP-bound contract hash, callable payment package |
| Owner portal | `/owner/*` | Complete activation policy plus owner/property binding |
| Tenant portal | `/tenant/*` | Tenant UID or verified-email residence binding |
| Technician portal | `/technician/*` | Approved technician claims and server lifecycle transactions |
| Broker portal | `/broker/*` | Broker identity binding and server-authored commissions/payouts |
| Admin status bridge | `/admin/*` | Read-only status surface |
| Admin operations console | `apps/admin-panel` | Privileged custom claims, App Check, callable mutations |
| Firebase backend | `functions/`, rules, Storage | Admin SDK authority for money, access passes, dispatch and audit evidence |

## P0/P1 repairs in this audit

- Closed direct client writes to financial ledgers, activation state, gate passes, parking passes, commissions, payouts and audit logs.
- Removed direct technician mission claiming. Assignment is dispatcher/callable-authoritative and capacity changes are transactional.
- Added server-authoritative tenant emergency, scheduled-service and AI-concierge ticket creation with residence validation and idempotent request IDs.
- Bound QR passes to tenant residence, signed server payloads, immutable server records and callable cancellation.
- Bound owner signing OTP evidence to the locked contract hash and consume it transactionally.
- Bound manual payment/rent receipts to immutable Storage generation, content metadata and SHA-256 evidence.
- Required complete owner activation evidence: active status, admin approval, verified payment, explicit dashboard unlock and active contract ID.
- Hardened Stripe webhook session/amount/owner checks and durable reconciliation markers for captured-but-mismatched payments.
- Enforced suspended/disabled account revocation in rules, Auth and privileged callables.
- Moved admin payroll, disputes, broker attribution and payment approval to callables.
- Added AI role/quota enforcement and server-only quota records.
- Retired legacy client-calculated owner onboarding writes and the second WhatsApp inbound deploy entry.
- Made production deployment exact-SHA, protected-workflow-only, full-stack and artifact-digest-bound.
- Added predeploy verification of exact-SHA hard-clearance provenance for public mode.

## Journey results

### Owner

The canonical path is property intake → server quote → OTP-bound signature → Stripe/manual evidence → admin payment approval → active contract → dashboard. The client cannot set activation, payment verification or unlock fields. Recovery routes remain available while locked.

### Tenant

Regular evidence-first tickets remain rule-scoped. Emergency, scheduled services and AI concierge use `createTenantServiceTicket`. Gate and parking records use signed callables. Unit lookup supports `tenantId`, `tenantUid`, or a verified matching tenant email.

### Technician

Only assigned, approved technicians can advance lifecycle state. Arrival requires accurate in-geofence GPS. Completion requires before/after proof and notes. Offline completion mutation is disabled.

### Admin

The in-app route is explicitly read-only. Privileged operations use the dedicated admin console and callables. Financial browser writes are denied even for admin clients.

### Broker

Lead/referral self-service is identity-scoped. Commission and payout state is server-authored; payout approval validates IBAN, commission bindings and payment reference transactionally.

## Remaining architectural constraints

- `tickets` and `maintenanceTickets` remain dual collections. New service flows use `maintenanceTickets`; mutations must stay behind canonical callables/rules until a migration is executed.
- Authenticated production E2E cannot be proved without seeded credentials and registered App Check evidence.
- Stripe, SMTP, App Check and production deployment truth cannot be inferred from source code.

## Code validation

The authoritative commands are in `TESTING.md`. This branch must pass Functions/root/admin builds, typecheck, lint, rules emulators, launch-honesty tests, stability tests and mobile readiness before merge. Live production checks remain operations-only and must not be represented as local passes.
