# SOP: FIRST REAL PROPERTY ONBOARDING

**Owner:** Operations Manager
**Applies to:** New Property Sign-ups
**Target Duration:** < 24 Hours

---

## Phase 1: Intake & Due Diligence
1. **Property Submission:** Owner submits property via the "Owner App" or Admin initiates via "Admin Panel."
2. **Document Collection:** Required docs:
    - Title Deed / Mulkiya.
    - Owner Passport / Emirates ID.
    - Trade License (for Corporate Owners).
    - Current Rent Roll (Excel/CSV).
3. **Admin Verification:** 
    - Verify property location and unit count.
    - Approve property in `Admin Panel > Manual Approvals`.

## Phase 2: Data Architecture
4. **Property Passport Activation:** Confirm the `property_passports` record is initialized.
5. **Unit List Import:** 
    - Prepare CSV of all units (Unit Number, Type, Floor).
    - Import via `Admin Panel > Bulk Tenant Import` (Unit Mode).
6. **Tenant List Import:**
    - Use the Stage 4 Verified CSV Template.
    - Ensure `tenantEmail`, `annualRent`, and `leaseDates` are 100% accurate.
    - Run the **Bulk Import Tool**. 

## Phase 3: Launch & Invitation
7. **Email Verification:** 
    - Monitor `/mail` collection in Firestore.
    - Confirm SendGrid state is `SUCCESS` for the first 5 rows.
8. **Invitation Dispatch:** All tenants receive the professional "Welcome to BIN GROUP" email.
9. **Owner Dashboard Activation:** Notify owner that their "Sovereign Terminal" is live.

## Phase 4: Post-Launch Support
10. **Acceptance Tracking:** Monitor `tenant_invitations` collection.
11. **Helpdesk (SOS):** Ensure on-ground maintenance team is briefed on the new property.
12. **Financial Sync:** Perform first ledger reconciliation after 48 hours to ensure `property_passport` totals are correct.

---

## Crisis Protocol (The "Abort" Button)
- If > 10% of emails bounce: **STOP** import. Verify SMTP credentials and domain authentication.
- If Rent Totals don't match: **DELETE** the batch using the `importBatchId` and re-import with corrected data.
