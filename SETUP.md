# HOME OS - Developer Setup & Getting Started

**Version 1.0 | February 2026**

Welcome to the HOME OS ecosystem. This document will guide your team from setup to production deployment.

---

## 📋 Project Overview

HOME OS is a comprehensive PropTech platform consisting of:

| Component | Platform | Purpose |
|-----------|----------|---------|
| **Tenant App** | iOS/Android | Issue reporting with visual evidence |
| **Owner App** | iOS/Android | Property dashboard & financial management |
| **Technician App** | iOS/Android | Field operations & job management |
| **Admin Panel** | Web (React) | CEO-level command center |
| **Backend API** | Node.js/Firebase | Central business logic |

---

## 🚀 Quick Start (5 minutes)

### 1. Clone Repository
```bash
git clone https://github.com/your-org/homeos.git
cd homeos
```

### 2. Install Dependencies

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with actual values (see SETUP.md)
npm run dev
```

**Tenant App:**
```bash
cd ../tenant-app
npm install
npm run start:ios  # or start:android
```

**Owner App:**
```bash
cd ../owner-app
npm install
npm run start:ios  # or start:android
```

**Technician App:**
```bash
cd ../technician-app
npm install
npm run start:ios  # or start:android
```

**Admin Panel:**
```bash
cd ../admin-panel
npm install
npm start
```

---

## 📁 Project Structure

```
homeos/
├── backend/
│   ├── src/
│   │   ├── config/              # Firebase, external APIs
│   │   ├── routes/              # API endpoints
│   │   ├── services/            # Business logic
│   │   ├── middleware/          # Auth, validation
│   │   ├── utils/               # Helpers, logger
│   │   └── index.js             # Entry point
│   ├── tests/                   # Unit & integration tests
│   ├── package.json
│   └── .env.example
│
├── tenant-app/
│   ├── src/
│   │   ├── screens/             # UI screens
│   │   ├── services/            # API calls, Firebase
│   │   ├── context/             # State management
│   │   ├── components/          # Reusable components
│   │   └── App.tsx              # Navigation
│   ├── ios/                     # Native iOS code
│   ├── android/                 # Native Android code
│   └── package.json
│
├── owner-app/                   # Same structure as tenant-app
├── technician-app/              # Same structure as tenant-app
│
├── admin-panel/
│   ├── src/
│   │   ├── pages/               # Website pages
│   │   ├── components/          # UI components
│   │   ├── context/             # State management
│   │   ├── services/            # API client
│   │   └── App.tsx              # Main app
│   ├── public/
│   └── package.json
│
├── docs/
│   ├── API_SPECIFICATION.md     # All endpoints
│   ├── DATABASE_SCHEMA.md       # Firestore collections
│   ├── FINANCIAL_LOGIC.md       # Pricing & calculations
│   ├── INTEGRATION_GUIDE.md     # Third-party setup
│   ├── DEPLOYMENT.md            # Launch checklist
│   └── SETUP.md                 # Environment configuration
│
└── README.md                    # This file
```

---

## 🔑 Key Features Implementation Status

### Core Systems
- [ ] **Authentication System** (JWT + Firebase Auth)
- [ ] **User Roles** (Tenant, Owner, Technician, Admin)
- [ ] **Real-time Database** (Firestore)
- [ ] **Cloud Functions** (Firebase)
- [ ] **API Rate Limiting** (Express middleware)

### Tenant App Features
- [x] **Visual Gate** (Photo/Video requirement for ticket creation)
- [ ] **AI Auto-Tagging** (OpenAI Vision integration)
- [ ] **SOS Toggle** (With AED 150 fine warning)
- [ ] **Move-Out Trigger** (Turnover engine activation)
- [ ] **Ticket Tracking** (Real-time updates)

### Owner App Features
- [ ] **Turnover Engine** (Auto-generate quotes based on unit size)
- [ ] **Health Score Widget** (0-100 metric display)
- [ ] **Liability Waiver** (Mandatory for critical repairs)
- [ ] **Financial Dashboard** (Rent collected, expenses, net payout)
- [ ] **Property Management** (Units, tenants, lease tracking)

### Technician App Features
- [ ] **Morning Gate** (08:00 AM stock check)
- [ ] **QR Code Asset Tagging** (Inventory tracking)
- [ ] **Proof of Work** (Before/After photos + signature)
- [ ] **Daily Schedule** (Job assignments)
- [ ] **Location Tracking** (Real-time, Google Maps)

### Admin Panel Features
- [ ] **Live Map** (Technician tracking)
- [ ] **Financial Ticker** (Cash collected vs. overdue)
- [ ] **Broker Portal** (Agent referral tracking)
- [ ] **Owner Suspension** (Two-strike rule automation)
- [ ] **Reports** (Analytics dashboard)

---

## 🔐 Authentication Flow

All users authenticate via Firebase Auth:

```
User Credentials
    ↓
