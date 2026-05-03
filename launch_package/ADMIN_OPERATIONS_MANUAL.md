# ADMIN OPERATIONS MANUAL: INTERNAL BIN GROUP SYSTEMS

## 1. Property Management
### How to Approve a Property
1. Log in to **Admin Panel**.
2. Navigate to **Manual Approvals**.
3. Review the Owner's submitted Title Deed and ID.
4. Click **Approve**. This triggers the creation of the `property_passports` entry.

### How to Refresh Property Passport
1. Go to **Property Passport Registry**.
2. Find the target property.
3. Click the **Refresh Icon** (Top Right). This manually triggers the Cloud Function to recalculate all financial and maintenance totals.

## 2. Tenant Ingestion
### How to Import 100+ Tenants
1. Navigate to **Tenants > Bulk Tenant Import**.
2. Upload your validated CSV (Ensure headers match `REAL_TOWER_PILOT_100.csv`).
3. Click **Validate**. Address any red (error) or orange (warning) rows.
4. Click **Import**. The system will create Units, Users, Leases, and Ledgers in atomic batches.

### How to Resolve Failed Imports
1. If an import fails, check the **Console Logs**.
2. Identify the `importBatchId`.
3. Use the **Safety Controls** in the **Control Center** to archive/rollback that specific batch if data is corrupt.

## 3. Communication & Delivery
### How to Check Email Delivery
1. Navigate to **Sovereign Control Center**.
2. Look at the **Failed Invitations** KPI.
3. If > 0, check the Firestore `/mail` collection for specific error strings from SendGrid.

### How to Resend Invitations
1. Go to the **Tenant Registry**.
2. Filter by "Status: Pending."
3. Click **Resend Invite** on the specific tenant or use the **Bulk Resend** in the Control Center.

## 4. Financial Oversight
### How to Verify Rent Ledger
1. Open the **Owner Dashboard** (or view as Admin in **Tenants > Ledger**).
2. Compare the `paidBalance` and `outstandingBalance` against the bank deposit records.
3. To adjust, edit the specific `tenant_ledger` document in Firestore (Admin Only).

## 5. Reporting
### How to Export Operations Reports
1. Go to **Sovereign Control Center**.
2. Click **Export Ops Report (PDF)**.
3. This generates a high-level institutional report of the entire portfolio health.

---

*Contact Technical Support for any "System Critical" alerts in the Control Center.*
