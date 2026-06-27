# BIN GROUP Super App — Hard-Live Deep Audit and Fix Backlog

Date: 2026-06-27
Branch: `fix/role-service-homepage-hard-live`

## Completed in this branch

### 1. Home page length and navigation problem

**Problem:** The public interface was too long for first-time users. A tenant, landlord/owner, or real-estate broker had to read too much before finding the correct service path.

**Fix shipped:** Added `src/pages/RoleServiceLandingPage.tsx` and made `src/pages/LandingPage.tsx` export it directly.

The new home page starts by asking:

- Tenant
- Landlord / Owner
- Real Estate / Broker

After the user selects a role, the page narrows the service options instead of showing one long interface.

### 2. Service narrowing added

#### Tenant path

Tenant now sees:

- Report an issue
- Documents and payments
- Building services

Each option sends the user toward the tenant login/service path.

#### Landlord / Owner path

Owner now sees:

- Maintenance only
- Property management only
- Full coverage

Each option sends the user toward owner onboarding with the selected service context.

#### Real Estate / Broker path

Broker now sees:

- Submit owner lead
- Bring a contract
- Tenant placement

The page explains broker attribution so the system knows who brought the lead, contract, tenant, or unit placement.

### 3. Company profile access preserved

The new home page keeps direct access to:

- Company Profile
- Portal Login
- BIN GROUP contact buttons

The company profile remains the longer explanation page for users who want the full details.

---

## Deep audit: what still needs code fixes

## A. Main company profile

### Current strength

The company profile already explains BIN GROUP as a UAE property maintenance and management access layer. It describes owner, tenant, technician, and broker value, proof, GPS, evidence, bilingual support, service areas, and operating flow.

### Missing / weak

- The first screen should mirror the new home-page role selector more strongly.
- It should use user-facing terms: Tenant, Landlord / Owner, Real Estate / Broker.
- It should explain the three owner packages immediately: Maintenance Only, Property Management Only, Full Coverage.
- It should avoid making users read the full service grid before understanding which path applies to them.

### Next fix

Add the same role-first service selector inside `/company-profile`, below the hero and above the long service explanation.

---

## B. Onboarding workflow

### Required operating workflow

1. User selects role: Tenant, Landlord / Owner, or Real Estate / Broker.
2. Owner enters property details.
3. System calculates contract value.
4. Owner selects service scope:
   - Maintenance Only
   - Property Management Only
   - Maintenance + Property Management
5. Owner uploads required documents and property evidence.
6. Owner accepts contract/payment plan.
7. Payment proof is submitted.
8. Admin verifies owner, property, contract, and payment proof.
9. Dashboard unlocks only after approval.
10. Audit log and notification are created.

### Missing / weak

- The query string from the home page, such as `?service=maintenance`, must preselect the correct onboarding package.
- Admin approval must be visible as a clear stage, not hidden behind dashboard state.
- Owner should see a simple activation timeline: property, document, quote, contract, payment proof, admin approval, dashboard unlock.

---

## C. Tenant → technician workflow

### Required workflow

1. Tenant submits issue with category, notes, photos/video, property/unit.
2. System classifies severity and trade.
3. Admin or auto-dispatch assigns technician.
4. Technician accepts.
5. Technician goes on site.
6. Tenant and owner see status/ETA.
7. Technician uploads before/after proof.
8. Tenant approves or disputes.
9. Owner sees proof/cost impact.
10. Admin audit log closes the workflow.

### Missing / weak

- Tenant dashboard needs a 60-second intro: report issue → track technician → approve/dispute proof.
- Map/ETA must only show when a technician is assigned.
- If no technician/property is linked, the UI must show `not linked` rather than fake fallback values.
- Tenant notification history must show request-created, technician-assigned, on-site, resolved, approval-needed, and dispute events.

---

## D. Owner → technician workflow

### Required workflow

1. Owner creates or approves a maintenance ticket.
2. Admin verifies ticket scope and cost exposure if needed.
3. Technician is assigned.
4. Owner sees ticket status, SLA, cost, technician, proof, and final decision.
5. Owner approves, disputes, requests revisit, or escalates.

### Missing / weak

