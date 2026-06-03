# HOME OS - Integrated PropTech Ecosystem
**Version 1.0** | **Core Philosophy:** "No-Call" Efficiency & "Hands-Off" Wealth Management

---

## 📋 Project Overview

A comprehensive property management ecosystem consisting of:
- **Tenant App** (PWA/mobile-ready): Issue reporting with visual evidence
- **Owner App** (PWA/mobile-ready): Asset dashboard with revenue optimization
- **Technician App** (PWA/mobile-ready): Field operations & inventory management
- **Admin Panel** (Web): CEO-level real-time monitoring & control
- **Backend**: Cloud-based processing with Firebase Functions, Firestore, Storage, and optional external providers

> **Important launch note:** This repository includes the app architecture and technical capability for Maps, AI triage, payment processing, WhatsApp/SMS notifications, and cloud operations. External provider activation, billing, production credentials, webhook verification, and live end-to-end testing are required before those services can be marketed as production-live.

---

## 🏗️ Project Structure

```
bin app/
├── tenant-app/              # Tenant Portal
├── owner-app/               # Owner Dashboard
├── technician-app/          # Field Operations
├── admin-panel/             # Admin Command Center
├── backend/                 # Cloud Functions & APIs
├── docs/                    # Technical Documentation
│   ├── API_SPECIFICATION.md
│   ├── DATABASE_SCHEMA.md
│   ├── FINANCIAL_LOGIC.md
│   ├── INTEGRATION_GUIDE.md
│   ├── LAUNCH_INTEGRATION_READINESS.md
│   └── DEPLOYMENT.md
└── README.md               # This file
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Firebase project and Firebase CLI
- Environment variables for Firebase browser configuration
- Firebase Functions secrets for backend-only credentials
- Optional external provider accounts for launch features:
  - Google Maps Platform
  - OpenAI or Gemini Vision
  - Stripe or Network International
  - WhatsApp Business API
  - SMS/voice provider if emergency fallback is activated

### Setup Backend
```bash
cd functions
npm install
npm run build
```

### Setup App
```bash
npm install
npm run build
npm run dev
```

### Deploy
```bash
firebase deploy --project bin-group-57c60
```

---

## 📱 App Implementations

### Tenant App - "The Uber Experience"
- **Visual Gate**: Photo evidence required before dispatch
- **AI Auto-Tagging**: Optional AI Vision categorization once provider credentials are activated
- **SOS / Emergency Priority**: Emergency request path with shorter SLA target
- **Move-Out Trigger**: Activates Turnover Engine where property management is active

### Owner App - "The Asset Dashboard"
- **Turnover Engine**: Auto-generate refurbishment quotes
- **Health Score**: 0-100 metric based on ticket/PPM activity
- **Liability Waiver**: Mandatory acceptance for critical repair rejection flows
- **Financial Dashboard**: Rent, expenses, contract value, and payout visibility

### Technician App - "The Field Tool"
- **Morning Gate**: Stock/check-in workflow for field readiness
- **QR Code Asset Tagging**: AC/pump/equipment inventory tracking
- **Proof of Work**: Before/after photos + digital signature
- **Map/Job Flow**: Technician job routing when Maps and dispatch are active

### Admin Panel - "Command Center"
- **Live Map**: Real-time technician and SOS tracking when Maps integration is active
- **Financial Ticker**: Cash collected vs. overdue metrics
- **Broker Portal**: Agent referral tracking & credits
- **Override Controls**: Emergency suspensions, manual approvals, contract activation, and payment approval

---

## 💰 Pricing

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

## 🔗 External Integrations & Launch Status

| Service | Purpose | Production status requirement |
|---------|---------|-------------------------------|
| **Google Maps Platform** | Property GPS, technician tracking, live map, dispatch support | API keys, billing, domain restrictions, and map tests required |
| **OpenAI/Gemini Vision** | Maintenance image analysis and auto-categorization | Backend secret, billing, model selection, fallback, and manual review required |
| **Stripe/Network International** | Owner payments, invoices, mobilization fees, card payments | Merchant approval, production keys, webhook verification, and failure/refund tests required |
| **WhatsApp Business API** | Rent reminders, ticket updates, payment confirmations | Business verification, approved templates, token security, and opt-in policy required |
| **Firebase** | Authentication, Firestore, Functions, Storage, hosting, notification foundation | Rules, indexes, secrets, logs, and role-isolation tests required |
| **AWS / UAE-hosted services** | Optional hosting/data residency layer for institutional clients | Final architecture and data-processing position required before claiming UAE data residency |

For the full checklist, see [Launch Integration Readiness](docs/LAUNCH_INTEGRATION_READINESS.md).

---

## ✅ Public Launch Verification Gates

Before serious public launch, verify:

1. Google Maps key is live and restricted correctly.
2. Payment gateway is live or clearly marked as manual/admin verification only.
3. WhatsApp/SMS notification flow is approved before being marketed as live.
4. Storage upload rules are secure and evidence upload paths match app code.
5. Admin payment approval unlocks dashboards correctly.
6. Technician dispatch works end-to-end.
7. Arabic/English RTL is complete across public, owner, tenant, technician, broker, and admin screens.
8. Owner, tenant, technician, broker, auditor, and admin roles cannot access each other's private data.
9. Every ticket has proof, location, SLA, status history, and audit record.
10. UAE data hosting/compliance position is documented.

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
- [Launch Integration Readiness](docs/LAUNCH_INTEGRATION_READINESS.md) - Provider activation and launch gates
- [Deployment](docs/DEPLOYMENT.md) - Production checklist

---

## 👥 Team Roles

- **Frontend Engineers**: React/PWA portals and dashboard UX
- **Backend Engineers**: Cloud Functions, Firestore, security rules, API integration
- **DevOps**: Firebase/AWS setup, CI/CD, monitoring, secrets, regional architecture
- **QA**: Manual testing and automation
- **Product Manager**: Roadmap, launch gate ownership, stakeholder alignment

---

## ⚠️ KNOWN OPERATIONAL LIMITS (V1.0)

- **iPhone Push Connectivity**: Background wake-up and real-time delivery on iOS strictly depend on the user installing the app as a **PWA / Home Screen Standalone** node.
- **Summary Data Lag**: Asynchronous summary documents (Owner/Admin dashboards) may experience a brief propagation lag (2-5 seconds) under peak operational load.
- **SMS Fallback Protocols**: Automated SMS/Voice fallbacks for emergency missions require active carrier approval, account funding, and operational runbooks.
- **Provider Activation**: Maps, AI Vision, payment gateway, WhatsApp, and SMS must pass the launch readiness gates before being sold as live services.

---

## 🔒 Security & Compliance

- All phone numbers hidden by default where role context does not require visibility
- Legal liability waivers enforced at system level for critical repair rejection flows
- Audit logs for financial and operational actions
- Role-based access control (RBAC) for admin functions
- Firebase Storage Rules restrict evidence, contracts, invoices, owner documents, tenant documents, and KYC files by role and ownership context
- UAE hosting/data-processing position must be finalized before claiming UAE data residency

---

## 📞 Contact & Support

For technical questions, refer to the [docs](docs/) folder. This document is the master blueprint for your development team.

**Your work: Execute.**
