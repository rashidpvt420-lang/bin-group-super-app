# BIN GROUP Premium Trust Upgrade

This document locks the next product phase: make the app premium, simple, and trustworthy before adding unrelated modules.

## Priority order

1. Finish public launch blockers: Stripe live keys, Firebase App Check production site key, admin password rotation, branded email sender, and full 5-profile live smoke.
2. Run full 5-profile live smoke for Owner, Tenant, Technician, Admin, and Broker.
3. Polish Tenant home into a daily-use `My Home Status` experience.
4. Polish Owner onboarding and payment trust.
5. Polish Admin command center.
6. Add BIN AI Concierge.
7. Add QR visitor/access passes.
8. Add Property Passport 2.0.

## Feature scope

### BIN AI Concierge
A chat-style no-call assistant that helps residents describe an issue, classifies category and priority, prepares evidence requirements, and routes to the maintenance ticket workflow.

### Smart Resident Home Screen
The home screen should show one clear daily status panel:

- active maintenance issue
- upcoming amenity booking
- parcel waiting
- visitor parking pass
- latest building notice
- emergency action

### QR Building Access / Visitor Pass
Visitor parking and access passes should include visitor name, plate number, unit, valid-from, valid-to, security scan payload, and auto-expiry display.

### Property Passport 2.0
The owner-facing passport must highlight building health score, asset registry, AC/lift/pump history, compliance certificates, warranty documents, maintenance forecast, and owner value protection score.

### Technician Live Command Map
Tenant and admin views should display ticket status as accepted, on the way, on-site, before/after proof, completion, tenant approval, or dispute.

### Owner Money & Risk Dashboard
Owner dashboard must answer: monthly maintenance cost, cost per unit, SLA breaches, tenant complaints, upcoming renewals, asset risk, net property health, and what should be fixed before it becomes expensive.

### Preventive Maintenance Calendar
Auto-suggest AC service, water tank cleaning, fire safety inspection, pest control, lift inspection, pump room check, and roof/drainage inspection before seasonal rain.

### BIN-Approved Vendor Marketplace
Marketplace must stay controlled: approved vendors only, BIN verified badge, insurance/license records, rating score, SLA score, and commission engine.

### Move-In / Move-Out Digital Inspection
Checklist must support room-by-room condition, photo evidence, meter readings, key handover, deposit deduction evidence, and owner/tenant sign-off.

### Emergency Command Mode
Admin command view must prioritize severe building events, broadcast tenant updates, and push priority dispatch workflows.

## Current implementation commits in this phase

- Added `TenantSmartHomeStatus` component for a premium resident daily-control panel.
- Added `TenantAIConciergePage` as the first BIN AI Concierge shell.
- This document is the non-random scope gate for the remaining implementation.

## Launch discipline

No feature is considered public-launch ready until the relevant CI, Firebase rules test, build, and role smoke test passes. Features may be present in UI as pilot/controlled capability before they are public-commercial launch blockers.