Firebase Auth.signInWithEmailAndPassword()
    ↓
Firebase returns JWT
    ↓
Store JWT in AsyncStorage (mobile) / LocalStorage (web)
    ↓
Include JWT in all API requests: Authorization: Bearer <JWT>
    ↓
Backend verifies JWT + checks role/permissions
```

**Roles:**
- `TENANT`: Can create tickets, request move-out
- `OWNER`: Can manage properties, view financials
- `TECHNICIAN`: Can view jobs, submit proof of work
- `ADMIN`: Full system access

---

## 💾 Database Collections

**Key Collections (see [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) for full details):**

- `users/` - User accounts
- `tenants/` - Tenant data
- `owners/` - Property owner data
- `technicians/` - Field technician profiles
- `properties/` - Buildings/complexes
- `units/` - Individual apartments/villas
- `tickets/` - Maintenance requests
- `turnover-quotes/` - Move-out refurbishment quotes
- `jobs/` - Technician work orders
- `invoices/` - Billing records
- `payments/` - Financial transactions
- `audit-logs/` - Compliance logs

**Backup Strategy:**
- Daily snapshots to AWS S3
- 7-day retention
- Real-time replication to secondary region

---

## 🌐 API Endpoints

**Base URL:** `https://api.homeos.ae`

### Tenant Endpoints
```
POST   /api/tickets/create                      # Report issue
POST   /api/units/moveout-request               # Request move-out
GET    /api/tickets/{id}                        # Track ticket status
```

### Owner Endpoints
```
GET    /api/owner/turnover-quotes/{unitId}     # Get quote
POST   /api/owner/turnover-quotes/{quoteId}/approve
GET    /api/owner/{id}/properties/{propId}/health-score
GET    /api/owner/{id}/financials              # Financial summary
```

### Technician Endpoints
```
POST   /api/technician/morning-check-in        # Morning Gate
POST   /api/technician/assets/register         # Register asset
POST   /api/technician/jobs/{id}/close         # Complete job
GET    /api/technician/{id}/schedule           # Daily schedule
```

### Admin Endpoints
```
GET    /api/admin/technicians/live-map         # Live tracking
GET    /api/admin/financials/daily             # Financial ticker
GET    /api/admin/sos-tickets/live             # Active SOS tickets
POST   /api/admin/owners/{id}/suspend          # Suspend owner
```

📖 **Full API documentation:** [API_SPECIFICATION.md](docs/API_SPECIFICATION.md)

---

## 💰 Pricing Constants

**Hard-coded in backend (do not modify without approval):**

```javascript
// Annual Maintenance Contracts
AMC_STUDIO_1BED = 3500      // AED
AMC_VILLA_SMALL = 12000     // AED
AMC_VILLA_LARGE = 25000     // AED
AMC_TOWER = 12              // AED per sq.ft

// Pay-Per-Use
EMERGENCY_CALL = 350        // AED
TURNOVER_STUDIO = 950       // AED
TURNOVER_1BED = 1400        // AED

// Markup & Discounts
PARTS_MARKUP = 20           // Percent
ENTERPRISE_DISCOUNT = 3.3   // Percent (if owner has >= 4 properties)
BIN_MANAGEMENT_FEE = 5      // Percent (of rent collected)
```

---

## 🔗 Third-Party Integrations

