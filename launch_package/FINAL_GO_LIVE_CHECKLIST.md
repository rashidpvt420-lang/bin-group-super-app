# FINAL GO-LIVE CHECKLIST: PRE-ONBOARDING

Before the first real client is onboarded, the following must be verified as "GREEN":

## 1. Technical Infrastructure
- [ ] **Firebase Billing:** Confirm valid payment method attached (Production usage).
- [ ] **SendGrid:** API Key verified and "Domain Authentication" complete for `@bin-groups.com`.
- [ ] **Auth Domains:** `bin-groups.com` and `www.bin-groups.com` added to Firebase Auth whitelist.
- [ ] **Hosting:** Final production builds deployed to `https://bin-groups.com`.
- [ ] **Cloud Functions:** All 8+ Second-Gen functions deployed and "Active".

## 2. Application Logic
- [ ] **Security Rules:** Firestore rules deployed (no global read/write).
- [ ] **Passport Sync:** Manual refresh of a test property results in correct financial totals.
- [ ] **Bulk Import:** Successful test of a 5-tenant "mini-batch" in the live environment.
- [ ] **PDF Export:** Control Center report generates and downloads correctly.

## 3. Communication & Branding
- [ ] **Email Templates:** Verification that "BIN GROUP" branding is consistent in all SendGrid templates.
- [ ] **Support Channel:** `support@bin-groups.com` inbox is live and monitored.
- [ ] **Terms of Service:** Publicly accessible via the app login pages.

## 4. Commercial & Legal
- [ ] **Pricing Model:** Approved by Board.
- [ ] **Contract Template:** Legal review of the Tower Management Agreement.
- [ ] **Payment Gateway:** (Optional for Launch) Integration with Stripe/Network Intl planned for Day 30.

## 5. Operations Readiness
- [ ] **Admin SOP:** Staff trained on "Manual Approvals" and "Bulk Ingestion."
- [ ] **Maintenance Team:** First team of 5 technicians ready for SOS dispatch.
- [ ] **Risk Register:** Mitigation owners assigned.

---

**SIGNED OFF BY:**
__________________________ (CEO / Lead Engineer)
**DATE:** _________________
