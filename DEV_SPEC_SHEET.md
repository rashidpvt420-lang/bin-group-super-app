# BIN Group: Property Operating System (Property OS) Spec (v4.0)

**Target**: A sovereign UAE property operations platform automating the full property lifecycle.
**Clients**: Owner Portal (React), Tenant Portal (RN), Technician App (RN), Admin Hub (React).

---

## 🏗️ 1. System Architecture
*   **Frontend**: Flutter or React Native (Supports LTR + RTL for English/Arabic).
*   **Backend**: Node.js / Express or Firebase Cloud Functions.
*   **Database**: Google Cloud Firestore (NoSQL) & Realtime Database for Live Tracking.
*   **Auth**: Firebase Auth (Phone OTP primary for UAE, Email fallback).
*   **Payments**: Stripe / PayTabs (AED Currency preferred).

---

## 🗃️ 2. Database Schema (Firestore Model)

### `/users`
*   `uid`: string
*   `role`: 'owner' | 'tenant' | 'tech' | 'admin' | 'broker'
*   `language`: 'en' | 'ar'
*   `fcmToken`: string (for notifications)

### `/properties`
*   `ownerId`: string
*   `type`: 'villa' | 'apartment' | 'tower' | 'mall' | 'warehouse'
*   `builtUpArea`: number (sqft)
*   `location`: { lat: number, lng: number, community: string }
*   `registration`: { titleDeedId: string, plotNumber: string, registrationSource: 'DLD' | 'DMT' }
*   `healthScore`: number (0-100)
*   `status`: 'active' | 'vacant' | 'under_maintenance' | 'turnover'

### `/assets`
*   `propertyId`: string
*   `category`: 'HVAC' | 'Elevator' | 'Water Pump' | 'Electrical' | 'Fire System'
*   `healthScore`: number
*   `lifecycle`: { installDate: timestamp, lastService: timestamp, expectedExpiry: timestamp }
*   `telemetry`: { lastValue: string, status: 'nominal' | 'alert' }

### `/inspections`
*   `propertyId`: string
*   `type`: 'move_in' | 'move_out' | 'periodic' | 'audit'
*   `conductedBy`: string (technicianId)
*   `status`: 'scheduled' | 'in_progress' | 'completed'
*   `report`: { items: any[], photos: string[], signature: string }

### `/contracts`
*   `propertyId`: string
*   `userId`: string (ownerId)
*   `type`: 'AMC' | 'PM' | 'Enterprise'
*   `status`: 'active' | 'expired' | 'pending_signature'
*   `revenue`: { annualFee: number, depositPaid: boolean }

### `/tickets`
*   `propertyId`: string
*   `assetId`: string
*   `reportedBy`: string (tenantId | system)
*   `assignedTo`: string (technicianId)
*   `status`: 'open' | 'dispatched' | 'repaired' | 'closed'
*   `lifecycle`: {
*       `beforePhoto`: string,
*       `afterPhoto`: string,
*       `timeline`: { dispatch: timestamp, arrival: timestamp, completion: timestamp }
*   }
*   `slaStatus`: 'on_time' | 'breached'

---

## 🔗 3. Primary API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/auth/otp/send` | POST | Triggers UAE Phone Number verification. |
| `/api/properties` | GET/POST | List/Create property assets. |
| `/api/quotes/calculate`| POST | Runs the [Tender Algorithm](./PRICING_STRATEGY_UAE.md). |
| `/api/tickets/create` | POST | Initiates maintenance request with media upload. |
| `/api/tickets/assign` | PATCH | AI-based or Manual technician allocation. |
| `/api/payments/init` | POST | Generates Stripe/PayTabs checkout for rent/contracts. |

---

## 🏛️ 4. Role-Based Access Control (RBAC)

| Role | Permissions |
| :--- | :--- |
| **Owner** | CRUD own properties, Read own payments, Sign contracts. |
| **Tenant** | Create Tickets, Read own Lease/Rent logs, Use Concierge AI. |
| **Technician** | Read assigned jobs, Update status with photo-check. |
| **Admin** | Global CRUD, System configuration adjustment, SOS Overrides. |

---

## 📡 5. Advanced Integrations

### 🇦🇪 GovBridge API (Ejari / DLD)
*   **Lease Sync**: Automated pull of Ejari data to verify property occupancy.
*   **Regulatory Check**: Verification of Title Deeds against DLD databases.

### 🔌 IoT & Smart Building
*   **Inbound Webhooks**: Sensors (Water/HVAC) trigger `/api/tickets/create` automatically.
*   **Telemetry**: WebSocket stream to Admin Panel for building health.

### 🗺️ Maps & Logistics
*   **Service**: Google Maps API / Mapbox.
*   **Logic**: Geofencing technician arrival at property (Job Timer start).

---

## 🧪 6. Technical Checklist
- [ ] **RTL Support**: Full Arabic UI mirroring for all apps.
- [ ] **Data Residency**: Firestore instance pinned to UAE region.
- [ ] **Security**: UAE PDPL (Data Privacy) compliant storage and logs.
- [ ] **SLA Logic**: Background cron jobs to flag breached response times.
- [ ] **Offline Cache**: Technician app must support data sync in lift/basement areas.

---

## 🚀 7. DevOps & CI/CD
*   **Environment**: Staging (UAT) and Production.
*   **Pipeline**: GitHub Actions triggers Cloud Function deployment.
*   **Monitoring**: Sentry for error tracking, DataDog for API latency.