| Service | Purpose | Setup |
|---------|---------|-------|
| **Google Maps API** | Technician real-time tracking | [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md#1-google-maps-api) |
| **OpenAI Vision** | Image analysis & auto-categorization | [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md#2-openai-vision-api) |
| **Stripe** | Payment processing | [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md#3-stripe--network-international) |
| **WhatsApp Business** | Notifications & reminders | [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md#4-whatsapp-business-api) |
| **Firebase** | Backend & database | [INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md#5-firebase) |

All API keys go in `.env` file (never commit).

---

## ✅ Testing

### Unit Tests
```bash
cd backend
npm test

cd tenant-app
npm run test

# Run with coverage
npm test -- --coverage
```

### Integration Tests
```bash
cd backend
npm run test:integration
```

### E2E Tests (Cypress)
```bash
npm run cy:open      # Interactive mode
npm run cy:run       # Headless mode
```

---

## 🚢 Deployment

### Staging
```bash
# Deploy to staging environment
npm run deploy:staging

# Verify: https://staging.homeos.ae
```

### Production
```bash
# Only by DevOps/Tech Lead
npm run deploy:production

# See full checklist: docs/DEPLOYMENT.md
```

---

## 📞 Financial Logic

### Rent Collection Waterfall (Order matters!)
```
Tenant pays: AED 2,500
    ↓
Deduct BIN Group Fee (5%): -AED 125
    ↓
Deduct Outstanding Invoices: -AED 630
    ↓
Net Transfer to Owner: +AED 1,745
```

### Two-Strike Suspension Rule
```
IF (Unpaid Invoices >= 2) THEN:
  - Block Owner App Access
  - Suspend Emergency Services
  - Send Payment Alert
```

### Health Score Calculation
```
Base: 100 points
- 5 points per open ticket
+ 10 points per completed preventive maintenance
- 5 points per late payment
+ 15 points if avg tenant rating >= 4.5
+ Variable (0-43) based on ticket resolution speed
```

📖 **Full financial guide:** [FINANCIAL_LOGIC.md](docs/FINANCIAL_LOGIC.md)

---

## 🔒 Security Checklist

- [ ] All passwords hashed with bcrypt
- [ ] JWT tokens signed with 256-bit key
- [ ] HTTPS everywhere (Production)
- [ ] CORS configured to whitelist only approved domains
- [ ] Rate limiting enabled (100 requests/min per user)
- [ ] SQL injection prevention (Parameterized queries)
- [ ] Phone numbers hidden by default
- [ ] Payment data encrypted with AES-256
- [ ] Audit logs for all financial transactions
- [ ] Penetration testing completed quarterly

---

## 🐛 Debugging & Support

### Common Issues

**"Firebase initialization failed"**
```bash
# Check .env has valid Firebase credentials
printenv | grep FIREBASE
```

**"Image analysis returning null"**
```bash
# Verify OpenAI API key and model name
printenv | grep OPENAI
```

**"Payment processing stuck"**
```bash
# Check Stripe webhook logs
stripe logs --live
```

### Get Help
- **Documentation:** [docs/](docs/) folder
- **Issues:** GitHub Issues with `[BUG]` or `[FEATURE]` prefix
- **Chat:** Slack channel `#homeos-tech`
- **Email:** tech-support@homeos.ae

---

## 📊 Team Roles & Responsibilities

| Role | Responsibilities |
|------|-----------------|
| **Frontend Lead** | Mobile apps (React Native) & web (React) |
| **Backend Lead** | API development, Firebase, payment processing |
| **DevOps Lead** | Infrastructure, CI/CD, monitoring |
| **QA Lead** | Test automation, manual testing, UAT |
| **Product Manager** | Roadmap, prioritization, stakeholder updates |
| **Designer** | UI/UX, wireframes, design system |

---

## 📈 Success Metrics

**Launch Success Criteria:**
- ✅ 99.5% system uptime
- ✅ < 0.5% error rate
- ✅ < 500ms API response time (p95)
- ✅ 500+ sign-ups in 24 hours
- ✅ 0 data loss incidents
- ✅ 99% payment success rate

**Ongoing KPIs:**
- Monthly Active Users (MAU)
- Average Ticket Resolution Time
- Payment Collection Rate
- Customer Satisfaction (NPS)

---

## 🎯 Next Steps

1. **Set up environments:** Run setup scripts in each project folder
2. **Configure `.env` files:** See `.env.example` in each directory
3. **Run tests:** Verify all systems working
4. **Review documentation:** Read through [docs/](docs/) folder
5. **Start development:** Pick a feature and begin implementation

---

## 📚 Additional Resources

- [API Specification](docs/API_SPECIFICATION.md) - All endpoints
- [Database Schema](docs/DATABASE_SCHEMA.md) - Data models
- [Financial Logic](docs/FINANCIAL_LOGIC.md) - Pricing algorithms
- [Integration Guide](docs/INTEGRATION_GUIDE.md) - Third-party setup
- [Deployment Guide](docs/DEPLOYMENT.md) - Production launch

---

## 📝 License

Property of HOME OS. All rights reserved.

---

**Questions? Contact: tech-lead@homeos.ae**

**Your work: Execute.**
