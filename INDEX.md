# BIN Group PropTech Ecosystem v3.0

This repository contains the functional prototype and technical foundation for the BIN Group ecosystem, a "No-Call" FinTech-enabled property maintenance and management platform for the UAE market.

## 📁 Project Structure

* **/admin-panel**: React/TypeScript dashboard for God-Mode control, pricing intelligence, and SOS management.
* **/owner-app**: React/TypeScript portal for landlords to track asset health, financials, and approve turnover renovations.
* **/tenant-app**: React Native (Expo) app featuring the "Uber-style" camera-first ticketing gate and SOS redirects.
* **/technician-app**: React Native (Expo) app with "No-Photo, No-Pay" job closure logic and stock check gates.
* **/backend**: Node.js/Express API acting as the central engine for business rules, pricing, and triage.

## 🚀 Key Functional Modules

1. **Pricing Engine**: Verified algorithms for AMC (SqFt based), Smart Management (Rent %), and Executive (Hybrid) packages.
2. **Golden Screens**:
    * **Tenant**: Full-screen map + Camera-only ticketing (Golden Screen A).
    * **Owner**: Automatic Move-Out "Fresh Start" Upsell Pulse (Golden Screen B).
    * **Technician**: Hard-locked photo verification and Panic SOS Button (Golden Screen C).
3. **Risk & Compliance**:
    * **SOS AI Triage**: Detects critical keywords (Fire/Gas) and redirects to UAE 997/999.
    * **User Agreement**: PDPL-compliant digital onboarding with explicit financial authority.
    * **Kill Switch**: Admin ability to freeze rogue accounts instantly.
4. **Financial Ledger**: Automated simulation of `Rent - Fee - Maintenance = Net Payout` flow.

## 📜 Strategic & Technical Blueprint

