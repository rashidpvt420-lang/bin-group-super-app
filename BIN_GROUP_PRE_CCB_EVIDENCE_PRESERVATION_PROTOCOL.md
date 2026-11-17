# BIN GROUP — CONTROLLED PRE-CCB EVIDENCE-PRESERVATION PROTOCOL
**Authoritative Operational Governance & Freeze Directives (November 17 – November 30, 2026)**

- **Target Repository:** `rashidpvt420-lang/bin-group-super-app`
- **Target Pull Request:** PR #2014 (`fix/financial-approval-ceo-superadmin-segregation`)
- **Frozen Remediation Branch:** `fix/financial-approval-ceo-superadmin-segregation`
- **Authoritative Freeze HEAD SHA:** `bbcad92743fc3c1884ee80d272ab3a7f00bb2210`
- **Baseline Commit:** `982e2679eb803820e0825cb5a69865a9584a2b7a` (`origin/main`)
- **Published Android Package:** `ae.bingroups.superapp`
- **Target Mobile Build:** Version 1.0.1 — Version Code 17
- **Google Play Closed-Testing Track:** `closed-testing-alpha`
- **Evaluation Point:** November 30, 2026 (Earliest Calculated Eligibility Point)
- **Current Operational Status:** **PRE-CCB EVIDENCE PRESERVATION & MONITORED HOLD**

---

## 1. PURPOSE & EXECUTIVE DIRECTIVE

Following the independent technical verification of PR #2014 and the resolution of the four architectural pre-approval matters (24-hour TTL expiry, full route coverage, external Auth failure recovery, and audit immutability), BIN GROUP is formally transitioned into a **Controlled Pre-CCB Evidence-Preservation Phase**.

This protocol defines the binding operational constraints, evidence collection standards, daily monitoring cadences, and change-control firewalls required prior to the formal convening of the Change Control Board (CCB) on or after November 30, 2026.

---

## 2. SEVEN BINDING EVIDENCE-PRESERVATION PILLARS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 SEVEN PRE-CCB EVIDENCE-PRESERVATION PILLARS                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. CODE FREEZE        │ Branch fix/financial-approval-ceo-superadmin-       │
│                       │ segregation is frozen at SHA bbcad92743fc3c1884ee80 │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 2. EVIDENCE ARCHIVE   │ Test suites, logs, patches, and audit dossiers are  │
│                       │ sealed and preserved in version control.            │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 3. PLAY MONITORING    │ 12 confirmed Google Play opt-ins are monitored      │
│                       │ daily via the standard status template.             │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 4. STAGING ONBOARDING │ 7 pending test identities are provisioned strictly  │
│                       │ in staging Firebase Auth, never in production.      │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 5. BUILD STABILITY    │ Android build Version 1.0.1 (17) is kept stable;   │
│                       │ zero uploads to Play Console without CCB approval.  │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 6. RE-ASSESSMENT GATE │ On November 30, 2026 or later, continuous testing   │
│                       │ telemetry is verified prior to convening CCB.       │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 7. RELEASE SEPARATION │ Merging and deploying require an explicit, separate │
│                       │ written CCB authorization. Successful CI != deploy. │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. DETAILED PROTOCOL IMPLEMENTATION

### 3.1 Pillar 1: PR #2014 Code Freeze
- **Branch:** `fix/financial-approval-ceo-superadmin-segregation`
- **Authoritative SHA:** `bbcad92743fc3c1884ee80d272ab3a7f00bb2210`
- **Constraint:** No new commits, rebases, or force pushes are permitted on the remediation branch without prior formal security review and written approval.
- **Merge Status:** PR #2014 remains **STRICTLY UNMERGED**.