- Owner complaint/ticket rows need direct actions:
  - Approve
  - Dispute
  - Request revisit
  - Escalate
  - Download evidence pack
- Owner dashboard needs assigned technician ETA when a live ticket exists.
- Owner dashboard needs payment proof and ticket cost drilldown.

---

## E. Arabic language / RTL

### Current strength

The app has bilingual content and RTL support in many areas.

### Missing / weak

- Every new page, dashboard card, modal, toast, table empty state, error state, PDF label, and notification needs Arabic copy.
- Avoid mixing English internal terms in Arabic UI unless it is a brand/system term.
- Buttons must not rely only on English route labels.

### Next fix

Run a route-by-route Arabic QA pass for:

- Public home
- Company profile
- Owner dashboard
- Tenant dashboard
- Technician dashboard
- Broker dashboard
- Admin dashboard
- Contracts
- PDFs
- Notifications

---

## F. Notifications

### Required notification events

Tenant:

- Request created
- Technician assigned
- Technician en route / on site
- Proof uploaded
- Approval needed
- Dispute updated

Owner:

- Property submitted
- Contract generated
- Payment proof pending
- Admin approved / rejected
- Ticket created
- Ticket breached / near breach
- Cost approval needed
- Rent/payment received

Technician:

- New assignment
- SLA warning
- Re-dispatch
- Proof rejected
- Job closed

Broker:

- Lead received
- Lead verified
- Contract linked
- Commission pending
- Commission approved / rejected

Admin:

- Owner approval pending
- Payment proof pending
- SLA breach
- Technician approval pending
- Broker commission pending
- Launch health error

### Missing / weak

- Notification center must show exact source document IDs and linked route.
- Critical notifications must have action buttons.
- Failed notification delivery should be visible to admin.

---

## G. Contracts and contract value calculation

### Required logic

Admin/system must calculate contract value from:

- Property type
- Emirate / zone
- Units
- Floors
- Age
- Facilities
- Service scope
- SLA tier
- Maintenance frequency
- Property management percentage
- Discounts / enterprise size
- VAT / fees if enabled
- 15% mobilization deposit
- Payment plan: monthly, quarterly, annual

### Missing / weak

- Admin dashboard should expose the contract calculator result clearly.
- Admin should be able to review and override with reason.
- Every override must write audit log.
- Owner should see calculation breakdown, not only final amount.

### Required fix

Add an Admin Contract Value Review panel:

- System-calculated value
- Inputs used
- Deposit amount
- Payment plan
- Override amount
- Override reason
- Approval status
- Audit record

---

## H. PDFs

### Required PDFs

- Owner contract PDF
- Lease PDF
- Invoice PDF
- Payment receipt PDF
- Owner monthly statement PDF
- Evidence pack PDF
- Property passport PDF
- Move-in / move-out inspection PDF
- Broker commission statement PDF

### Missing / weak

- Dashboard pages need download buttons linked to generated PDFs.
- PDFs need Arabic labels and RTL formatting.
- Generated PDFs must include verification hash or certificate ID where relevant.

---

## I. Passport / property passport

### Required property passport sections

- Property identity
- Owner identity
- Units
- Title deed / ownership proof
- GPS/location
- Contracts
- Tenants / occupancies
- Maintenance history
- Evidence photos
- Invoices / payments
- Inspections
- Move-in / move-out handover
- Compliance expiry calendar
- Public QR verification if enabled

### Missing / weak

- Owner dashboard needs a stronger passport readiness card.
- Missing data should be specific: title deed missing, GPS missing, unit map missing, contract missing, inspection missing.
- Property passport needs handover evidence tab.

---

## J. Map workflow

### Required map states

- Property location verified
- Technician assigned
- Technician en route
- Technician on site
- Job proof GPS captured
- Route/ETA visible only when safe and relevant

### Missing / weak

- Never show fake fallback property name or fake ETA.
- If GPS is missing, show `GPS not verified`.
- If technician is not assigned, show `No live field visit yet`.

---

## K. Public launch

### Required hard-live launch panel

Admin dashboard must show:

- Main app deploy status
- Admin deploy status
- Firebase Auth status
- Firestore rules status
- Storage rules status
- Functions status
- App Check status
- Stripe/manual payment mode
- WhatsApp webhook status
- Five-profile smoke test status
- Last production incident

