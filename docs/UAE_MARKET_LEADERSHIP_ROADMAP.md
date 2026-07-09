# BIN GROUP UAE Market Leadership Roadmap

**Date:** 2026-07-04

## Goal

Make BIN GROUP stronger than generic property-management platforms by becoming the UAE-first **No-Call Maintenance & Property Operations OS**.

## Positioning

**Promise:** Every issue tracked. Every repair verified. Every owner protected.

BIN GROUP should not copy Buildium, AppFolio, MRI, or similar platforms screen-for-screen. Those platforms are strong in property management, accounting, leasing, owner/tenant portals, maintenance tracking, reports, and enterprise portfolio operations. BIN GROUP should win with UAE-local execution: Arabic/English, technician proof, GPS, SLA, owner evidence, broker attribution, and simple maintenance workflows.

## First market wedge

Start with UAE landlords and property managers with **5-100 units** who are tired of WhatsApp maintenance chaos. Prove the system in Al Ain / Abu Dhabi first, then expand to Dubai, Sharjah, schools, hotels, malls, mosques, majlis, and institutional clients.

## Core product rules

1. Tenant should report and track repairs without calling.
2. Owner should understand property status without calling.
3. Technician should not close a job without proof.
4. Admin should not unlock an owner dashboard without trusted payment, contract, property, and identity proof.
5. Broker attribution should exist before contract activation.
6. Arabic/RTL must be complete across portals and PDFs.
7. Public launch claims must match live tested proof.
8. Simple Mode should be default for tenants and owners.

## Tenant portal upgrades

Build:

- One-tap AC, plumbing, electrical, leak, cleaning, elevator, pest, and other issue buttons.
- Voice-to-ticket in Arabic/English.
- Exact service location requirement.
- Photo/video evidence before dispatch.
- Technician ETA and delay reason.
- Completion approve/dispute button.
- Move-in/move-out evidence report.
- WhatsApp/SMS fallback after opt-in.

Tenant Simple Mode should show only: Report Issue, Track Request, Emergency, Payments & Documents, Move In/Out.

## Owner portal upgrades

Build:

- “What needs my approval today?” command strip.
- Property Health Score explanation.
- High-cost approval threshold.
- Monthly owner report.
- Maintenance cost forecast.
- Repeat issue detection.
- Warranty, insurance, and certificate tracker.
- Tenant satisfaction summary.
- Property passport per property/unit.
- Direct owner bank/payout clarity.

Owner Simple Mode should show only: Property Health, Pending Approvals, Maintenance Cost, Tenant Issues, Documents, Monthly Report.

## Technician portal upgrades

Build:

- GPS arrival proof.
- Before photos.
- After photos.
- Parts used and receipt photo.
- Tenant signature or refusal note.
- Offline completion queue.
- Rework penalty and performance score.
- Certification/training expiry.
- Emergency availability toggle.
- Route optimization.

## Broker portal upgrades

Build:

- Broker referral link.
- QR lead capture.
- Owner lead status timeline.
- Contract attribution proof.
- Commission status timeline.
- RERA/KYC validation.
- Commission dispute workflow.
- Broker leaderboard.
- Broker payout statement.

## Admin portal upgrades

Build:

- SLA Command Board.
- Payment Verification Board.
- Owner Activation Board.
- Technician Capacity Board.
- Dispute Resolution Board.
- Cost Leakage Radar.
- Repeat Issue Radar.
- Vendor Quote Comparison.
- Public Launch Proof Board.
- Data Governance Board.

## Canonical SLA policy

Use one SLA source everywhere. The config file `src/config/uaeDominationBlueprint.ts` now defines `CANONICAL_SLA_POLICY` and `slaMinutesForPriority()`.

| Priority | Time | Use case |
|---|---:|---|
| Emergency | 30 minutes | Safety, active leak, electrical hazard, severe AC failure, lockout. |
| High | 2 hours | Urgent comfort, access, habitability, or asset-protection issue. |
| Medium | 4 hours | Normal issue needing same-day response. |
| Standard | 8 hours | Routine service window. |
| Low | 24 hours | Non-urgent, cosmetic, inquiry, or planned follow-up. |

## Required cleanup before major public launch

1. Align SLA policy across tenant request, admin dashboard, Functions, notifications, and reports.
2. Align permission vocabulary, especially `canManageProperties`.
3. Consolidate `tickets` and `maintenanceTickets`.
4. Consolidate payment collection names.
5. Consolidate audit collection names.
6. Remove duplicate Firestore rule blocks.
7. Make App Check status consistent across frontend, Firestore, Storage, and Functions.
8. Separate production, staging, and local Firebase write targets.
9. Replace broad temporary KYC upload path with user-scoped paths.
10. Move heavy admin dashboard metrics into precomputed summary documents for 500-building scale.

## 90-day pilot metrics

- 60% fewer maintenance follow-up calls.
- 80% of tenant tickets created in under 90 seconds.
- 95% of completed jobs have full evidence pack.
- Owner approval response time under 12 hours.
- Tenant satisfaction at 4.5/5 or better.
- Repeat issues reduced by 20%.
- 100% broker-sourced deals traced before activation.
- Zero SLA disputes caused by inconsistent priority policy.
- 70%+ pilot owners agree to continue or expand.

## Build principle

Build fewer screens that create more trust. Every role should immediately know: what happened, who is responsible, what proof exists, what action is needed, and what happens if nobody acts.
