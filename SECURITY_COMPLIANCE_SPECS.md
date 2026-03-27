# BIN Group: Security & Compliance Audit Specs (UAE PDPL & VAT)

This document maps the BIN Group infrastructure to the regulatory standards of the UAE, specifically focused on Data Privacy and Financial Compliance.

---

## 🔒 1. UAE PDPL (Federal Decree Law No. 45 of 2021)

**Purpose**: Protect personal data of UAE residents.

### Data Sovereignty Mapping

* **Infrastructure**: All primary databases (Firestore/GCP) are pinned to the **`me-central2` (Dammam)** or **`me-west1` (Tel Aviv)** regions, with preferred migration to the **UAE regions (Abu Dhabi/Dubai)** once global availability for all services is confirmed.
* **Cross-Border Transfer**: Personal data of UAE nationals must never leave the GCC without explicit consent and encryption.

### Access Control Matrix (RBAC)

| Data Type | Owner | Access Level |
| :--- | :--- | :--- |
| **Emirates ID** | Admin/Gov | Encrypted at Rest, No logs. |
| **Financial Logs** | Owner/Admin | Read-only after 24h. |
| **Maintenance Media** | Tech/Tenant | Public URL expiration (signed URLs). |

---

## 💰 2. VAT & FTA (Federal Tax Authority) Compliance

**Purpose**: Ensure correct calculation and reporting of Value Added Tax (VAT) on services.

### Financial Requirements

* **VAT Rate**: Fixed at **5%** as per UAE Law.
* **Tax Invoices**: Must display:
  * Vendor TRN (Tax Registration Number).
  * Bin Group's registered address.
  * VAT amount clearly separated from the Net amount.
  * Total inclusive of VAT.

### Audit Trail

* **Retention**: Financial records must be kept for **5 years** (accessible in the Document Vault).
* **Immutable Logs**: Every payment transaction generates a SHA-256 hash stored in the [Blockchain SLA Vault](./POWER_FEATURES.md), preventing post-hoc ledger manipulation.

---

## 🛡️ 3. Cybersecurity Hardening

* **End-to-End Encryption**: TLS 1.3 for all data in transit. AES-256 for data at rest.
* **Identity**: MFA (Multi-Factor Authentication) via UAE PASS for all high-privilege Admin/Owner actions.
* **Penetration Testing**: Mandatory bi-annual vulnerability scans of the Cloud Functions (API) layer.

---

## 🚥 4. Compliance Gatekeeper Logic

```javascript
/**
 * Example Compliance Guard for Invoice Generation
 */
function validateTaxCompliance(invoice) {
  if (!invoice.TRN) throw new Error("TRN Missing: Tax Invoice Invalid");
  const calculatedVAT = invoice.baseAmount * 0.05;
  if (Math.abs(calculatedVAT - invoice.vatAmount) > 0.01) {
    throw new Error("VAT Mismatch: Calculation Audit Failed");
  }
  return true;
}
```

---

## 📋 5. Audit Checklist

* [ ] **TRN Verification**: BIN Group Tax Registration Number verified.
* [ ] **Data Locality Check**: Firestore region set to Middle East.
* [ ] **EID Masking**: Emirates ID numbers masked in all non-essential UI views.
* [ ] **Deletion Policy**: "Right to be Forgotten" implemented for inactive Tenants/Owners.
