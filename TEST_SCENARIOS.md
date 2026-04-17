# BIN Group: QA Blueprint & Test Scenarios

This document contains the "Stress Test" suite required to certify the BIN Group Super App for a production launch in the UAE.

---

## 🏗️ 1. Core "Golden Path" Scenarios

| ID | Area | Scenario | Expected Result |
| :--- | :--- | :--- | :--- |
| **G1** | Tenant | Submit ticket with Photo AI detection | Ticket categorized, Tech assigned, ETA sent via WhatsApp. |
| **G2** | Tech | QR Scan -> Before Photo -> Completion -> Sig | Job closed, Invoice generated, Owner notified. |
| **G3** | Owner | View ROI Dashboard + Request Payout | Waterfall calculated correctly, Payout status "In Progress". |

---

## 🚨 2. Edge Case & Failure Scenarios

* **F1 - Connectivity**: Tech tries to close job in a basement (No 4G).
* *Result*: App uses "Offline Cache," queues photo, and syncs 100% data once signal returns.
* **F2 - Payment Failure**: Tenant's Direct Debit fails.
* *Result*: Automated SMS/Push warning sent; Late fee added to next billing cycle automatically.
* **F3 - Bounced Cheque**: Real estate PDC bounces at bank.
* *Result*: "Arrears Alert" on Owner dashboard + Legal warning generated for Tenant.

---

## 🇦🇪 3. Local Compliance Scenarios (UAE Specific)

* **L1 - RAMADAN Hours**: Technician dispatch adjusts to restricted working hours.
* **L2 - Ejari Expiry**: System detects lease expiration 90 days out.
* *Result*: Triggers "Renewal Quote" with RERA Service Charge index lookup.
* **L3 - RTL Flipping**: Change language to Arabic.
* *Result*: Entire UI (menus, maps, charts) mirrors correctly to Right-to-Left.

---

## 🤖 4. AI & Automation Scenarios

* **A1 - SOS Keyword**: Patient types "GAS SMELL" in ticket description.
* *Result*: [SOS Triage](./BIN_Group_Technical_Specification_v3_0.md) bypasses ticketing and shows "CALL 997" button.
* **A2 - Duplicate Detection**: Two tenants in the same building report "Elevator Broken".
* *Result*: System groups into one Master Ticket; notifies both tenants of "Service Underway".

---

## 📈 5. Benchmarks

* **Sign-in Time**: < 3 seconds (OTP).
* **Dashboard Load**: < 2 seconds.
* **AI Analysis**: < 5 seconds for image categorization.
