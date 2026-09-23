# BIN GROUP Super App — Current Evidence-Based Audit Report

> Status date: 23 September 2026
>
> This document records product and launch-readiness facts supported by the current repository and protected production evidence. It intentionally avoids self-certifying legal compliance or hard-public-launch readiness.

---

## 1. Current Release Position

The BIN GROUP Super App is a multi-role property-operations platform serving five primary profiles:

1. **Owner / Investor** — onboarding, property operations, contract/payment readiness, asset and financial views.
2. **Tenant / Resident** — residence readiness, service requests, documents, inspections and notifications.
3. **Technician / Staff** — assigned missions, GPS arrival, work evidence, HR/request surfaces and offline recovery.
4. **Broker / Agent** — referrals, KYC/compliance readiness, commission and payout workflows.
5. **Admin / Operations** — operational oversight, dispatch, payments, staff lifecycle, audit and launch evidence.

### Current protected release bindings

- **Frozen production release SHA:** `7667ff54f9c43e07f78b3710578cd132b1bc7963`
- **Current clearance control-plane SHA:** `045338098eb637b298cbdf28ace68a233c68be1b`
- **Completed controlled pilot:** greater than 24 hours; do not restart it for post-pilot control-plane/evidence repairs unless a genuine production application/runtime change invalidates the frozen release.
- **Operational Application Evidence:** current protected run is green, including Founder TOTP verification/synchronization and final evidence publication.
- **Hard-public-launch authorization:** not yet final. The remaining current protected blocker is genuine Technician physical-device/GPS mission evidence.

A green source audit or successful build is not equivalent to hard-public-launch authorization. Only the protected hard-clearance chain may issue the final launch decision.

---

## 2. Technical Architecture

- **Frontend:** React/Vite role applications plus the dedicated Admin application.
- **Backend:** Firebase Authentication, Cloud Firestore, Cloud Storage and 2nd-generation Cloud Functions.
- **Realtime:** Firestore listeners are used on operational surfaces; realtime health should be measured with explicit freshness/error telemetry rather than inferred from listener presence alone.
- **Mobile:** Capacitor Android integration includes a native Firebase App Check / Play Integrity bridge in the frozen release.
- **Localization:** English and Arabic/RTL are implemented across core launch surfaces and covered by repository audits, but physical-device UI validation remains part of final device evidence.

---

## 3. UAE Compliance and Regulatory Position

The application contains UAE-specific workflows and compliance-oriented controls. The software must not represent itself as a regulator, legal adviser, government registry, WPS agent or substitute for official UAE systems.

### A. Wage Protection System (WPS) / MOHRE payroll

**Current implementation status: SCOPED, NOT A LIVE WPS INTEGRATION.**

The application contains HR/payroll data structures and payroll-related calculations, but it does **not** currently generate production Salary Information Files (SIF), submit WPS files to a bank/exchange agent, or reconcile MOHRE/WPS settlement results. Payroll output is currently limited to internal payroll/payslip functionality.

Before the app can truthfully claim that it "runs UAE WPS payroll," it requires at minimum:

- confirmed employer MOHRE/MOL establishment ID;
- the selected WPS agent/bank's current SIF specification and routing identifier;
- per-employee MOL Personal ID and validated payroll IBAN/agent routing;
- immutable payroll-run records and fils-accurate reconciliation;
- server-side SIF generation against the selected agent's current format;
- submission/acceptance/rejection reconciliation and audit evidence.

**Launch position:** WPS is not a hard-launch dependency if payroll settlement remains outside the app. Any product or investor claim that BIN GROUP directly executes compliant WPS payroll must remain disabled until the integration is genuinely implemented and legally/operationally verified.

### B. UAE workforce / heat-stress controls

The codebase contains UAE workforce-compliance rules and heat-stress/midday-work protections. These are operational software controls, not a legal-compliance certification. Current MOHRE requirements and company policy must remain the external authority.

### C. Data protection / hosting

The application contains privacy, access-control, retention and regional-hosting design considerations. Do not claim blanket UAE, ADGM or DIFC legal compliance solely from source configuration. Production data flows, subprocessors, retention, cross-border transfers and applicable controller/processor obligations require current legal and operational review.

### D. Broker / RERA verification

Broker identity and RERA-related verification states are admin/server-authoritative rather than client self-certified. This is an application control; it does not replace verification against the relevant regulator/official records.

### E. End-of-service and employment calculations

The application contains UAE-oriented workforce and end-of-service calculations. These calculations should be treated as operational assistance and must be checked against the employee's actual legal/contractual facts and current UAE law before final settlement.

---

## 4. Current Product Evidence

### Five-profile / onboarding source audit

The current exact-SHA five-profile/onboarding audit is green. It covers core role routing, onboarding state machines, server-authoritative lifecycle controls, Phase-1 Cash/Cheque payment policy, protected profile surfaces, bilingual/RTL contracts, technician/staff lifecycle controls, tenant readiness, broker KYC/payout readiness and Admin authority paths.

This proves substantial source/contract coverage. It does **not** prove that every interactive control on every deployed screen has been physically clicked in a current authenticated production session.

### Phase-1 payments

Canonical launch policy:

- **Cash:** enabled
- **Cheque:** enabled
- **Bank Transfer:** disabled
- **Stripe/Card:** disabled

No UI, documentation or launch evidence may describe Bank Transfer or Stripe/Card as a live Phase-1 payment method.

### Technician physical-device evidence

The frozen Android release contains strict native installation binding using Google Play installation checks, the Play delivery signer, Firebase Installation identity hashing and Play Integrity App Check. The production verifier requires a real Play-installed Technician mission with device binding, GPS arrival, ordered lifecycle timestamps and real Storage-backed before/after evidence.

A signed Android AAB exists for the frozen release, but hard clearance remains blocked until the required real physical Technician mission is completed and its protected evidence is published.

---

## 5. Known Incomplete / Deferred Modules

The following Staff OS modules are deliberately feature-flagged OFF and must remain hidden/disabled until completed and tested:

- Organization Chart
- Probation
- Promotions / Transfers
- Shift Swaps
- Acting Manager / Delegation
- Suppliers Portal
- Recruitment Pipeline
- Candidate Messaging

These are product backlog items, not evidence that the currently enabled launch surface is failing.

WPS/MOHRE SIF generation and bank/agent submission are also deferred as described above.

---

## 6. Quality and Security Position

- Main application build: expected to remain a required CI gate.
- Admin application build: expected to remain a required CI gate; build warnings must be resolved rather than treated as launch PASS evidence.
- Cloud Functions build/type checks: required.
- Security rules and protected production evidence: required.
- Dependency audit findings: require reachability/production-impact triage; vulnerability counts alone are not proof of exploitability.
- Manual launch-evidence records: useful for history/review only; they cannot self-authorize hard public launch.

No document in this repository should claim "all gates passed," "fully compliant," or "public launch clearance: GO" unless the current protected evidence chain supports that statement at the exact release/control-plane bindings.

---

## 7. Current Readiness Verdict

**Application maturity:** strong, with broad five-role and operational coverage.

**Controlled pilot:** completed; preserve it.

**Hard-public-launch status:** **NO-GO until the remaining protected Technician physical-device/GPS evidence gate passes and the final hard-clearance workflow completes successfully.**

After hard clearance, post-clearance UI/readiness cleanup may be merged through normal protected review without retroactively rewriting pilot evidence.