* **[Technical Specification v3.0](./BIN_Group_Technical_Specification_v3_0.md)**: Full RFP and technical requirements.
* **[PRD Version 2.0](./PRD_VERSION_2.md)**: Product Roadmap, AI specs, and Tenant Super Portal requirements.
* **[DEV Spec Sheet](./DEV_SPEC_SHEET.md)**: Technical architecture, API endpoints, and database models.
* **[Market Domination Strategy](./MARKET_DOMINATION_STRATEGY.md)**: 100M AED growth roadmap and competitive moats.
* **[25 Power Features](./POWER_FEATURES.md)**: The competitive feature set for Owners, Tenants, and Technicians.
* **[Strategic Differentiators](./STRATEGIC_DIFFERENTIATORS.md)**: AI, Blockchain, and IoT ecosystem specs for market dominance.
* **[Competitive Edge 2026](./COMPETITIVE_EDGE_2026.md)**: Top 12 must-have features for UAE market leadership.
* **[Executive Roadmap](./ROADMAP.md)**: 16-week timeline and 90-day feature prioritization.
* **[Firebase Schema v3.0](./FIREBASE_SCHEMA.md)**: Master 12-collection architecture for multi-tenant PropTech scalability.
* **[UI/UX Screen Map](./UI_UX_SCREEN_MAP.md)**: End-to-end navigational flows for all roles.
* **[GTM Strategy (UAE)](./GTM_STRATEGY_UAE.md)**: Phased launch and expansion roadmap.
* **[Complete Operational Workflow](./OPERATIONAL_WORKFLOW.md)**: End-to-end process from onboarding to payouts.
* **[Complete Screen Structure](./COMPLETE_SCREEN_STRUCTURE.md)**: 20 core screens blueprint for Owners, Tenants, and Technicians.
* **[Pricing Strategy (UAE)](./PRICING_STRATEGY_UAE.md)**: Benchmarked commercial models and discount logic.
* **[AI Risk Prediction Engine](./AI_RISK_PREDICTION.md)**: Predictive asset protection and competitive moat.
* **[Quotation Engine UI & Logic](./QUOTATION_ENGINE_UI_LOGIC.md)**: Automated contract pricing and recommendation flows.
* **[Data & Compliance Plan](./DATA_COMPLIANCE_PLAN.md)**: UAE PDPL framework and operational checklist.
* **[Privacy Policy](./PRIVACY_POLICY.md)**: Legal-ready data processing notice.
* **[Terms of Service](./TERMS_OF_SERVICE.md)**: Platform usage and financial compliance terms.
* **[UX/UI High-Fidelity Wireframes](./UI_WIRE_FRAMES.md)**: Premium layouts for Owners and Technicians.
* **[Legal & Regulatory Playbook](./LEGAL_REGULATORY_PLAYBOOK.md)**: UAE PASS, DLD/Ejari, and RERA compliance.
* **[Security & Compliance Audit Specs](./SECURITY_COMPLIANCE_SPECS.md)**: UAE PDPL and VAT/FTA infrastructure standards.
* **[Vendor Onboarding & Vetting](./VENDOR_ONBOARDING_WORKFLOW.md)**: Marketplace entrance RFP and verification funnel.
* **[Communication & Notification Matrix](./COMMUNICATION_MATRIX.md)**: Bilingual templates for WhatsApp, SMS, and Push.
* **[Community Pricing Benchmarks](./DATA_COMMUNITY_BENCHMARKS.json)**: RERA-aligned data for the Quotation Engine.
* **[IoT Integration Protocol](./IOT_INTEGRATION_PROTOCOL.md)**: Standard operating procedure for smart building sensors.
* **[Localization & RTL Strategy](./LOCALIZATION_STRATEGY.md)**: Master plan for Native Arabic and cultural alignment.
* **[DevOps & Scalability Runbook](./DEVOPS_SCALABILITY_RUNBOOK.md)**: Cloud infrastructure and scaling strategy for the Middle East.
* **[Frontend App Architecture](./FRONTEND_ARCHITECTURE.md)**: Role-based navigation and React Native project structure.
* **[Payment & Escrow Service](./backend/src/services/paymentService.js)**: Logic for Stripe, rent collection, and vendor payouts.
* **[QR Asset Tagging Schema](./ASSET_TAG_SCHEMA.md)**: Digital heartbeat for physical property assets.
* **[Dispute & Approval Workflows](./DISPUTE_RESOLUTION_FLOW.md)**: Decentralized mediation for technical and financial issues.
* **[QA Blueprint & Test Scenarios](./TEST_SCENARIOS.md)**: 50+ test cases to certify the app for UAE production.
* **[AI Concierge Persona & Logic](./AI_CONCIERGE_SPEC.md)**: The "Face of BIN Group" behavior and guardrails.
* **[ESG & Sustainability Framework](./ESG_SUSTAINABILITY_SPEC.md)**: Energy/Water tracking for Institutional REIT reporting.
* **[Growth & Loyalty Matrix](./GROWTH_LOYALTY_MATRIX.md)**: Referral programs and retention triggers for UAE expansion.
* **[App Store Deployment Guide](./STORE_DEPLOYMENT_CHECKLIST.md)**: Compliance requirements for UAE-specific app launches.
* **[Admin Command Center (God Mode)](./ADMIN_COMMAND_CENTER.md)**: Global overrides, crisis management, and broadcast tools.
* **[Offline-First Sync Strategy](./OFFLINE_SYNC_STRATEGY.md)**: Logic for technician operations in zero-signal areas.
* **[Third-Party Integration Directory](./INTEGRATION_DIRECTORY.md)**: Master provisioning list for API and service accounts.
* **[API Specification (v1.0)](./API_SPECIFICATION.md)**: Standardized request/response schemas for frontend-backend sync.
* **[Deep-Link & Universal Link Strategy](./DEEP_LINK_STRATEGY.md)**: Routing logic for one-tap WhatsApp and SMS transitions.
* **[Property Handover Protocol](./HANDOVER_PROTOCOL.md)**: Move-in/Move-out automation and utility clearance.
* **[Data Intelligence & KPI Spec](./DATA_INTELLIGENCE_SPEC.md)**: Formulas for churn, ROI, and maintenance efficiency.
* **[Developer Environment Setup](./DEV_SETUP_GUIDE.md)**: Zero-to-hero onboarding for new engineering hires.

---
_Created for: Rashid AbdulGhani | BIN Construction - General Maintenance LLC_