### Missing / weak

- Launch health is not visible in one trusted place.
- Hardcoded status should be removed.
- Smoke test results should be stored and displayed.

---

## L. AI Studio design

### Required flow

1. Owner/tenant uploads room/property photo.
2. User chooses design request type.
3. AI generates concept.
4. Concept is saved as a design request.
5. Admin/owner can approve quote or request revision.
6. If converted, the design request links to a maintenance/fit-out project.

### Missing / weak

- AI Studio needs visible generation status.
- Design request detail must show source photo, generated concept, owner/tenant permission, quote status, and conversion path.

---

# Dashboard-specific backlog

## Owner dashboard P0

- Add Pending Payments / Payment Proof KPI.
- Add Pending Owner Approvals KPI.
- Add rent collection KPI row: due, collected, balance, collection rate, overdue tenants.
- Render tenant-by-tenant rent ledger rows.
- Replace any alert-only rent action with a real form.
- Add ticket action buttons: approve, dispute, request revisit, escalate, download evidence pack.
- Add payment proof drilldown.
- Add move-in / move-out evidence card and route.
- Add warning when permission-denied causes partial data.

## Tenant dashboard P0

- Add 60-second tenant intro.
- Add visible payment/lease status if property management is enabled.
- Add active issue lifecycle card.
- Add assigned technician ETA only when assigned.
- Add approval/dispute proof card after technician upload.
- Add route buttons for move-in/move-out inspection.

## Technician dashboard P0

- Show assignment queue by priority/SLA.
- Add clear job lifecycle: accept → on site → upload proof → close.
- Require before/after evidence before close.
- Show SLA breach warnings.
- Show offline evidence capture status if offline mode exists.
- Show rejected proof / revisit jobs.

## Broker dashboard P0

- Add owner lead submission with attribution token.
- Add tenant placement submission.
- Add contract brought-by-broker linking.
- Add commission status: pending, verified, approved, rejected, paid.
- Add admin-verifiable source fields:
  - brokerId
  - brokerUid
  - leadId
  - propertyId
  - tenantId
  - contractId
  - sourceType
  - submittedAt
  - verifiedBy
  - commissionRate
  - commissionAmount
  - auditTrail

## Admin dashboard P0

- Wire Pending Approval `Review` buttons.
- Add owner property approval flow.
- Add staff access management with granular permissions.
- Replace hardcoded MRR/growth/security/expired-doc/SLA/property fallbacks.
- Add real launch health panel.
- Add five-profile smoke status.
- Add SLA breach / near-breach queue.
- Add payment proof queue detail.
- Add broker commission pending queue.
- Add WhatsApp webhook health.
- Add role/access drift monitor.
- Add production incident banner.

---

# Admin approval workflow required

## Owner property approval

Admin must be able to review:

- Owner identity
- Company/person type
- Property details
- Title deed / ownership document
- Location/GPS
- Units/floors/facilities
- Contract package
- Contract value
- Deposit/payment proof
- Signature status

Admin actions:

- Approve property
- Reject with reason
- Request more documents
- Override contract value with reason
- Activate owner dashboard
- Write audit log
- Send notification

## Staff access control

Admin must be able to add staff and assign exact permissions:

- Operations
- Finance
- HR
- Support
- Documents
- Approvals
- Broker management
- Technician dispatch
- Reports
- Settings
- Super admin only actions

Every access change must write audit log.

## Contract value calculation and elimination of fake values

The system should never show fake contract values, fake ETA, fake property names, fake security scores, or fake expired document counts.

When data is missing, show:

- Not linked
- Not verified
- Waiting for admin approval
- GPS missing
- SLA not calculated
- No live field visit yet

---

# Final verdict

The app has a strong base: five portals, Firebase-backed operations, onboarding, contracts, maintenance, brokers, admin, evidence, maps, PDFs, and public verification.

The biggest hard-live issue is not lack of pages. The issue is action clarity and operational truth.

The branch fixes the first public UX blocker: users now start by selecting Tenant, Landlord / Owner, or Real Estate / Broker, then see only the relevant service options.

Next code batch should focus on Admin Dashboard truth controls and Owner Dashboard money/action visibility.
