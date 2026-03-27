# BIN Group: Property Handover & Turnover Protocol

This protocol defines the "Seamless Transition" workflow between tenants, ensuring zero rental downtime and maximum asset value.

---

## 🏗️ 1. Move-Out Sequence (The "Fresh Start")
**Target**: Prepare unit for new tenant in < 48 hours.

1.  **Notice Trigger**: 90 days before lease expiry, system pings tenant for "Renew or Evacuate."
2.  **Pre-Inspection (Digital)**: 15 days before move-out, tenant uploads 360-degree photos for "Normal Wear/Tear" pre-assessment.
3.  **Utility Clearance**: System cross-references DEWA/ADDC accounts to ensure zero outstanding balance.
4.  **Security Deposit Release**: [Financial Waterfall](./backend/src/functions/financialWaterfall.js) calculates deductions for any confirmed damages based on automated [AI comparison](./DISPUTE_RESOLUTION_FLOW.md).

---

## 🛠️ 2. The Maintenance "Sprint" (72-Hour Window)
Once keys are turned in, a master turnover work order is triggered:
*   **Deep Cleaning**: Automated dispatch to a "Premium Cleaning" vendor.
*   **Painting & Touch-ups**: Standardization of wall colors to "Bin-White" (Standard code).
*   **AC Sanitization**: Full sterilization to ensure the new tenant has a "Fresh Air" Day 1 experience.
*   **Smart Lock Reset**: Digital keys rotated; temporary access code sent to the incoming tenant.

---

## 🏠 3. Move-In Protocol (Day 0)
**Objective**: Build instant trust with the new tenant.

1.  **Welcome Pack**: Digital "Home Manual" sent to the app including Wi-Fi setup, Makani number, and nearest security contact.
2.  **Condition Sign-off**: Tenant has 48 hours to "Scan & Snap" any discrepancies. If no snaps are taken, the "Day 0" condition is solidified as the baseline for the future.
3.  **Ejari Sync**: The system auto-pushes the signed contract to the [DLD Sandbox](./LEGAL_REGULATORY_PLAYBOOK.md).

---

## 📊 4. Handover KPIs
*   **Turnover Duration**: Target < 5 Days.
*   **Condition Dispute Rate**: Target < 5%.
*   **Utility Clearance Speed**: Target < 24 Hours.
