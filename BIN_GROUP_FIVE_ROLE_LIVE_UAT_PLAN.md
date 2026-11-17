# BIN GROUP — FIVE-ROLE LIVE UAT ACCEPTANCE TEST PLAN

**Application:** BIN GROUP Home OS (`ae.bingroups.superapp`)  
**Build Under Test:** `1.0.1` (Version Code `17`) on Android  
**Test Mode:** Controlled Live Production — Read-Only / Non-Destructive Actions Only  
**Safety Mandate:** Zero real money transactions, zero payment approvals/rejections, zero claim modifications, zero production document uploads.

---

## 1. OWNER PROFILE LIVE UAT SCRIPT

**Target Routes:** `/owner/*`, `/onboarding/*`  
**Assigned Testers:** `T-05`, `T-10`, `T-11`, `T-12`  
**Prerequisites:** Account verified in Firebase Auth with role `owner`.

| Step ID | Test Screen / Feature | Route / UI Element | Expected Behavior | Verification Criterion | Safety Constraint |
|:---|:---|:---|:---|:---|:---|
| `OWN-01` | Sign In & Identity Restoration | `/login?intendedRole=owner` | Enters owner email & password. App completes Firebase Auth and redirects to `/owner/dashboard`. | No infinite loading spinner; auth token established. | Use assigned credentials only. |
| `OWN-02` | Owner Dashboard & Executive KPIs | `/owner/dashboard` | Displays property portfolio summary, active units, rent collection status, open complaints. | KPI numbers are truthful or show honest empty/pending states (no synthetic zeros). | Read-only inspection. |
| `OWN-03` | Property & Unit Directory | `/owner/properties`, `/owner/properties/:id/units` | Lists registered villas/buildings in Al Ain and Abu Dhabi. Tapping a property opens unit inventory. | Verified address, unit count, and occupancy labels render correctly in EN and AR. | Do not add or delete properties. |
| `OWN-04` | Property Details & Passport | `/owner/passport` | Displays official property facts, inspection status, compliance certificates. | Truthful facts displayed; missing fields show N/A. | Read-only inspection. |
| `OWN-05` | Tenant & Occupancy Visibility | `/owner/tenants` | Displays linked tenants, lease start/end dates, Tawtheeq/Ejari references. | PII masked; telephone and email actions open system handlers. | Do not alter tenant links. |
| `OWN-06` | Maintenance Request & Approvals | `/owner/tickets`, `/owner/approvals` | Lists maintenance complaints raised by tenants. Tapping a ticket displays progress timeline. | Stage helper renders: Pending, Assigned, In Progress, or Solved. | Do not approve billable variations. |
| `OWN-07` | Technician Dispatch & GPS Tracking | `/owner/ticket/:id` | If technician is in transit, displays embedded Google map with technician pin and property geofence. | Stale GPS falls back to last known timestamp; no exaggerated live claims. | Observe only. |
| `OWN-08` | Quotes & Estimates Inspection | `/owner/financials`, `/owner/renewals` | Displays annual maintenance and property management quotes with 15% mobilisation breakdown. | Amounts strictly formatted in AED with fils (2 decimals); Cash/Cheque notice visible. | Do not accept quotes. |
| `OWN-09` | Payment History & Receipts | `/owner/payment-proof`, `/owner/financials` | Displays past payment records and verified deposit proofs. | Receipts viewable; payment methods limited to CASH / CHEQUE. | ZERO payment recording. |
| `OWN-10` | Contracts & Legal Documents | `/owner/contracts`, `/owner/documents` | Displays signed management contracts, PDF viewer, and 10-year audit stamp. | PDF loads cleanly without downloading raw private tokens. | Read-only viewing. |
| `OWN-11` | In-App Notifications & Alerts | Notification Bell (`/notifications`) | Displays unread notifications for ticket status changes, rent receipts, and renewals. | Notification count updates; tapping item navigates to relevant route. | Do not clear shared alerts. |
| `OWN-12` | Logout & Session Teardown | Header Menu → Sign Out | Terminates Firebase session, clears local storage cache, redirects to `/login`. | Protected routes redirect back to `/login` when accessed post-logout. | Full cleanup verification. |

---

## 2. TENANT PROFILE LIVE UAT SCRIPT

**Target Routes:** `/tenant/*`  
**Assigned Testers:** `T-01`, `T-08`, `T-13`, `T-14`  
**Prerequisites:** Account verified in Firebase Auth with role `tenant`.

