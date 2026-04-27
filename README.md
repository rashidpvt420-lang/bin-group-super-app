# HOME OS - Integrated PropTech Ecosystem
**Version 1.0** | **Core Philosophy:** "No-Call" Efficiency & "Hands-Off" Wealth Management

---

## 📋 Project Overview

A comprehensive property management ecosystem consisting of:
- **Tenant App** (iOS/Android): Issue reporting with visual evidence
- **Owner App** (iOS/Android): Asset dashboard with revenue optimization
- **Technician App** (iOS/Android): Field operations & inventory management
- **Admin Panel** (Web): CEO-level real-time monitoring & control
- **Backend**: Cloud-based processing (Firebase/AWS UAE)

---

## 🏗️ Project Structure

```
bin app/
├── tenant-app/              # Tenant Portal
├── owner-app/               # Owner Dashboard
├── technician-app/          # Field Operations
├── admin-panel/             # Admin "God Mode"
├── backend/                 # Cloud Functions & APIs
├── docs/                    # Technical Documentation
│   ├── API_SPECIFICATION.md
│   ├── DATABASE_SCHEMA.md
│   ├── FINANCIAL_LOGIC.md
│   ├── INTEGRATION_GUIDE.md
│   └── DEPLOYMENT.md
└── README.md               # This file
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Firebase Project (UAE Region)
- API Keys: OpenAI, Google Maps, Stripe/Network International, WhatsApp Business

### Setup Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Setup Admin Panel
```bash
cd admin-panel
npm install
npm start
```

---

## 📱 App Implementations

### Tenant App - "The Uber Experience"
- **Visual Gate**: No photo/video = Disabled submit button
- **AI Auto-Tagging**: OpenAI Vision categorizes issues
- **SOS Toggle**: Anti-abuse with AED 150 fine warning
- **Move-Out Trigger**: Activates Turnover Engine

### Owner App - "The Asset Dashboard"
- **Turnover Engine**: Auto-generate refurbishment quotes
- **Health Score**: 0-100 metric based on ticket/PPM activity
- **Liability Waiver**: Mandatory acceptance for rejections
- **Financial Dashboard**: Real-time rent, expenses, payouts

### Technician App - "The Field Tool"
- **Morning Gate**: Stock check photo required at 08:00 AM
- **QR Code Asset Tagging**: AC/Pump inventory tracking
- **Proof of Work**: Before/After photos + digital signature
- **Offline Mode**: Download jobs for low-connectivity areas

### Admin Panel - "God Mode"
- **Live Map**: Real-time technician and SOS tracking
- **Financial Ticker**: Cash collected vs. overdue metrics
- **Broker Portal**: Agent referral tracking & credits
- **Override Controls**: Emergency suspensions, manual approvals

---

## 💰 Pricing (Hard-Coded)

### Annual Maintenance Contracts (AMC)
| Unit Type | Annual Price |
|-----------|-------------|
| Studio/1-Bed | AED 3,500 |
| Small Villa | AED 12,000 |
| Large Villa | AED 25,000 |
| Tower | AED 12/sq.ft |

### Pay-Per-Use
| Service | Price |
|---------|-------|
| Emergency Call | AED 350 |
| Turnover Studio | AED 950 |
| Turnover 1-Bed | AED 1,400 |

### Discounts & Markup
- **Enterprise Discount**: 3.3% if Owner has ≥4 buildings
- **Parts Markup**: Client Price = Cost + 20%

---

## 🔗 Required Integrations

| Service | Purpose |
|---------|---------|
| **Google Maps API** | Technician real-time tracking |
| **OpenAI/Gemini Vision** | Image analysis & auto-categorization |
| **Stripe/Network International** | Payment processing |
| **WhatsApp Business API** | Rent reminders & notifications |
| **Firebase/AWS** | Cloud backend & database |

---

## 📊 Key Features

### Financial Logic - "Total Care"
Rent Collection Waterfall:
1. Deduct BIN Group Management Fee (5%)
2. Deduct Outstanding Maintenance Invoices
3. Transfer Remaining to Owner

### Suspension Rules - "Two-Strike"
- IF Unpaid Invoices ≥ 2:
  - Block Owner App Access
  - Suspend Emergency Services
  - Send Payment Alert

---

## 📖 Documentation

- [API Specification](docs/API_SPECIFICATION.md) - All endpoints
- [Database Schema](docs/DATABASE_SCHEMA.md) - Collections & fields
- [Financial Logic](docs/FINANCIAL_LOGIC.md) - Algorithms & formulas
- [Integration Guide](docs/INTEGRATION_GUIDE.md) - API setup
- [Deployment](docs/DEPLOYMENT.md) - Production checklist

---

## 👥 Team Roles

- **Frontend Engineers**: Mobile apps (React Native/Flutter) & Web (Next.js)
- **Backend Engineers**: Cloud functions & API development
- **DevOps**: Firebase/AWS setup, CI/CD pipelines
- **QA**: Manual testing & automation frameworks
- **Product Manager**: Roadmap execution & stakeholder alignment

---

## ⚠️ KNOWN OPERATIONAL LIMITS (V1.0)

- **iPhone Push Connectivity**: Background wake-up and real-time delivery on iOS strictly depend on the user installing the app as a **PWA / Home Screen Standalone** node.
- **Summary Data Lag**: Asynchronous summary documents (Owner/Admin dashboards) may experience a brief propagation lag (2-5 seconds) under peak operational load.
- **SMS Fallback Protocols**: Automated SMS/Voice fallbacks for emergency missions require active carrier white-listing and institutional account funding if activated.

---

## 🔒 Security & Compliance

- All phone numbers hidden by default
- Legal liability waivers enforced at system level
- Audit logs for all financial transactions
- Role-based access control (RBAC) for admin functions

---

## 📞 Contact & Support

For technical questions, refer to the [docs](docs/) folder. This document is the master blueprint for your development team.

**Your work: Execute.**
