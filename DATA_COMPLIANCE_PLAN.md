# BIN Group: Data & Compliance Plan (UAE PDPL)

This document outlines the operational and legal framework for ensuring the BIN Group PropTech platform complies with the UAE’s Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL) and other applicable regional standards.

---

## 🛡️ 1. UAE Data Protection Compliance (PDPL)

### Core PDPL Principles

1. **Lawful Basis**: We process personal data only under specific legal bases—explicit user consent for marketing and photos, and contractual necessity for maintenance fulfillment and rent collection.
2. **Explicit Consent**: Consent mechanisms are built into the onboarding flows for tenants, owners, and technicians. Consent must be informed, explicit, and easily revocable.
3. **Data Minimization**: We only collect what is strictly necessary (e.g., Emirates ID for KYC, photos for maintenance evidence, IBAN for payouts).
4. **Transparency**: A clear Privacy Policy is provided in both Arabic and English, detailing collection purpose, retention periods, and third-party sharing.

### Data Subject Rights

Users of the BIN Group platform have the following rights:

* **Access**: Request a copy of their stored data.
* **Correction**: Fix inaccurate personal or property details.
* **Erasure**: Request deletion of data (subject to UAE financial record-keeping laws).
* **Withdrawal**: Revoke consent for data processing at any time.

---

## 🛠️ 2. Operational Compliance Checklist

### A. Privacy & Consent Tools

* **Onboarding Gates**: Explicit checkboxes for Privacy Policy and Terms of Service during account creation.
* **Contextual Consent**: When uploading photos for the "Visual Gate" or "Proof of Work," users are reminded that images are stored for maintenance and audit purposes.
* **Consent Logging**: All user consents are timestamped and logged in the Firestore `users` collection metadata.

### B. Record of Processing Activities (RoPA)

We maintain a processing inventory documenting:

* **Data Types**: KYC data, location data, financial records, maintenance media.
* **Storage**: Primary data resides in secure cloud nodes with at-rest encryption.
* **Access**: Enforced via Role-Based Access Control (RBAC).
* **Retention**: Maintenance records are kept for a minimum of 7 years to comply with UAE audit standards.

### C. Security Controls

* **Encryption**: SSL/TLS for data in transit; AES-250 for data at rest.
* **Audit Logging**: Every administrative action in the "God-Mode" portal is logged with a user ID and timestamp.
* **Penetration Testing**: Initial security audit scheduled pre-launch, with annual reviews thereafter.

---

## 🤖 3. AI & Automated Processing (UAE AI Governance)

The BIN Group platform uses AI (OpenAI Vision/Gemini) for maintenance triage and "BIN Score" calculations. Under PDPL and the 2026 AI Governance Framework:

* **Transparency**: Users are informed when an AI is analyzing their photos/data.
* **Human-in-the-Loop**: Critical automated decisions (like owner suspension or high-value quotes) allow for manual admin override.
* **DPIA**: A Data Protection Impact Assessment is conducted for any AI module processing sensitive tenant behavior patterns.

---

## 🚀 4. Compliance Implementation Roadmap

### Phase 1: Foundational (Weeks 1-4)

* [ ] Finalize Privacy Policy and Terms of Service (Arabic/English).
* [ ] Implement explicit consent checkboxes in all portals.
* [ ] Configure encryption at rest for all database collections.

### Phase 2: Operational (Weeks 5-12)

* [ ] Assign/Appoint a Data Protection Officer (DPO).
* [ ] Draft and test the Data Breach Response Plan.
* [ ] Complete the initial Record of Processing Activities (RoPA).

### Phase 3: Audit & Optimization (Ongoing)

* [ ] Annual external security audit.
* [ ] Quarterly review of stored data to ensure minimization.
* [ ] Verification of data subject rights request fulfillment process.

---

## ⚖️ Penalties of Non-Compliance

Failure to adhere to UAE PDPL can result in administrative fines reaching multi-ten thousands to millions of AED, alongside the risk of license suspension by UAE regulatory authorities.
