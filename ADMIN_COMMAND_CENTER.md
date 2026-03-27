# BIN Group: Admin Command Center (God Mode)

The Admin Center is the centralized hub for BIN Group operations staff to manage the ecosystem, override automated logic, and handle emergencies.

---

## 🏗️ 1. High-Level Operations (Super Admin)
| Action | Purpose | Permission Level |
| :--- | :--- | :--- |
| **Global Broadcast** | Send Push/SMS to all users in a specific community (e.g., "Water maintenance in JVC tomorrow"). | Lvl 3 (Ops Dir) |
| **Manual Payout Freeze**| Halt a vendor's [Financial Waterfall](./backend/src/functions/financialWaterfall.js) due to a dispute. | Lvl 2 (Finance) |
| **User Kill-Switch** | Instantly ban a rogue tenant or vendor for policy violations. | Lvl 3 (Ops Dir) |
| **Fee Override** | Manually waive a tenant's late fee for customer-service reasons. | Lvl 2 (Admin) |

---

## 🚨 2. Crisis Management (SOS Hub)
When an [SOS AI Triage](./AI_CONCIERGE_SPEC.md) event is triggered:
1.  **Red Alert**: The Admin Dashboard flashes red and plays an audible alarm.
2.  **Live View**: Admin sees the exact GPS location of the user and the live camera feed (if shared).
3.  **One-Tap Dispatch**: Admin can force-dispatch the nearest "Rapid Response" team, bypassing the standard queue.

---

## 📊 3. Marketplace Integrity Control
*   **Vendor Tiering**: Manual adjustment of vendor "Reputation Scores" based on site inspections.
*   **Commission Adjustments**: Ability to change the 15% marketplace fee for specific strategic partners (e.g., a "Gold Vendor" with 0% fee for their first 100 jobs).

---

## 🔒 4. Audit & Logging
Every admin action is recorded in the `action_logs` collection with a SHA-256 hash. NO admin action can be deleted, ensuring full accountability for financial overrides.