### 3.2 Pillar 2: Evidence & Artifact Catalog
All quality gate logs, test execution transcripts, and compliance reports are preserved in the repository root:
1. [`BIN_GROUP_PR_2014_FINANCE_AUTHORIZATION_TTL_AUDIT.md`](file:///c:/Users/My-PC/Desktop/bin%20app/BIN_GROUP_PR_2014_FINANCE_AUTHORIZATION_TTL_AUDIT.md) — Exact 24-hour TTL boundary verification.
2. [`BIN_GROUP_PR_2014_FINANCE_DEMOTION_GOVERNANCE_AUDIT.md`](file:///c:/Users/My-PC/Desktop/bin%20app/BIN_GROUP_PR_2014_FINANCE_DEMOTION_GOVERNANCE_AUDIT.md) — Two-person demotion and external Auth failure-recovery audit.
3. [`BIN_GROUP_PR_2014_UPDATED_SECURITY_TEST_EVIDENCE.md`](file:///c:/Users/My-PC/Desktop/bin%20app/BIN_GROUP_PR_2014_UPDATED_SECURITY_TEST_EVIDENCE.md) — 76 passing test cases (54 emulator + 22 unit).
4. [`BIN_GROUP_CLOSED_TESTING_DAILY_ENGAGEMENT_REGISTER.md`](file:///c:/Users/My-PC/Desktop/bin%20app/BIN_GROUP_CLOSED_TESTING_DAILY_ENGAGEMENT_REGISTER.md) — Individual 14-tester evidence register.
5. [`BIN_GROUP_CLOSED_TESTING_DAILY_STATUS_TEMPLATE.md`](file:///c:/Users/My-PC/Desktop/bin%20app/BIN_GROUP_CLOSED_TESTING_DAILY_STATUS_TEMPLATE.md) — Standardized daily reporting instrument.
6. [`BIN_GROUP_UPDATED_CCB_REVIEW_PACKAGE.md`](file:///c:/Users/My-PC/Desktop/bin%20app/BIN_GROUP_UPDATED_CCB_REVIEW_PACKAGE.md) — Authoritative CCB review dossier with Section 7.5 pre-approval evidence.

### 3.3 Pillar 3: Daily Closed-Testing Monitoring Cadence
- **Cadence:** Daily at 12:00 UTC through November 30, 2026.
- **Reporting Instrument:** [`BIN_GROUP_CLOSED_TESTING_DAILY_STATUS_TEMPLATE.md`](file:///c:/Users/My-PC/Desktop/bin%20app/BIN_GROUP_CLOSED_TESTING_DAILY_STATUS_TEMPLATE.md).
- **Core Metrics:**
  - Active Play Console opt-ins (must maintain >= 12 continuously).
  - Android Vitals crash rate (< 0.05%) and ANR rate (< 0.02%).
  - Voluntary tester feedback and defect submissions.
- **Anti-Fabrication Rule:** No engagement, session, or timestamp is invented. Unavailable data is recorded as `NOT VERIFIED`.

### 3.4 Pillar 4: Staging QA Account Onboarding (7 Pending Personas)
To unblock functional mobile UAT without violating production isolation:
- **Scope:** 7 pending test identities (4 Technicians, 2 Tenants, 1 Finance Admin).
- **Environment:** Provisioned strictly in the **staging Firebase project** (`demo-bin-callables` or staging environment).
- **Boundary:** **NEVER create or modify users in production Firebase Auth**.
- **Separation of Concerns:** Unprovisioned staging accounts affect functional mobile UAT only; they do **NOT** invalidate Google Play's automated opt-in count.

### 3.5 Pillar 5: Android Build Stability
- **Current Published Build:** Package `ae.bingroups.superapp`, Version 1.0.1, Version Code 17.
- **Freeze Rule:** Version Code 17 is kept completely stable on the `closed-testing-alpha` track.
- **Prohibition:** Zero new AAB uploads or track promotions without prior formal CCB authorization.

### 3.6 Pillar 6: November 30 Evaluation Point Re-Assessment Gate
- **Nature of Milestone:** November 30, 2026 is an **earliest calculated eligibility point**, NOT an automated release date.
- **Exit Criteria for Observation:**
  1. Authoritative Play Console confirmation of at least 12 testers continuously opted in for >= 14 full days.
  2. Android Vitals confirm 0 critical launch-blocking crashes or ANRs.
  3. All 5 user personas (Owner, Tenant, Technician, Broker, Admin/Finance) complete functional UAT scenarios in staging.
  4. Zero unresolved high-severity security or operational defects.

### 3.7 Pillar 7: Formal Release Separation & Written CCB Approval
- **Release Separation:** A clean CI run or passing test suite demonstrates technical correctness within test bounds; it does **NOT** constitute authority to merge, release, or deploy.
- **Mandatory Gate:** Merging PR #2014 and deploying to production require an explicit, recorded, written decision from the Change Control Board.

---

## 4. FORMAL GATE STATUS SUMMARY

```
================================================================================
           CONTROLLED PRE-CCB PHASE: OFFICIAL PROGRAM DETERMINATIONS
================================================================================

1. PR #2014 Security Remediation Status:         PASS (Reported & Verified)
2. Closed-Testing Engagement Status:             BLOCKED (Time-gated to Nov 30)
3. Google Play Production Eligibility Status:    BLOCKED (14-day rule in progress)
4. CCB Readiness Status:                         BLOCKED (Pre-CCB freeze active)
5. Public Launch Status:                         HOLD (Strictly Enforced)

================================================================================
```

*Approved for Operational Execution:*  
Security Governance & Release Management Committee  
BIN GROUP Super App Program  
November 17, 2026  
