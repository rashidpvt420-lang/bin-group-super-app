# BIN GROUP Property Operations Intelligence

## Product outcome

BIN GROUP must reliably close the property-operations loop:

**Problem reported → work authorized → technician dispatched → repair verified → payment controlled → owner informed.**

The product advantage is a trustworthy operational record for each property, combining maintenance history, verified costs, asset records, contracts, financial obligations, and outstanding actions. AI consumes this governed data; it does not replace human approval or source records.

This is an implementation specification, not a statement that every capability is already complete or production-enabled.

## Existing foundations to reuse (verify before extending)

The repository already contains partial capabilities including:
- Property and maintenance workflows, technician command centres, ticket lifecycle helpers, and field evidence.
- Digital asset inventory in the admin panel.
- Market/pricing intelligence based on persisted pricing audit records.
- Profitability and financial reporting pages.
- Vendor/contractor command centre and RFQ trust workflow.
- Admin operations, audit, compliance, and document vault pages.

Before building duplicates, map each capability to its actual routes, data schema, backend authority, role access, tests, and production status. Label every capability as **implemented and verified**, **implemented but unverified**, **partial**, or **missing**.

## Phase 1 — unified Property Operations Intelligence (core)

Create a unified property-level operational view that links:
- Property and unit identity, ownership/management scope, occupancy and lease status.
- Assets and equipment, warranty, install/service dates, QR/asset tags.
- Maintenance requests, priority, SLA, assignment, dispatch, attendance, work evidence, tenant acceptance, reopen/escalation history.
- Quotes, approvals, invoices, payments, reserves, verified job cost and vendor.
- Contracts, compliance/document expiry, renewals, and outstanding actions.

Requirements:
- Every record must have canonical IDs and explicit property/unit/asset relationships.
- Show source, last-updated time, and status for each signal.
- Distinguish verified actuals, user-entered values, estimates, and forecasts.
- No fabricated fallback KPIs or synthetic operational data in production.
- Server-side role and property authorization on every read and mutation.
- Public AI must never access private operational records.

## Phase 2 — months 3–6: operational scale

### Contractor procurement
- Vendor onboarding and verification status, coverage zones, trades, availability, insurance/licence expiry where applicable.
- RFQ creation and comparable quote submission with line-item labour/materials, VAT treatment, lead time, warranty, exclusions, and validity.
- Conflict-of-interest declaration, duplicate quote/invoice detection, vendor performance based on completed verified jobs.
- Human approval limits and immutable audit trail.
- No automatic award or payment release by AI.

### Portfolio health scoring
- Explainable property score based on verified overdue work, SLA breaches, unresolved complaints, asset condition, document expiry, payment arrears, and maintenance cost trend.
- Display component scores, data freshness, missing data, and recommended actions.
- Never score from sensitive personal traits or use the score as a regulatory/financial certification.
- Missing data must be marked unknown, not treated as healthy.

### Cash-flow forecasting
- Property and portfolio forecasts for rent receivables, cheque maturity, operating expenses, approved work, invoices, reserve balances, and planned capital expenditure.
- Separate actual ledger entries from forecasts and scenarios.
- Show assumptions, forecast horizon, confidence/coverage, source data and reconciliation status.
- Phase 1 payment constraints remain AED cash/cheque manual only; bank transfer and Stripe stay disabled unless separately approved through a controlled policy change.

### Integrations
- Build an integration registry with owner, purpose, scopes, data exchanged, consent/legal basis, secrets handling, sync status, retries, and audit events.
- Prioritize approved accounting, CRM, messaging, maps, and document workflows based on pilot demand.
- Investigate official UAE government integrations only where authorization and technical access are confirmed. Do not imply Ejari/Tawtheeq or other government integration without approval and working evidence.
- Webhooks must be signed, idempotent, replay-protected, and observable.

### Multi-company administration
- Tenant/company/branch hierarchy with strict tenant isolation.
- Company-scoped users, roles, properties, vendors, approval limits, branding and reports.
- Explicit cross-company access grants only; no accidental global queries.
- Automated cross-tenant isolation tests and auditable administrative access.

## Phase 3 — months 6–12: evidence-based intelligence

### Predictive maintenance
- Begin with preventive schedules, manufacturer guidance, asset age and verified service history.
- Introduce predictions only after sufficient quality-labelled historical data exists.
- Show reason codes, evidence, confidence, model version and human review.
- Track false positives/negatives and operational outcomes.
- Predictions may recommend inspections or work orders; they may not dispatch, approve quotes, or spend money without authorized human action.

### Advanced AI Property Copilot
- Authenticated, role-scoped retrieval over authorized properties and records.
- Cite the underlying record IDs and timestamps; state when evidence is missing or stale.
- Separate factual answers, calculations, estimates and forecasts.
- Require explicit user confirmation for ticket submission, communication, or any consequential action.
- Never approve contracts, invoices, payments, KYC, vendor awards, or account access.
- Public assistant remains limited to public product information.

### Expansion
- Expand into additional emirates and customer segments only after measured retention, repeat usage, positive unit economics, support coverage, and legal/regulatory review.
- Treat each new emirate/customer segment as a launch cohort with local workflows and acceptance tests.

## Required measurement

Track by company, portfolio, property, unit, trade and urgency:
- Time to acknowledge, assign, arrive, resolve, and obtain tenant acceptance.
- SLA adherence and first-visit fix rate.
- Reopen and repeat-failure rate.
- Cost per completed job and variance against approved quote.
- Vendor quality and evidence completeness.
- Rent collection and cash-flow forecast error.
- Property health component changes and data freshness.
- Activation, monthly active use, retention, paid conversion, gross margin, CAC and support cost.

Targets must be agreed from pilot baselines; do not present proposed targets as achieved performance or industry benchmarks.

## Delivery and release gates

1. Inventory current implementation and identify canonical data sources before changing code.
2. Deliver small, reviewable PRs; do not commit directly to main.
3. Add unit, integration, emulator and end-to-end tests including unauthorized, cross-tenant, duplicate, offline/retry, stale data and partial failure cases.
4. Validate accessibility, Arabic/English RTL, mobile usability, and low-connectivity behavior.
5. Run build, typecheck, lint, Codacy, security rules, and relevant workflow checks.
6. Verify Firebase and third-party runtime behavior using production-safe evidence.
7. Preserve the completed controlled pilot; do not restart it.
8. Keep production deployment fail-closed until all required evidence passes and the protected release process authorizes deployment.

## Explicit non-goals

- No feature-count race or speculative AI features without validated data.
- No fabricated dashboards, hardcoded performance claims, or fallback figures presented as live.
- No weakening of payment, KYC, Finance separation-of-duties, App Check, or tenant isolation controls.
- No unapproved payment methods or autonomous high-impact AI actions.
