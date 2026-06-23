# Repo Launch Gap Map — 2026-06-23

Scope: company profile, onboarding, tenant/technician workflow, owner/technician workflow, Arabic, notifications, contracts, PDFs, property passport, map workflow, public launch, AI Studio, owner dashboard, tenant dashboard, technician dashboard, broker dashboard, and admin dashboard.

## Verdict

The app has a real multi-portal foundation, but several hard-live gaps remain where UI exists without complete action wiring, proof drilldown, or truthful data fallback.

## P0 fixes

1. Company profile
- Add Admin as the fifth profile journey.
- Replace the four-journey messaging with five-profile messaging.
- Explain the flow: owner onboarding, admin approval, tenant request, technician proof, owner/admin verification, broker attribution when present.

2. Admin dashboard
- Wire the pending approval REVIEW button.
- Fix the Total Properties route mismatch.
- Replace fake live mission fallback values: no `Tower Pilot`, no static `2h 15m` SLA.
- Replace hardcoded finance headline, security score, and expired document count with Firestore-driven values.
- Add launch health, five-profile smoke status, payment proof queue, SLA breach queue, broker commission approval queue, staff access drift, and incident banner.

3. Owner dashboard
- Add rent due, rent collected, balance, collection rate, pending verification, and overdue tenants.
- Render tenant-by-tenant rent ledger with proof and receipt drilldown.
- Add pending owner approvals and payment proof cards.
- Add move-in/move-out inspection review, evidence comparison, damage claim, and settlement workflow.
- Add live technician ETA/map only when a job is assigned.

4. Tenant dashboard
- Expand active ticket listeners beyond `tenantId == uid` to include normalized email and linked unit/property context.
- Add visible permission-warning state instead of silent empty state.
- Add one-minute workflow strip: report, track, approve/dispute.
- Add payments/documents/receipts card with clear visibility rules.
- Add move-in/move-out action when inspection module is available.

5. Technician dashboard
- Add proof readiness KPI: before photo, after photo, notes, parts, signature/tenant confirmation.
- Add per-job SLA countdown.
- Add route/map summary.
- Add offline queue warning.
- Translate hardcoded English labels through i18n.
- Block job close when required proof is missing.

6. Broker dashboard
- Add broker attribution chain: broker code/link -> lead/referral -> owner/property/tenant -> contract -> commission.
- Capture broker attribution during owner onboarding and tenant referral.
- Lock attribution when contract activates.
- Show commission source contract and approval state.
- Add admin commission approval queue.

7. Contracts and PDFs
- Contract PDF must include contract ID, owner/company, service plan, 15% mobilization, payment plan, property list, SLA, evidence clause, QR/hash.
- Invoice and certificate PDFs must include public verification QR/hash.
- Arabic PDFs must remain RTL-safe and use an Arabic-capable font.

8. Passport and map
- Property passport must show contracts, tickets, inspections, invoices, documents, photos, map/GPS, asset health, and audit events.
- Map workflow must use actual property and technician coordinates only.
- Missing GPS must show `GPS not configured`, never a fake fallback.

9. AI Studio
- Explain the design flow: idea -> estimate -> owner approval -> admin/vendor review -> quote/ticket/contract add-on.
- Link design requests to property, unit, tenant, and owner.
- Add status tracking and disclaimer around AI estimates.

## Required launch proof

Before full public commercial launch, Admin Launch Health should show:
- main app build green
- admin build green
- owner build green
- functions build green
- Firestore rules pass
- Storage rules pass
- production App Check active
- live payment or manual payment verification active
- branded email configured
- WhatsApp/BIN Connect health if marketed
- five-profile smoke status green
- no hardcoded operational dashboard fallback

## Required test commands

```bash
npm run typecheck
npm run build
npm run build:admin
npm run build:owner
npm run build:functions
npm run test:rules
npm run test:hard-launch-readiness
npm run test:e2e:business
```
