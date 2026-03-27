# BIN Group: Legal & Regulatory Playbook (UAE 🇦🇪)

This document outlines the specific technical and legal integrations required for the BIN Group Super App to operate as a licensed PropTech entity in the United Arab Emirates.

---

## 🆔 1. UAE PASS Integration (Digital Identity)
**Purpose**: Secure biometric-linked authentication and legally binding e-signatures for Tenancy Contracts.

### API Mapping & Sandbox Specs
*   **Provider**: Telecommunications and Digital Government Regulatory Authority (TDRA).
*   **Environment**: `https://stg-id.uaepass.ae` (STAGING) / `https://id.uaepass.ae` (PROD).
*   **Scope Requested**: `urn:uae:digitalid:profile:general`, `urn:uae:digitalid:profile:national`, `urn:uae:digitalid:profile:legal_signature`.

### Data Objects (Required for KYC)
| Field | Type | Description |
| :--- | :--- | :--- |
| `uuid` | string | Unique identifier across the UAE PASS ecosystem. |
| `fullnameEN` | string | Full name as per Emirates ID (English). |
| `fullnameAR` | string | Full name as per Emirates ID (Arabic). |
| `idn` | string | Emirates ID Number (784-XXXX-XXXXXXX-X). |
| `expiryDate` | timestamp | EID Expiry (used to trigger renewal prompts). |
| `userType` | enum | `SOP` (Citizen/Resident) or `VISITOR`. |

---

## 📜 2. DLD / Ejari Synchronization
**Purpose**: Verification of property ownership (Title Deeds) and automation of Lease Registration.

### Data Types for Registration
To register a lease via the DLD Sandbox, the following JSON structure is mandatory:

```json
{
  "property_info": {
    "land_number": "string",
    "area_code": "number",
    "unit_number": "string",
    "makani_number": "number"
  },
  "parties": {
    "landlord_eid": "784-...",
    "tenant_eid": "784-...",
    "legal_representative": "string"
  },
  "contract_terms": {
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "annual_rent": 120000,
    "security_deposit": 6000,
    "payment_method": "cheque",
    "cheque_count": 4
  }
}
```

### Integration Workflow
1.  **Verification**: Call `/api/v1/property/verify` with Title Deed and EID of the landlord.
2.  **Drafting**: Map BIN Group Digital Contract fields to Ejari Schema.
3.  **Submission**: Trigger `registerLease` endpoint upon dual UAE PASS signature confirmation.
4.  **Sync**: Webhook `ejari_registered` returns the Ejari Certificate Number and PDF.

---

## 🗺️ 3. Makani & GIS Logic
**Purpose**: Validation of exact building coordinates for technician routing and municipality reporting.

*   **Logic**: Every property entry must resolve a **Makani Number** to a Lat/Lng coordinate.
*   **Requirement**: The app must perform a reverse-lookup if the user pins a location, or valid a 10-digit Makani ID via the Dubai Municipality API.

---

## 🏢 4. RERA Service Charge Index
**Purpose**: Compliance with service charge regulations to prevent over-billing.

*   **Service Charge Index API**: Sync annual service charge rates per sqft for specific communities (e.g., Dubai Marina, Business Bay).
*   **Over-billing Guard**: The [Quotation Engine](./QUOTATION_ENGINE_UI_LOGIC.md) must flag quotes that exceed the RERA Service Charge index by more than 10%.

---

## ✅ 5. Compliance Checklist
- [ ] **Trade License**: Valid activity for "Property Management" and "Building Maintenance".
- [ ] **TRS (Task Registering System)**: Integration with DLD for property management agents.
- [ ] **Escrow Account**: All security deposits must be linked to a RERA-approved escrow structure.
