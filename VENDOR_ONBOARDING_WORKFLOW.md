# BIN Group: Vendor Onboarding & Vetting Workflow

This document defines the process for secondary vendors (ACM, Plumbers, HVAC contractors) to enter the BIN Group marketplace.

---

## 🚦 1. The Vetting Funnel (The RFP Template)
Every vendor must submit a digital RFP (Request for Partnership) through the Admin Portal.

### Required Documentation
1.  **Valid Trade License**: Issued by DED or a UAE Free Zone (Activity must include Maintenance/FM).
2.  **Insurance Documents**: Public Liability Insurance (Min 1,000,000 AED coverage).
3.  **Technician Certifications**: Proof of training (e.g., DEWA certification for electricians).
4.  **VAT Certificate**: FTA Registration and TRN identification.

---

## 🛠️ 2. Onboarding Workflow (Technical)

### Step 1: Digital Application
*   Vendor registers via `/api/vendors/onboard`.
*   Uploads PDF documents to `/vendors/temp_docs`.

### Step 2: Automated Verification (AI OCR)
*   The system uses **Gemini AI OCR** to extract the Expiry Date and Trade License Number.
*   **Gate**: If the license is expired, the application is auto-rejected.

### Step 3: Admin Interview & QA
*   Admin reviews the ratings of the vendor's previous projects (if available).
*   Admin triggers `vendor_approved` status in Firestore.

---

## 💰 3. Marketplace Financials (Revenue Split)
*   **Commission**: BIN Group retains **15%** of every work order completed via the marketplace.
*   **Escrow**: Payment is held in the BIN Group Escrow and released to the vendor 7 days post-completion (after Tenant sign-off).

---

## 📊 4. Vendor Performance Scorecard
Vendors are ranked based on a moving average of:
*   **Speed (SLA)**: Time from dispatch to job start.
*   **Quality**: Tenant rating (1-5 Stars).
*   **Integrity**: Number of "First-Visit Fix" vs. Repeat Visits.
*   **Compliance**: Accuracy of "Before/After" photo evidence.

---

## 📝 5. RFP Template (Sample)
```markdown
# BIN Group Vendor RFP
Company Name: _______________________
License Number: _____________________
TRN: ________________________________
Specialization: [HVAC / Plumbing / Electrical / Cleaning]
Number of Certified Technicians: ____
Current Managed Portfolios (Optional): __________________
```
