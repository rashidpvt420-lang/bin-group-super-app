# BIN GROUP Super App: Complete Screen Structure

This document serves as the architectural blueprint for the BIN GROUP Super App's user interface. The app utilizes a **Single App, Multi-Role** architecture, where the interface dynamically adapts based on the authenticated user's role (Owner, Tenant, Technician, or Admin).

---

## 🧭 Role-Based Navigation Logic
The app structure is unified but the content and capabilities are gated by permissions:
*   **Owners**: Focus on Portfolio health, ROI, and high-level maintenance oversight.
*   **Tenants**: Focus on Living experience, rapid issue reporting, and rent payments.
*   **Technicians**: Focus on Field operations, task completion, and "Proof of Work".
*   **Admins**: "God-Mode" visibility into the entire ecosystem and resource allocation.

---

## 📱 Core UI Screen Inventory (Top 20)

### 1. 🏠 Home Dashboard (The Command Center)
*   **Purpose**: Immediate snapshot of relevant data.
*   **Role View Examples**:
    *   *Owner*: Total Properties, Active Contracts, Net Revenue (Monthly).
    *   *Tenant*: Maintenance status, Next Rent date, Document alerts.
    *   *Technician*: Total jobs today, Emergency queue count.

### 2. 🏢 My Properties (Portfolio Grid)
*   **Purpose**: List view of all assets under management.
*   **Data Points**: Property Name (e.g., Villa Yas Island), Occupancy status, Health Score, Total Units.

### 3. 📄 Property Details (The Digital Twin)
*   **Purpose**: Deep dive into a single asset.
*   **Tabs**: Overview, Units, Tenants, Maintenance History, Documents, Analytics.

### 4. 🏘️ Units Management
*   **Purpose**: Granular control of individual units within a tower or complex.
*   **Data Points**: Unit ID (101, 102), Tenant Link, Rent amount, Lease expiry status.

### 5. 👥 Tenant Profile
*   **Purpose**: 360-degree view of the resident.
*   **Features**: Contact info, Lease contract access, Rent payment history, and past maintenance behavior.

### 6. 🛠️ Maintenance Requests (Reporting Portal)
*   **Purpose**: Frictionless issue reporting for Tenants.
*   **Interface**: Camera-first "Visual Gate", category selection, priority flagging (Routine/Urgent/Emergency).

### 7. 📅 Work Order System (Job Dispatch)
*   **Purpose**: Workflow management for technicians.
*   **Lists**: Today's Jobs, Pending Orders, Completed Archive.

### 8. 📍 Technician GPS Tracking (Live Feed)
*   **Purpose**: Transparency and trust.
*   **View**: Map interface showing Technician location relative to the property and estimated ETA.

### 9. 💳 Payments System (The Financial Hub)
*   **Purpose**: Transactional processing.
*   **Capabilities**: Rent collection (UAEDDS), Maintenance invoicing, and automated service fee deductions.

### 10. 📊 Financial Dashboard (ROI Engine)
*   **Purpose**: Profit/Loss visualization for Owners.
*   **Charts**: Revenue trends, Expense breakdowns, and Profit margin analysis.

### 11. 📑 Contract Management
*   **Purpose**: Lifecycle management of legal relationships.
*   **Types**: Maintenance (AMC), Property Management (PM), and Integrated Contracts.

### 12. 🧮 Quotation Engine (Sales Front-End)
*   **Purpose**: Contextual pricing for new assets.
*   **Input**: Property type, Sqft, Rental status.
*   **Output**: Transparent price proposal with "Best Value" bundles.

### 13. 📄 Document Vault (Encrypted Storage)
*   **Purpose**: Centralized storage for compliance.
*   **Storage**: Title Deeds, Ejari, Inspection Reports, and Insurance Certificates.

### 14. 📡 Smart Building Monitor (IoT Layer)
*   **Purpose**: Predictive maintenance triggers.
*   **Data**: AC temperature sensors, water leak detectors, and fire system status.

### 15. 🔔 Notification Center
*   **Purpose**: Real-time engagement.
*   **Triggers**: Rent received, Job assigned, Contract expiring, SOS alerts.

### 16. 💬 Communication Center (Unified Chat)
*   **Purpose**: Eliminating fragmented WhatsApp communication.
*   **Logic**: Threaded conversations between Owner ↔ Admin, Tenant ↔ Admin, and Technician ↔ Dispatch.

### 17. 📈 Property Analytics (Portfolio Intelligence)
*   **Purpose**: Data-driven decision support.
*   **Metrics**: Yield per property, Occupancy trends, and maintenance cost forecasting.

### 18. 🧑‍🔧 Technician Panel (Field Tools)
*   **Purpose**: Mobile-first field execution.
*   **Features**: Navigation links, Tool requirements, "No-Photo, No-Pay" upload gate.

### 19. 🧑‍💼 Admin Control Panel (The "God-Mode")
*   **Purpose**: Central operations for BIN GROUP staff.
*   **Stats**: Active technicians, Platform-wide revenue, and SLA compliance monitoring.

### 20. ⚙️ Settings & User Profile
*   **Purpose**: Personalization and Security.
*   **Features**: Language (Arabic/English), MFA setup, Notification thresholds, and Payout destination (IBAN).

---

## 🛠️ Global Navigation Structure
The app uses a consistent bottom navigation bar that updates based on role:
*   **Home** (Dashboard)
*   **Properties** (Portfolio or Assigned Unit)
*   **Maintenance** (Ticketing or Work Orders)
*   **Payments** (Ledger or Invoicing)
*   **Contracts** (Legal or SLA)
*   **Profile** (Settings)