| Step ID | Test Screen / Feature | Route / UI Element | Expected Behavior | Verification Criterion | Safety Constraint |
|:---|:---|:---|:---|:---|:---|
| `TEN-01` | Sign In & Residence Link | `/login?intendedRole=tenant` | Authenticates tenant and navigates to `/tenant/dashboard`. If unlinked, shows "Link Your Residence". | Clean load without App Check 403 or permission-denied errors. | Use assigned credentials only. |
| `TEN-02` | Tenant Home Dashboard | `/tenant/dashboard` | Renders unit header, rent due card, lease status, active maintenance requests. | Layout order: Unit Header → Rent → Lease → Active Request → Emergency. | Read-only inspection. |
| `TEN-03` | Rent Schedule & Installments | `/tenant/payments` | Displays rent installment breakdown (e.g. 4 cheques/year), due dates, and status. | Status values: Scheduled, Due, Paid, or Pending Verification. | Zero money submission. |
| `TEN-04` | Maintenance Request Creation | `/tenant/request` | Form allowing tenant to report an issue (HVAC, Plumbing, Electrical). | Form allows category selection, description entry, and photo attachment. | Use tag "[QA TEST - DO NOT DISPATCH]". |
| `TEN-05` | Request Status & Timeline | `/tenant/tickets`, `/tenant/tickets/:id` | Renders ticket progress stepper: Submitted → Assigned → Technician En Route → Work Done. | Reflects actual server state; shows assigned technician name when active. | Do not modify ticket state. |
| `TEN-06` | In-App Support & Chat | `/tenant/chat/:ticketId` | Shared ticket chat interface with operations and technician. | Messages render with timestamps and author roles; bilingual input supported. | Non-offensive test text only. |
| `TEN-07` | Emergency SOS Banner | `/tenant/emergency` | Displays emergency operational hotline (+971 55 2423233) and security guidance. | No false promises; direct phone dialer opens with confirmed phone number. | Do not dial emergency services. |
| `TEN-08` | Lease & Legal Documents | `/tenant/documents` | Displays tenancy contract copy, Ejari/Tawtheeq registration, house rules. | Download/view renders clean PDF document. | Read-only inspection. |
| `TEN-09` | Tenant Profile & Preferences | `/tenant/profile` | Shows tenant name, verified mobile number, email, and preferred language (EN/AR). | Language switch updates document `dir="rtl"` and renders Arabic copy. | Do not change personal data. |
| `TEN-10` | Session Logout | Header Menu → Sign Out | Terminates auth session and clears tenant cache. | Session terminates cleanly; back navigation blocked. | Full cleanup verification. |

---

## 3. TECHNICIAN PROFILE LIVE UAT SCRIPT

**Target Routes:** `/technician/*`  
**Assigned Testers:** `T-02`, `T-03`, `T-04`  
**Prerequisites:** Account verified in Firebase Auth with role `technician`.

| Step ID | Test Screen / Feature | Route / UI Element | Expected Behavior | Verification Criterion | Safety Constraint |
|:---|:---|:---|:---|:---|:---|
| `TEC-01` | Sign In & Shift Status | `/login?intendedRole=technician` | Authenticates technician and routes to `/technician/dashboard`. | Prompts for location permission required for field dispatch. | Use assigned credentials only. |
| `TEC-02` | Technician Dashboard | `/technician/dashboard` | Shows next assigned job card, duty status toggle (On Duty / Off Duty), today's job count. | Duty toggle updates technician state without throwing Firestore permission errors. | Toggle duty once, restore state. |
| `TEC-03` | Assigned Work Orders Queue | `/technician/jobs` | Lists assigned maintenance tickets filtered by technician UID. | Displays priority badges (High, Medium, Normal) and SLA target times. | Work orders inspected read-only. |
| `TEC-04` | Job Details & Map Navigation | `/technician/jobs/:id` | Displays property address, contact info, issue description, and "Start Travel" action. | Map shows destination pin in UAE; "Open in Maps" opens system navigation. | Do not trigger client travel. |
| `TEC-05` | Before-Work Evidence Capture | `/technician/jobs/:id` (Evidence Step) | Prompts for pre-repair photo. Camera/gallery picker activates. | Image preview renders; Storage upload attaches to test ticket. | Upload non-sensitive QA photo only. |
| `TEC-06` | After-Work Evidence & Completion | `/technician/jobs/:id` (Completion) | Prompts for post-repair photo, parts used, and work notes. | Form validates required fields; requires explicit technician sign-off. | Designated test tickets only. |
| `TEC-07` | Technician Job History | `/technician/history` | Lists completed tickets with measured resolution metrics. | Truthful history rendered; missing metrics shown as N/A (no fake 100% SLA). | Read-only inspection. |
| `TEC-08` | Technician Profile & HR | `/technician/profile`, `/technician/hr` | Displays trade specialty (HVAC, Electrical), supervisor contact, shift schedule. | Profile details load cleanly; emergency HR contact visible. | Read-only inspection. |
| `TEC-09` | Offline Sync & Queue Status | `/technician/offline` | Displays status of background evidence sync agent. | Shows "All synced" or pending queue count without freezing the UI. | Observe background queue. |
| `TEC-10` | Session Logout | Header Menu → Sign Out | Reconciles terminal STOP GPS signal before clearing tokens and redirecting. | GPS tracking watchdog cleanly terminates; session cleared. | Verify clean exit. |

---

## 4. BROKER PROFILE LIVE UAT SCRIPT

