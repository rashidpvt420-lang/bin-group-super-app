# BIN GROUP Super App — Deep Hard-Live Profile Workflow Gap Map

Date: 2026-06-24
Branch: `fix/deep-public-profile-workflow`
Scope: public company profile, onboarding, owner, tenant, technician, broker, admin, Arabic, notifications, contracts/PDFs, property passport, maps/GPS, public launch, and AI Studio design.

## 1. Public company profile

### Current risk
The landing page was visually strong but did not explain the full business in plain owner/tenant language before login. It leaned toward institutional/sovereign wording and did not clearly explain the five access profiles, owner benefits, tenant benefits, broker attribution, technician dispatch, or proof-first workflow.

### Applied fix
`src/pages/LandingPage.tsx` now explains BIN GROUP as a UAE no-call property operations access layer with five connected profiles: Owner, Tenant, Technician, Broker, and Admin. It adds clear owner/tenant/technician/broker benefit cards, onboarding workflow explanation, tenant-to-technician workflow explanation, proof system, public invoice verification, certificate verification, and Arabic copy through RTL-aware inline text.

### Remaining follow-up
Move repeated bilingual text into shared translation keys after the copy is approved.

## 2. Onboarding workflow

### Required hard-live workflow
1. Owner reads the company profile and understands the offer.
2. Owner submits property/entity/unit/location/service details.
3. System calculates scope: Maintenance Only, Property Management Only, or Full Maintenance & Property Management.
4. System calculates contract value, 15% mobilization, and payment plan.
5. Owner submits identity/property/payment proof.
6. Admin reviews owner, property, contract, and payment proof.
7. Contract activates only after approval/payment verification.
8. Owner dashboard unlocks and audit logs are written.

### Current audit verdict
The workflow exists across routes and admin queues, but the public explanation had been weak. Admin dashboard now has action queues and launch health visibility, but owner onboarding funnel conversion should be explicit in admin reporting.

### Next fixes
- Add admin onboarding funnel: company profile view -> property intake -> quote -> contract -> payment proof -> admin approval -> activated.
- Add owner-facing status tracker during pending approval.
- Add explicit rejection/rework reasons with audit events.

## 3. Tenant to technician workflow

### Required hard-live workflow
Tenant report -> issue classification -> priority/SLA -> dispatch -> technician accept -> on route -> on site -> before/after evidence -> tenant approve/dispute -> owner visibility -> admin audit.

### Current audit verdict
The technical foundation exists through tenant tickets, maintenanceTickets, technician status states, proof photos, notifications, and admin live mission panels. The public page now explains this workflow clearly.

### Next fixes
- Confirm all tenant request paths write to the same canonical ticket collection and field schema.
- Ensure every status transition sends notification records to tenant, owner, technician, and admin.
- Add owner dashboard ETA/map card only when a ticket is assigned.

## 4. Owner dashboard

### Current strengths
Owner activation gate, contract intelligence, property/passport visibility, maintenance complaint visibility, authorized reporters, financial resolver, tenant ledger resolver, payment listener, owner contract mode matrix, and money/risk sections.

### Remaining P0 gaps
- Top KPI still needs visible Pending Payments / Payment Proof.
- Top KPI still needs rent due, rent collected, balance, and collection rate.
- Add Rent Income uses placeholder alert behavior and needs a real form.
- Complaint rows need action buttons: approve, dispute, request revisit, escalate, download evidence pack.
- Owner needs payment proof drilldown by tenant/receipt/reference.
- Owner needs handover/move-in/move-out evidence route and dashboard card.

### Required fix order
1. Add Owner Money Snapshot: Rent Due, Collected, Balance, Collection Rate, Pending Verification, Overdue Tenants.
2. Render tenant ledger rows as a tenant-by-tenant payment table.
3. Replace rent update alert with real ledger/payment form.
4. Add complaint closure actions.
5. Add Owner Inspections route and handover evidence tab in Property Passport.

## 5. Tenant dashboard

### Current strengths
Tenant routes cover dashboard, unit, request, tickets, ticket detail, chat, emergency, profile, documents, payments, design studio, gate pass, amenities, notices, keys, parcels, visitor parking, marketplace, staff directory, messages, community, and BIN Connect.

### Remaining P0 gaps
- Add a 60-second welcome strip: Report issue -> Track technician -> Approve/dispute proof.
- Payment/document visibility should be clear even when ledger mode is restricted.
- Move-in/move-out inspection route must be visible from tenant dashboard.
- Notification center should show payment, document, service, dispatch, proof, and admin messages.

## 6. Technician dashboard

