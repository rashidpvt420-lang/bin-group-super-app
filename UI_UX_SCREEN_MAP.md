# BIN Group: UI/UX Screen Map

This map outlines the navigation flow and core screen requirements for the four primary user roles in the BIN Group ecosystem. It is designed to maximize operational efficiency and reduce friction in the "No-Call" environment.

---

## 🏛️ Owner Flow (Asset Management Dashboard)

**Goal**: Provide high-level visibility into property health, ROI, and contract status.

1. **Splash → Onboarding**: QR/Phone login with role identification.
2. **Owner Dashboard**:
    * **Property Health Score**: Cumulative score (0-100).
    * **Revenue Summary**: Total Rent vs. Maintenance Expenses.
    * **Upcoming SLA Alerts**: Critical renewals or inspections.
3. **Property Management**:
    * **Portfolio List**: Filter by location/type.
    * **Asset Lifecycle**: View equipment RUL (Remaining Useful Life).
    * **Finance Tab**: Real-time payout ledger (Waterfall logic).
4. **Reporting**:
    * **Analytics Export**: PDF/CSV for cost breakdowns and issue trends.
5. **Settings**: Notification preferences and bank details (UAE IBAN).

---

## 🏢 Tenant Flow (The "Uber" Experience)

**Goal**: Rapid issue reporting and real-time maintenance tracking.

1. **Home Dashboard**:
    * **Report Issue Button**: Prominent call-to-action.
    * **Current Tickets**: Live status of active jobs.
    * **Lease Details**: Document vault (Ejari/Contract).
2. **Maintenance Visual Gate**:
    * **Camera Interface**: Mandatory Photo/Video upload.
    * **AI Triage Results**: Real-time category suggestion.
3. **Ticket Tracking**:
    * **Map View**: Live technician GPS tracking.
    * **Status Timeline**: Dispatch -> On-site -> Completion.
4. **Payments & SOS**:
    * **Bill Pay**: Rent and service fee portal.
    * **Emergency SOS**: Critical keyword detection (Fire/Gas) redirecting to 999.

---

## 🧑‍🔧 Technician Flow (Operational Field Tool)

**Goal**: Accurate job closure and inventory management.

1. **Morning Gate**:
    * **Inventory Check**: Mandatory van inventory photo to unlock jobs.
2. **Job Queue**:
    * **Prioritized List**: Sorted by SLA and VIP status.
    * **Navigation**: Direct link to property location.
3. **Proof of Work Interface**:
    * **Before/After Photos**: Required for invoice generation.
    * **QR Scanner**: Validate assets being serviced.
    * **Digital Signature**: Tenant verification of job completion.
4. **Earnings Tracker**:
    * **Performance Metrics**: Commission tracking and SLA compliance.

---

## 🏙️ Admin / Dispatch Panel (Web Command Center)

**Goal**: "God-Mode" monitoring and manual dispatch overrides.

1. **Global Command Center**:
    * **Live Map**: Real-time position of all technicians.
    * **Revenue Tickers**: Live income tracking.
2. **SLA & Support**:
    * **Ticket Pipeline**: Monitor bottlenecks and SLA breaches.
    * **SOS Feed**: Instant alerts for emergency triggers.
3. **Finance & Reconciliation**:
    * **Rent Management**: Track UAEDDS status and payment failures.
    * **Two-Strike Engine**: Automate account suspensions for late payers.
4. **Platform Controls**:
    * **KYC / User Management**: Approve/suspend owners and brokers.
    * **Global Settings**: Update pricing tiers and markup percentages.
