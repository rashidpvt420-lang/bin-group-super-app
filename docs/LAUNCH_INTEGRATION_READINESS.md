# Launch Integration Readiness - BIN GROUP Super App

**Status:** Pre-public-launch control document  
**Purpose:** Separate implemented app capability from external provider activation, billing, credentials, and live operational verification.

---

## 1. Core rule

Do not describe an integration as **live**, **approved**, **production-ready**, or **fully operational** until all of the following are true:

1. Provider account is verified.
2. Production API keys or credentials are issued.
3. Credentials are stored only in environment variables, Firebase secrets, or approved secret storage.
4. Billing is enabled where required.
5. Domain, package name, bundle ID, or IP restrictions are configured.
6. Webhook signatures or callback authentication are verified.
7. End-to-end testing is completed on production or approved staging.
8. Logs, failure handling, and fallback flows are reviewed.
9. Admin/operator training is completed.
10. Legal/compliance position is documented.

---

## 2. Integration status matrix

| Integration | App capability | Provider activation required | Launch status | Launch gate |
|---|---|---:|---|---|
| Firebase Authentication | Implemented role-based login and routing | Yes | In progress | Owner, tenant, technician, broker, and admin test accounts must pass access tests |
| Firestore | Implemented app data model, rules, and indexes | Yes | In progress | Security rules test suite must pass before launch |
| Firebase Storage | Implemented secure document/evidence paths | Yes | In progress | Upload/read tests must pass for owner, tenant, technician, admin, and auditor roles |
| Firebase Functions | Implemented callable and backend automation patterns | Yes | In progress | Region, secrets, logs, and callable permission tests must pass |
| Firebase Cloud Messaging | Implemented guarded notification bootstrap | Yes | In progress | Push token registration and foreground/background delivery must pass on Android and PWA |
| Google Maps Platform | Required for exact property GPS, technician map, and dispatch | Yes | Not launch-cleared | API key restrictions, billing, and map load tests required |
| OpenAI/Gemini Vision | Required for photo categorization and maintenance triage | Yes | Not launch-cleared | API key, billing, model selection, fallback, and manual-review flow required |
| Stripe / Network International | Required for live card/payment gateway | Yes | Not launch-cleared | Merchant approval, webhook verification, refund/error tests required |
| WhatsApp Business API | Required for WhatsApp notifications and templated reminders | Yes | Not launch-cleared | Business verification, template approval, token security, opt-in policy required |
| SMS/Voice fallback | Optional emergency fallback | Yes | Not launch-cleared | Carrier/provider approval and cost controls required |
| UAE data residency / hosting position | Required for institutional/government confidence | Yes | Not launch-cleared | Final hosting architecture and data-processing position must be documented |

---

## 3. Launch-critical verification checklist

### 3.1 Google Maps

- [ ] Production Google Cloud project created.
- [ ] Billing enabled.
- [ ] API key restricted by domain for web app.
- [ ] API key restricted by package/bundle where mobile wrappers are used.
- [ ] Maps JavaScript API enabled.
- [ ] Geocoding/Places/Geolocation APIs enabled only if actually used.
- [ ] Test exact UAE property pin capture during onboarding.
- [ ] Test technician live map under admin.
- [ ] Test route behavior when GPS is missing or invalid.
- [ ] Confirm App Check or referrer restrictions do not break map rendering.

### 3.2 AI Vision / Maintenance Triage

- [ ] Choose approved provider: OpenAI, Gemini, or both.
- [ ] Store API key in backend secret manager only.
- [ ] Confirm no AI key is exposed in browser code.
- [ ] Test categories: AC, plumbing, electrical, leak, elevator, security/CCTV, cleaning, pest control, other.
- [ ] Test low-confidence fallback to manual review.
- [ ] Test Arabic and English issue descriptions.
- [ ] Log AI confidence and category without storing unnecessary sensitive data.
- [ ] Confirm manual override by admin/dispatcher.

### 3.3 Payments

- [ ] Confirm gateway: Stripe, Network International, manual bank transfer, or phased combination.
- [ ] Verify merchant account.
- [ ] Configure production keys as backend secrets.
- [ ] Implement webhook signature verification.
- [ ] Test successful payment.
- [ ] Test failed payment.
- [ ] Test duplicate webhook/idempotency handling.
- [ ] Test refund/cancellation process.
- [ ] Confirm whether BIN GROUP holds money or payment goes directly to owner/vendor/bank account.
- [ ] Confirm VAT/tax invoice wording with accountant/legal advisor.

### 3.4 WhatsApp / SMS notifications

