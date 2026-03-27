# REQUEST FOR PROPOSAL & TECHNICAL SPECIFICATION
**Project Name:** BIN Group (v3.0 - FinTech & PropTech Ecosystem)
**Client:** BIN Construction - General Maintenance LLC
**Founder & CEO:** Rashid AbdulGhani
**Target Market:** United Arab Emirates (Dubai & Abu Dhabi)
**Contact:** binconstruction.ae@gmail.com

---

## 1. EXECUTIVE SUMMARY & CORE PHILOSOPHY
BIN Group is commissioning the development of the UAE’s first FinTech-Enabled Property Maintenance Ecosystem. We are replacing traditional, labor-heavy property management with a "No-Call," AI-driven, and financially integrated platform.

The build requires a modular architecture capable of scaling across thousands of high-rise units, strictly adhering to UAE Federal Data Residency laws (PDPL) and Central Bank (CBUAE) frameworks.

**Development Approach (Modular Build):**
*   **Phase 1 (MVP):** The "No-Call" Maintenance OS, RERA logic gates, automated quoting, and digital onboarding.
*   **Phase 2 (FinTech):** "Rent Now, Pay Later" (RNPL), automated UAEDDS rent pulls, CBUAE-compliant escrow logic, and the "BIN Score."

---

## 2. THE 3 CORE BUSINESS MODELS
The onboarding flow must allow landlords to select one of the following subscription tiers:

| Tier | Service Scope | Pricing Algorithm |
| :--- | :--- | :--- |
| **Option A: "Fix It"** | Maintenance Only | Dynamic: (Sq.Ft. × Rate) + Age_Multiplier |
| **Option B: "Count It"** | Finance Only | Flat % fee for rent, cheques, and Ejari/Tawtheeq |
| **Option C: "Total Care"** | Full OS (Maintenance + Finance) | 5% to 5.5% management fee auto-deducted from rent |

---

## 3. THE 4 GOLDEN PORTALS (UI/UX & CORE LOGIC)

### A. Tenant Portal (The "Uber" Experience)
*   **Visual Ticketing Gate:** The "Submit Ticket" button must remain disabled until a photo or video is uploaded. Phone numbers are removed from the UI.
*   **AI Triage & Routing:** Integration with OpenAI Vision API to auto-categorize the issue (e.g., Plumbing, AC) and assign priority.
*   **Live Tracking:** GPS integration showing the technician’s real-time approach on a map.
*   **The "BIN Score":** A proprietary credit-rating algorithm based on the tenant's payment history, unlocking "Zero-Deposit" rentals for high scorers.

### B. Owner Portal (The Asset Dashboard)
*   **Deed-to-Digital Onboarding:** OCR extraction of Title Deed PDFs to auto-populate unit size, owner name, and property details.
*   **Turnover Engine:** Triggered by a tenant move-out request. Instantly auto-generates a "Fresh Start" renovation quote for the owner to approve with one click.
*   **RERA Logic Gate & Liability Waiver:** Repairs exceeding AED 1,000 push to the owner for approval. Rejecting critical repairs triggers a mandatory digital Liability Waiver popup.
*   **Financial Wallet:** Real-time ledger showing: `Total Rent Collected - Maintenance Deductions = Net Payout`.

### C. Technician Portal (The Field Tool)
*   **Morning Stock Check Lock:** App locks daily at 08:00 AM until the technician uploads a photo of their van inventory. Low-stock triggers automated purchase orders.
*   **No Photo, No Pay:** The "Complete Job" button is disabled until a mandatory "After" photo is uploaded.
*   **Asset Tagging:** QR/Barcode scanner to log ACs and pumps, building a predictive maintenance profile for the unit.

### D. Super Admin Portal (God Mode)
*   **Live Command Center:** Map view of all active technicians, live revenue tickers, and SLA monitoring.
*   **Fraud & Compliance Freeze:** 1-click "Kill Switch" to suspend rogue tenants or landlords.

---

## 4. THE FINTECH ENGINE & FINANCIAL SETTLEMENT
*   **Instant Liquidity Button:** A FinTech module allowing owners to receive their annual rent upfront at a discounted rate (powered by RNPL/Tabby integrations).
*   **Auto-Settlement Logic:**
    1. Rent is collected via UAEDDS.
    2. System automatically deducts BIN Group’s Management Fee.
    3. System deducts any outstanding maintenance invoices.
    4. System transfers the net balance to the Owner’s IBAN within 3 working days via CBUAE API Hub.
*   **Two-Strike Suspension:** If a user misses two payments, the system automatically locks their dashboard, disabling all services (including SOS emergencies) until the balance and an AED 500 penalty are paid.
*   **Parts Markup Engine:** Technicians input wholesale part costs. The backend invisibly adds a 20% markup before presenting the final quote to the Landlord.

---

## 5. THE TECHNICAL STACK (MANDATORY)
*   **Frontend (Mobile):** Flutter (Cross-platform iOS/Android, single codebase). Must support dynamic RTL (Arabic) and LTR (English).
*   **Backend:** Node.js for high-speed API handling.
*   **Databases:** 
    *   Primary: PostgreSQL for structured financial and property data.
    *   Real-Time: Firebase for live technician tracking and push notifications.
*   **Offline-First Architecture (Critical):** Hive or SQLite. The Technician app must allow photo uploads and job closures in tower basements without 4G/5G. Data must auto-sync upon connection restoration.
*   **Hosting:** AWS Middle East (UAE South) or Moro Hub to strictly comply with the UAE Personal Data Protection Law (PDPL).

---

## 6. MANDATORY UAE API INTEGRATIONS
*   **Identity:** UAE PASS API for legally binding digital signatures and KYC.
*   **Property Data:** Dubai REST / Trakheesi API for automated Ejari generation and Title Deed OCR extraction.
*   **Building Compliance:** Mollak System API to verify cleared service charges prior to technician dispatch.
*   **Rent Collection:** UAEDDS (Direct Debit System) for automated, cheque-free monthly rent pulls.
*   **Payments & FinTech:** Stripe UAE or Network International (PCI-DSS compliant tokenization). Integration with Tabby or Postpay for RNPL functionality.
*   **AI Vision:** OpenAI GPT-4o Vision API for "Virtual Snagging" and photo triage.

---

## 7. COMPLIANCE & CYBERSECURITY (CBUAE STANDARDS)
The build must meet CBUAE Technology Risk Management Frameworks.
*   **Tokenization:** Zero storage of raw credit card or banking passwords.
*   **Escrow Smart Logic:** A digital sub-ledger for holding tenant security deposits, only releasable upon a verified move-out inspection photo.
*   **AML Screening:** Automated backend screening of all users against UAE Local Terrorist and UN Sanctions lists.
*   **MFA:** Mandatory Multi-Factor Authentication for any withdrawal or change in bank details.
*   **Explainability:** Full audit trails and logs for all automated deductions to comply with the 2026 AI Governance Framework.

---

## 8. SUBMISSION GUIDELINES FOR AGENCIES
Agencies must provide:
1. Detailed technical architecture proposal.
2. Itemized cost breakdown (Phase 1 vs. Phase 2).
3. Phased development timeline.
4. Confirmation of ability to execute CBUAE/UAEDDS/PDPL compliance.
5. Examples of previous Flutter/Node.js FinTech/PropTech builds.

**Proposals to:** binconstruction.ae@gmail.com