**Target Routes:** `/broker/*`  
**Assigned Testers:** `T-09`  
**Prerequisites:** Account verified in Firebase Auth with role `broker`.

| Step ID | Test Screen / Feature | Route / UI Element | Expected Behavior | Verification Criterion | Safety Constraint |
|:---|:---|:---|:---|:---|:---|
| `BRK-01` | Sign In & Broker Portal | `/login?intendedRole=broker` | Authenticates broker and navigates to `/broker/dashboard`. | Clean load without App Check errors. | Use assigned credentials only. |
| `BRK-02` | Broker Dashboard & KPIs | `/broker/dashboard` | Displays active referrals, approved leads, earned commissions summary. | Numbers derived from live server records; no invented demo statistics. | Read-only inspection. |
| `BRK-03` | Lead Submission & Tracking | `/broker/leads`, `/broker/referrals` | Form allowing broker to register a property owner referral. | Captures lead name, mobile, property type. Generates referral ID. | Submit test lead marked "[QA TEST]". |
| `BRK-04` | Available Property Listings | `/broker/listings` | Lists BIN GROUP managed portfolios open for leasing/brokerage. | Villa/apartment details, location, and leasing terms clearly formatted. | Read-only inspection. |
| `BRK-05` | Commission Overview (Read-Only) | `/broker/commissions` | Displays commission ledger, payout status, and invoice links. | Broker cannot self-approve or request unearned commissions (`brokerId !== actorId`). | Strictly READ-ONLY. |
| `BRK-06` | Documents & Marketing Collateral | `/broker/documents` | Access to official BIN GROUP brochures, property passports, agreements. | Download links render approved marketing assets. | Read-only inspection. |
| `BRK-07` | Broker Profile & IBAN Mask | `/broker/profile` | Shows registered broker license, agency name, masked bank IBAN. | IBAN displays only last 4 digits (e.g. `•••• •••• •••• 1234`). | Do not modify bank details. |
| `BRK-08` | Session Logout | Header Menu → Sign Out | Terminates session and redirects to `/login`. | Storage cleared; protected broker routes deny access. | Verify clean exit. |

---

## 5. ADMIN / FINANCE PROFILE LIVE UAT SCRIPT

**Target Routes:** `/admin/*`, Dedicated Admin Panel (`apps/admin-panel`)  
**Assigned Testers:** `T-06` (CEO), `T-07` (Finance Admin)  
**Strict Scope:** Individually assigned executive accounts only. **Zero execution of real money approvals or cancellations.**

| Step ID | Test Screen / Feature | Route / UI Element | Expected Behavior | Verification Criterion | Safety Constraint |
|:---|:---|:---|:---|:---|:---|
| `ADM-01` | Dedicated Admin Sign In & MFA | Dedicated Admin Login (`/login`) | Enters admin credentials; receives mandatory Phone or TOTP MFA prompt. | Access granted ONLY upon verified second-factor token. | CEO/Finance Admin individually. |
| `ADM-02` | Admin Operational Dashboard | Admin Panel `/dashboard` | Displays real-time operational metrics: active properties, open tickets, occupancy rate. | KPI cards use high-contrast text and truthful counts. | Read-only inspection. |
| `ADM-03` | User & Role Directory | Admin Panel `/owners`, `/tenants`, `/technicians` | Lists registered platform users with their active roles. | Role badges accurately indicate `owner`, `tenant`, `technician`, `broker`, `admin`. | DO NOT change user roles. |
| `ADM-04` | Operations & Ticket Queue | Admin Panel `/tickets` | Central dispatch feed of all submitted tenant maintenance tickets. | Filter by status, property, technician; inspect assignment controls. | Do not reassign active live tickets. |
| `ADM-05` | Finance Dashboard & Queues | Admin Panel `/financials/payments` | Displays payments pending verification (CASH / CHEQUE mobilization). | Displays payment evidence artifact, payer name, amount in AED. | **DO NOT CLICK APPROVE OR REJECT.** |
| `ADM-06` | Authorization Boundary Check | Payment Decision Interface | Inspects approval button authority requirements. | UI clearly indicates that only an active Finance Admin with MFA can decide payments. CEO status alone cannot approve. | Confirm dual-control notice. |
| `ADM-07` | Dual-Control Evidence Verification | Payment Detail View | Inspects recorder UID and evidence provenance. | Verifies that recorder UID is distinct from current approver identity. | Confirm refusal guard presence. |
| `ADM-08` | Audit Log & Governance Feed | Admin Panel `/audit-logs` | Chronological stream of system security events, logins, and approvals. | Append-only events display timestamp, actor UID, and action type. | Read-only inspection. |
| `ADM-09` | Reports & Export Capabilities | Admin Panel `/reports` | Generates operational and financial summaries. | Reports export to CSV/PDF with appropriate data masks. | Do not export sensitive PII. |
| `ADM-10` | Administrative Session Termination | Admin Panel Header → Logout | Revokes admin token and terminates active MFA session. | Admin panel redirects to login; deep links require fresh MFA. | Full session teardown. |