- [ ] Verify WhatsApp Business account.
- [ ] Register approved sender number.
- [ ] Submit and approve message templates.
- [ ] Confirm user opt-in language.
- [ ] Store access token securely.
- [ ] Use Graph API endpoint, not Instagram Graph endpoint.
- [ ] Test owner payment alert.
- [ ] Test tenant ticket update.
- [ ] Test technician dispatch alert.
- [ ] Test fallback when WhatsApp delivery fails.

### 3.5 Storage and evidence

- [x] Tenant evidence upload path aligned to Storage Rules: `maintenanceTickets/{ticketId}/tenant/{fileName}`.
- [x] Tenant request now requires at least one photo before dispatch.
- [ ] Test tenant upload permission.
- [ ] Test owner evidence read permission.
- [ ] Test technician proof upload permission.
- [ ] Test unauthorized cross-owner/cross-tenant read denial.
- [ ] Test file size limits.
- [ ] Test allowed MIME types.

### 3.6 Admin approval and dashboard unlock

- [ ] Submit owner onboarding.
- [ ] Confirm intake record created.
- [ ] Confirm contract record created.
- [ ] Confirm payment transaction created.
- [ ] Confirm property passport created.
- [ ] Approve payment in admin.
- [ ] Approve contract activation in admin.
- [ ] Confirm owner dashboard unlocks only after trusted activation.
- [ ] Confirm pending/locked screen shows correct guidance before approval.

### 3.7 Technician dispatch

- [ ] Create tenant ticket with photo and valid GPS.
- [ ] Confirm ticket has SLA minutes.
- [ ] Confirm dispatch status is set.
- [ ] Confirm technician assignment flow.
- [ ] Confirm technician can view assigned job.
- [ ] Confirm technician can upload before/after proof.
- [ ] Confirm owner/admin can view proof.
- [ ] Confirm completion updates ticket state.
- [ ] Confirm SLA breach path is logged.

### 3.8 RTL / bilingual

- [ ] Test owner portal in English and Arabic.
- [ ] Test tenant portal in English and Arabic.
- [ ] Test technician portal in English and Arabic.
- [ ] Test admin portal in English and Arabic.
- [ ] Test invoices/contracts/PDFs in Arabic text rendering.
- [ ] Test right-to-left layout on mobile.
- [ ] Confirm no untranslated keys appear on public pages.

### 3.9 Role isolation and security

- [ ] Owner cannot read another owner's properties, tenants, tickets, contracts, payments, or documents.
- [ ] Tenant cannot read another tenant's unit, tickets, or documents.
- [ ] Technician can only read assigned jobs/evidence unless admin.
- [ ] Broker cannot access owner/admin/tenant private data unless explicitly permitted.
- [ ] Admin roles are limited by permission tier where applicable.
- [ ] Auditor can read compliance evidence but cannot mutate operational records unless explicitly allowed.
- [ ] Storage Rules and Firestore Rules are tested together.

### 3.10 UAE hosting and compliance position

- [ ] Confirm current Firebase project region and Functions region.
- [ ] Decide final production hosting position: UAE-hosted, EU-hosted, or hybrid.
- [ ] Document data categories: owner identity, property records, tenant data, payment data, evidence photos, contracts, audit logs.
- [ ] Document retention policy for photos, KYC, invoices, and audit logs.
- [ ] Document subprocessors: Firebase/Google, AI provider, payment provider, WhatsApp/SMS provider.
- [ ] Add privacy policy wording for AI image triage and notifications.
- [ ] Add institutional/government client data-processing note if targeting public sector.

---

## 4. Public launch wording

Use this wording until provider activation is complete:

> BIN GROUP Super App includes the technical architecture for GPS dispatch, AI-assisted maintenance triage, digital evidence, owner onboarding, contracts, payment verification, notifications, and role-based portals. External provider services such as Google Maps, AI Vision, payment gateways, WhatsApp, SMS, and final hosting/data-residency controls must be activated and verified before those functions are marketed as live production services.

Do not say:

- "Google Maps is live" unless production map rendering and key restrictions passed.
- "AI auto-triage is live" unless backend AI key, billing, fallback, and manual review passed.
- "Online card payments are live" unless gateway merchant approval and webhook tests passed.
- "WhatsApp notifications are live" unless templates and sender number are approved.
- "UAE data residency is guaranteed" unless the final hosting/data-processing architecture proves it.

---

## 5. Current correction log

| Date | Correction | Status |
|---|---|---|
| 2026-06-03 | Added launch-readiness distinction between app capability and provider activation | Complete |
| 2026-06-03 | Fixed tenant ticket evidence upload path to match Storage Rules | Complete |
| 2026-06-03 | Added explicit pre-launch gates for Maps, AI, payments, WhatsApp, Storage, admin approval, technician dispatch, RTL, role security, and UAE hosting | Complete |
