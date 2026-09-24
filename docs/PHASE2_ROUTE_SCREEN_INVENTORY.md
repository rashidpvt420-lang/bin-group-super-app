# Phase 2 — Route and Every-Screen Inventory

Baseline: `main@13123010769d9798bbdb8ede55c0e413d62db650`  
Audit branch: `audit/phase2-route-screen-inventory-20260924`

## Scope

The Phase 2 audit is generated from the live React routers rather than a hand-maintained route list.

Current inventory:

- 239 registered routes
- 170 consumer routes
- 69 Admin routes
- 153 routes with detected runtime data dependencies
- 21 redirect/compatibility routes
- Firebase Hosting deep-link/refresh rewrites verified for consumer and Admin applications

For every registered route the generated matrix records:

`route -> role -> permission -> component -> data source -> loading -> empty -> error -> success -> mobile -> Arabic -> back navigation -> direct URL -> refresh`

Generate locally with:

```bash
npm run test:phase2-route-screen-inventory
```

CI also uploads:

- `.phase2-route-inventory/route-screen-matrix.json`
- `.phase2-route-inventory/route-screen-matrix.md`
- the audit console output

## Structural result

The strict route/screen audit currently reports:

- **0 strict failures**
- **0 mobile-review warnings**
- **70 Arabic/localization review warnings**

The strict checks enforce route uniqueness, resolvable runtime components, SPA direct-link/refresh support, and required loading/error/empty behavior for actual asynchronous read/list screens.

## Repairs made during Phase 2

The audit found and repaired real runtime-state defects rather than weakening the detector:

- Owner ROI: Firestore read failure is now visible.
- Owner Tenants: property and tenant listener failures are visible; nested listener cleanup is fixed.
- Owner P&L: property and maintenance ledger failures are visible.
- Technician History: Firestore read failure is visible.
- Technician Duty Monitor: Firestore read failure is visible.
- Consumer BIN Connect: initial conversation loading state added.
- Admin BIN Connect: initial thread loading state added.
- Admin Tickets: initial loading/error state added and duplicate `setTickets` removed.
- Audit Shield: initial loading and listener error states added.
- Audit Log: initial loading and listener error states added.
- WhatsApp Triage: loading, empty, and listener-error states added.
- RFQ Workflow: loading, empty, and listener-error states added.
- Data Governance Audit: loading, empty, and listener-error states added.
- Institutional Reports: both live ledger listeners now expose read failures.

## Arabic finding — do not mislabel as complete

The remaining 70 review rows are **not route failures** and are **not mobile layout failures**. They mean the rendered route inherits an Arabic/RTL-capable portal or Admin shell, but the route's own screen/component tree still contains hard-coded English without sufficient screen-local translation evidence.

Examples include portions of:

- Owner analytics, documents, renewals, review queue, approvals and BIN Connect
- Tenant unit/detail/chat/documents/renewals
- Technician proof/map/history/offline/BIN Connect
- Broker referral/attribution screens
- multiple Admin operations, reports, audit, finance and control-center screens
- several public trust/analytics/auditor/verification surfaces

This is intentionally retained as **REVIEW/PARTIAL** in the matrix. RTL infrastructure alone is not accepted as proof that the screen is fully Arabic-localized.

## Phase 2 interpretation

Route authority, permissions, async screen states, mobile static coverage, direct URLs and refresh behavior are now machine-inventoried and structurally clean.

The generated matrix is the authoritative Phase 2 inventory. The 70 Arabic rows are explicit localization debt discovered by Phase 2 and must remain visible until a screen-copy localization sweep proves them complete.
