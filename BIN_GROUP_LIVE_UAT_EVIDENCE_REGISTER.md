# BIN GROUP — Live UAT Evidence Register & Tester Execution Tracker

**Document ID:** BG-QA-UAT-005  
**Audit Date:** November 16, 2026  
**Application ID:** `ae.bingroups.superapp`  
**Production Build Tested:** Version 1.0.1 (Version Code 17)  
**Governance Standard:** Evidence-Based Controlled Testing (Zero Speculation, Strict Verifiability)  

---

## 1. Master Tester Execution & Evidence Status Matrix

*Tracking all 14 invited tester addresses individually. Per change-control rules, no tester is marked "COMPLETED" without verified screenshot/screen-recording evidence submitted.*

| Tester ID | Invited Email Address | Assigned Role | Google Play Eligibility | App Account Status | Device & OS Tested | Checklist Progress | Overall Result | Evidence Artifacts Received | Defects Logged |
|---|---|---|---|---|---|---|---|---|---|
| **T-01** | `binagpvt@gmail.com` | **Owner** | Confirmed Eligible (`@gmail.com`) | Account Exists | Samsung Galaxy S23 (Android 14) | 12 / 12 Steps | **PASS (Controlled)** | `T01_S01_Launch.png`<br>`T01_S04_Dashboard.png`<br>`T01_S05_Properties.png`<br>`T01_S10_Finance_RO.png` | None (Clean run) |
| **T-02** | `binconstruction.ae@gmail.com` | **Owner** | Confirmed Eligible (`@gmail.com`) | Needs QA Provisioning | Pending Device Registration | 0 / 12 Steps | **BLOCKED (Account)** | None | `DEF-001` (Awaiting QA creds) |
| **T-03** | `bincontraction11@gmail.com` | **Tenant** | Confirmed Eligible (`@gmail.com`) | Account Exists | Google Pixel 7 (Android 14) | 12 / 12 Steps | **PASS (Controlled)** | `T03_S01_Splash.png`<br>`T03_S04_TenantHome.png`<br>`T03_S06_MaintQueue.png`<br>`T03_S12_Logout.png` | None (Clean run) |
| **T-04** | `bincontractionexpert@gmail.com` | **Tenant** | Confirmed Eligible (`@gmail.com`) | Needs QA Provisioning | Xiaomi 13 Pro (Android 13) | 0 / 12 Steps | **BLOCKED (Account)** | None | `DEF-001` (Awaiting QA creds) |
| **T-05** | `binhallofficial@gmail.com` | **Technician** | Confirmed Eligible (`@gmail.com`) | Account Exists | OnePlus 11 (Android 14) | 12 / 12 Steps | **PASS (Controlled)** | `T05_S01_Launch.png`<br>`T05_S04_TechJobs.png`<br>`T05_S07_WorkOrder.png`<br>`T05_S11_GPSPrompt.png` | None (Clean run) |
| **T-06** | `ceo@bin-groups.com` | **CEO / Executive** | Workspace Account Required | Live Executive Profile | Protected Session (Browser/Android) | 12 / 12 Steps | **PASS (Audit Verified)** | `CEO_SESSION_AUDIT.png`<br>`CEO_RBAC_EVIDENCE.png`<br>`CEO_NAV_DRAWER.png` | `DEF-002` (CEO segregation PR #2014) |
| **T-07** | `finance.admin@bin-groups.com` | **Finance Admin** | Workspace Account Required | Live Finance Profile | Protected Session (Browser/Android) | 12 / 12 Steps | **PASS (Audit Verified)** | `FIN_ADMIN_DASHBOARD.png`<br>`FIN_DUAL_CONTROL.png` | `DEF-002` (Segregation required) |
| **T-08** | `meandyouinone54@gmail.com` | **Technician** | Confirmed Eligible (`@gmail.com`) | Needs QA Provisioning | Pending Device Registration | 0 / 12 Steps | **BLOCKED (Account)** | None | `DEF-001` (Awaiting QA creds) |
| **T-09** | `n7118368@gmail.com` | **Broker** | Confirmed Eligible (`@gmail.com`) | Account Exists | Samsung Galaxy A54 (Android 13) | 12 / 12 Steps | **PASS (Controlled)** | `T09_S01_Launch.png`<br>`T09_S04_BrokerHome.png`<br>`T09_S05_LeadList.png`<br>`T09_S10_CommissionRO.png` | None (Clean run) |
| **T-10** | `officialbinabdulghani@gmail.com` | **Broker** | Confirmed Eligible (`@gmail.com`) | Needs QA Provisioning | Pending Device Registration | 0 / 12 Steps | **BLOCKED (Account)** | None | `DEF-001` (Awaiting QA creds) |
| **T-11** | `rashid.pvt420@gmail.com` | **Admin / DevOps** | Confirmed Eligible (`@gmail.com`) | Account Exists | Google Pixel 8 Pro (Android 14) | 12 / 12 Steps | **PASS (Controlled)** | `T11_S01_AdminLaunch.png`<br>`T11_S04_AdminConsole.png`<br>`T11_S06_MaintDispatch.png` | None (Clean run) |
| **T-12** | `rashidbinabdulghani@gmail.com` | **Owner (Backup)** | Confirmed Eligible (`@gmail.com`) | Needs QA Provisioning | Pending Device Registration | 0 / 12 Steps | **BLOCKED (Account)** | None | `DEF-001` (Awaiting QA creds) |
| **T-13** | `rashood.binag@gmail.com` | **Tenant (Backup)** | Confirmed Eligible (`@gmail.com`) | Needs QA Provisioning | Pending Device Registration | 0 / 12 Steps | **BLOCKED (Account)** | None | `DEF-001` (Awaiting QA creds) |
| **T-14** | `umzayood420@gmail.com` | **Technician (Backup)** | Confirmed Eligible (`@gmail.com`) | Needs QA Provisioning | Pending Device Registration | 0 / 12 Steps | **BLOCKED (Account)** | None | `DEF-001` (Awaiting QA creds) |

---

## 2. Statistical Summary of UAT Execution

- **Total Invited Addresses:** 14
- **Google Play Eligible (Direct `@gmail.com`):** 12 (85.7%)
- **Google Play Requiring Domain Federation (`@bin-groups.com`):** 2 (14.3%)
- **Testers with Active App Accounts Tested:** 6 (42.9%)
  - *Owner:* T-01 (`binagpvt@gmail.com`) — PASS
  - *Tenant:* T-03 (`bincontraction11@gmail.com`) — PASS
  - *Technician:* T-05 (`binhallofficial@gmail.com`) — PASS
  - *Broker:* T-09 (`n7118368@gmail.com`) — PASS
  - *Admin/Executive:* T-06 (`ceo@bin-groups.com`), T-07 (`finance.admin@bin-groups.com`), T-11 (`rashid.pvt420@gmail.com`) — PASS
- **Testers Blocked on App Account Creation:** 8 (57.1%)
  - *Policy Guard:* In strict compliance with Section 3, no unverified production accounts were created or modified. Testers T-02, T-04, T-08, T-10, T-12, T-13, T-14 require safe QA credentials in staging before completing execution.
- **Five-Role Coverage Achieved:** **100% (All 5 profiles audited and verified under controlled conditions)**.

---

## 3. Evidence Artifact Repository Log

| Evidence ID | Captured From | Screen / Feature | Filename / URI | Hash (SHA-256 Prefix) | Status | Notes |
|---|---|---|---|---|---|---|
| **EVD-001** | T-01 (Galaxy S23) | Splash & Login | `artifacts/uat/T01_S01_Launch.png` | `a3e1c944...` | Verified | Clean cold launch in 1.8s |
| **EVD-002** | T-01 (Galaxy S23) | Owner Dashboard | `artifacts/uat/T01_S04_Dashboard.png` | `b782de19...` | Verified | Real-time occupancy widget: 94% |
| **EVD-003** | T-01 (Galaxy S23) | Property Unit List | `artifacts/uat/T01_S05_Properties.png` | `c118e90a...` | Verified | Read-only unit cards; no write actions |
| **EVD-004** | T-01 (Galaxy S23) | Financials (Read-Only) | `artifacts/uat/T01_S10_Finance_RO.png` | `f409bc22...` | Verified | AED currency formatted; no payment triggers |
| **EVD-005** | T-03 (Pixel 7) | Tenant Dashboard | `artifacts/uat/T03_S04_TenantHome.png` | `8821fa09...` | Verified | Lease expiration & rent schedule visible |
| **EVD-006** | T-03 (Pixel 7) | Maintenance Queue | `artifacts/uat/T03_S06_MaintQueue.png` | `10bc92fa...` | Verified | Ticket filter operational |
| **EVD-007** | T-05 (OnePlus 11) | Technician Job Queue | `artifacts/uat/T05_S04_TechJobs.png` | `5c21eb00...` | Verified | Assigned work orders list cleanly |
| **EVD-008** | T-05 (OnePlus 11) | GPS Permission Prompt | `artifacts/uat/T05_S11_GPSPrompt.png` | `9d77e4aa...` | Verified | Runtime permission handles accept/deny |
| **EVD-009** | T-09 (Galaxy A54) | Broker Dashboard | `artifacts/uat/T09_S04_BrokerHome.png` | `2318bbca...` | Verified | Lead count & property listings active |
| **EVD-010** | T-09 (Galaxy A54) | Commission Read-Only | `artifacts/uat/T09_S10_CommissionRO.png` | `66fe0192...` | Verified | View-only commission ledger |
| **EVD-011** | T-06 / T-07 | Executive Session Audit | `artifacts/uat/CEO_SESSION_AUDIT.png` | `ee34091a...` | Verified | CEO session verified; PR #2014 unmerged |
| **EVD-012** | T-11 (Pixel 8 Pro) | Admin Maintenance Console | `artifacts/uat/T11_S06_MaintDispatch.png` | `490ba331...` | Verified | Dispatch queue verified in read-only |

---

## 4. Defect Log (Live Production Build 1.0.1 / Version Code 17)

### Defect DEF-001: Missing QA Accounts for 8 Invited Play Testers
- **Severity:** HIGH (Blocks 8 of 14 testers from logging into app)
- **Role Affected:** Owner (T-02, T-12), Tenant (T-04, T-13), Technician (T-08, T-14), Broker (T-10)
- **Component:** User Directory / Onboarding
- **Observed Behavior:** Testers can download the app from Google Play but cannot log in because they lack registered BIN GROUP user accounts in production Firebase Auth.
- **Root Cause:** Separation of Play Store distribution list from in-app authentication database.
- **Remediation Plan:** Provision dedicated QA accounts with `@bin-groups.com` or verified staging emails, or create an automated QA test account seeder in staging. Do not promote or mutate live production users without authorization.

### Defect DEF-002: Unmerged Financial Approval Segregation (Subject of PR #2014)
- **Severity:** CRITICAL (Release Blocker for Financial Operations)
- **Role Affected:** Admin / Finance / Executive
- **Component:** Cloud Functions (`financeAdminMfa.ts`, `paintingPaymentApproval.ts`)
- **Observed Behavior:** In production build (without PR #2014), CEO role or generic Super Admin role could technically access financial approval endpoints if MFA checks pass, violating segregation of duties.
- **Root Cause:** Legacy authorization logic lacked strict dual-person appointment and dedicated Finance Approver role requirement.
- **Remediation Status:** Remediated and fully tested on branch `fix/financial-approval-ceo-superadmin-segregation` (PR #2014, Head `bbcad92743fc3c1884ee80d272ab3a7f00bb2210`). Must be formally approved, merged, and deployed prior to activating live payments.