### Required hard-live view
Technician must see assigned jobs, priority/SLA, route/map, accept/on-site/resolve actions, before/after uploads, blocked/escalated cases, performance score, MTTR, rejected proof, and admin messages.

### Next fixes
- Confirm status writes are canonical across tenant/admin/owner dashboards.
- Confirm proof photo storage rules match technician upload paths.
- Add offline/poor-network upload pending state.
- Add technician notification bell tied to assignment/escalation/rework.

## 7. Broker dashboard and attribution

### Required hard-live flow
Broker creates owner lead/property lead/tenant lead/contract opportunity -> system stamps brokerUid, brokerEmail, referralCode, leadId, contractId -> admin approves deal -> commission is calculated -> payment/withdrawal is approved -> audit log records attribution.

### Current audit verdict
Recent code already added broker attribution proof and admin commission queue visibility. The broker dashboard still needs business-facing clarity around how leads become contracts and how commissions become payable.

### Next fixes
- Broker dashboard card: New Owner Lead.
- Broker dashboard card: New Tenant Lead.
- Broker dashboard table: Submitted leads, converted contracts, pending commission, paid commission.
- Contract creation must preserve `brokerUid`, `brokerEmail`, `brokerLeadId`, and `commissionStatus`.

## 8. Admin dashboard

### Current verified improvements
Admin dashboard now has live action queues, payment proof queue, broker commission queue, SLA breach and near-breach metrics, real MRR calculation, Launch Health, 5-profile smoke status, WhatsApp webhook health, and expired document queue.

### Remaining P0/P1 gaps
- Approval pages must complete approve/reject/suspend flows with audit log writes.
- Admin staff/access management must allow scoped access by module and action.
- Contract value calculation must show input factors, discount, deposit, payment plan, and final eliminated/adjusted amount.
- Add production incident banner when CI/Firebase/Auth/Functions/Firestore errors spike.

## 9. Arabic / RTL

### Current risk
Some public and dashboard surfaces still use hardcoded English or inline bilingual strings. Inline bilingual copy is acceptable for fast launch clarity but should be centralized.

### Next fixes
- Move approved public copy to `LanguageContext` or shared i18n files.
- Run hardcoded-English audit across owner, tenant, technician, broker, admin, PDFs, and emails.
- Confirm RTL layout on mobile for all five profiles.

## 10. Notifications

### Required coverage
Owner: approvals, payments, contracts, reports, disputes.
Tenant: ticket status, technician ETA, payment, document, gate pass, parcel, notice.
Technician: assignment, escalation, proof rejected, schedule.
Broker: lead accepted/rejected, contract converted, commission approved/paid.
Admin: payment proof, onboarding approval, SLA breach, webhook failure, launch health failure.

### Next fixes
- Add a profile-notification matrix test.
- Confirm each workflow writes notification records, not only UI toasts.
- Confirm unread counts and notification routes per role.

## 11. Contracts and PDFs

### Required coverage
Contracts, invoices, owner statements, rent collection statements, evidence packs, certificates, lease/handover reports, verification hashes.

### Next fixes
- Add owner rent collection statement PDF.
- Add move-in/move-out handover PDF.
- Add evidence pack PDF from ticket detail.
- Ensure Arabic PDF content is correct and not broken by font/RTL rendering.

## 12. Property passport

### Required coverage
Property identity, owner, unit, tenant/occupancy, title deed, compliance, documents, expiry, inspection, asset register, maintenance history, handover evidence, public/private verification status.

### Next fixes
- Add handover evidence tab.
- Add expiry calendar.
- Add per-property maintenance timeline.
- Add owner read permissions for inspection evidence.

## 13. Maps / GPS

### Required coverage
Property coordinates, technician route/ETA, check-in/check-out, on-site proof timestamp, map fallback, GPS permission state, GPS audit hash.

### Next fixes
- Add owner dashboard map summary for active assigned tickets.
- Add admin live field map incident overlay.
- Add explicit fallback when coordinates are missing instead of fake location text.

## 14. Public launch

### Current status
Controlled pilot can continue only if build/deploy checks are green. Hard public launch still requires production proof for CI, Firebase deploy, App Check, payment configuration, branded email, notifications, maps/GPS, PDFs, Arabic, and five-profile smoke tests.

### Next fixes
- Keep Launch Health visible on admin dashboard.
- Require hard launch gate command before public launch.
- Add proof pack after every deploy.

## 15. AI Studio design

### Required coverage
Design request intake, quote context, scope, concept state, render pending/completed/failed state, generated image/proof, owner/tenant route access, admin review, notification, PDF/export.

### Next fixes
- Show render engine state clearly to user.
- Add generated proof storage and retry state.
- Confirm API key/runtime config in production.
- Add Arabic copy for remaining AI Studio labels.
