# BIN Group: Dispute & Approval Workflows

These workflows handle non-standard incidents, ensuring "No-Call" trust through transparent digital mediation.

---

## 🏗️ 1. Technical Dispute (Tenant vs. Tech)
**Trigger**: Tenant marks a ticket as "Rejected" after a technician submits completion.

### Step-by-Step Logic
1.  **AI Mediation**: The system prompts the tenant: "Please upload a photo of the issue that still persists."
2.  **Comparison**: Gemini AI compares the Tech's "After Photo" with the Tenant's "Rejection Photo."
3.  **Branching**:
    *   *AI Match (Valid Dispute)*: Re-opens the ticket and re-dispatches a SENIOR technician (Level 2).
    *   *AI Mismatch (Doubtful)*: Escalates to a human Admin hub for video-call verification.

---

## 💰 2. Financial Dispute (Owner vs. Invoice)
**Trigger**: Owner flags a maintenance invoice as "Incorrect."

### Rules & Logic
*   **Automatic Freeze**: The payout of that specific amount is frozen in the [Financial Waterfall](./backend/src/functions/financialWaterfall.js).
*   **Evidence Review**: System automatically surfaces the "Part Receipt" and "Photo of Damaged Part" to the Owner.
*   **Settlement**: Owner can "Approve with Change" (e.g., requesting a 10% goodwill discount), which Admin can one-tap approve to release the remainder.

---

## 🏠 3. Move-Out Security Deposit Dispute
**Trigger**: Disagreement over "Normal Wear and Tear" vs. "Damages" during evacuation.

*   **Golden Comparison**: System retrieves "Move-In Photo (Day 0)" and "Move-Out Photo (Today)."
*   **Independent Quote**: If damage is confirmed, the [Quotation Engine](./backend/src/services/quotationService.js) generates a repair cost based on standard market rates, which is deducted from the Escrow.

---

## 📊 4. SLA Resolution Targets
| Dispute Type | Resolution Target (UAE Time) | Escalation |
| :--- | :--- | :--- |
| **Technical** | 4 Hours | Level 2 Support |
| **Financial** | 24 Hours | Finance Manager |
| **Security Deposit** | 48 Hours | COO / Admin Hub |
