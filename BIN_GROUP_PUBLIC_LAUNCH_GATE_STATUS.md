# BIN GROUP — Public Launch Gate Status & Production Release Determination

**Document ID:** BG-QA-UAT-REC-006 (Revised)  
**Determination Date:** November 16, 2026  
**Repository:** `rashidpvt420-lang/bin-group-super-app`  
**PR Branch:** `fix/financial-approval-ceo-superadmin-segregation` ([PR #2014](https://github.com/rashidpvt420-lang/bin-group-super-app/pull/2014))  
**Verified Commit SHA:** `bbcad92743fc3c1884ee80d272ab3a7f00bb2210`  
**Base Commit SHA:** `982e2679eb803820e0825cb5a69865a9584a2b7a` (`origin/main`)  
**Production Package:** `ae.bingroups.superapp`  
**Published Build Tested:** Version `1.0.1` (Version Code `17`)  
**Play Console Developer ID:** `5799216464320445251`  
**Play Console App ID:** `4974609289790604989`  

---

## 1. Revised Master Release Gate Table

*Evaluation strictly restricted to defined vocabulary: `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`, `NOT DEPLOYED`.*

| Evaluation Gate | Release Determination | Evidentiary Basis & Current Operational Finding |
|---|---|---|
| **Android Stability** | **PASS — reported** | Cold launch in 1.8s; zero ANR/crashes across verified journeys (`T01_S01_Launch.png`). |
| **Five-Role Read-Only UAT** | **PASS — reported** | 35 / 35 read-only workflows verified across Owner, Tenant, Technician, Broker, and Admin (`BIN_GROUP_FIVE_ROLE_UAT_EVIDENCE.md`). |
| **12 Opted-in Testers** | **PASS — console evidence supplied** | Criterion 2 is checked green (✓) in Google Play Console (`media_1794827104273.png`). |
| **14-Day Continuous Period** | **BLOCKED** | In progress (Day 1 of 14). Review reset today at 00:02 GST; earliest calculated eligibility is Nov 30, 2026. Button is disabled. |
| **Seven Missing App Accounts** | **BLOCKED for full UAT** | UAT blocker for complete 14-tester engagement. Does not invalidate Play Console opt-in count, but blocks authentic end-to-end user journeys. |
| **PR #2014 Automated Tests** | **PASS — reported** | 22 unit tests passed (898ms); 34 emulator acceptance tests passed in CI PR Validation (Run ID: `43934417444`). |
| **PR #2014 Security Hardening** | **BLOCKED pending gaps** | Two identified hardening gaps: (1) 24-hour expiry check on pending authorizations; (2) automated test for Finance Approver demotion governance. |
| **Financial Controls in Production** | **NOT DEPLOYED** | PR #2014 is strictly unmerged on branch `fix/financial-approval-ceo-superadmin-segregation`. Production runs legacy codebase. |
| **CCB Authorization** | **BLOCKED** | Mandatory change-control hold in effect; zero production merges, mutations, or deployments permitted. |

```
================================================================================
                               FINAL DETERMINATION:
                               PUBLIC LAUNCH: HOLD
================================================================================
```

---

## 2. Essential Evidentiary Distinctions

### 2.1 Google Play Opt-in Enrollment vs Firebase Authentication Accounts
Google's published requirements distinguish between three separate compliance dimensions:
1. **Opted-In Tester Count (Console Criterion 2):** Having at least 12 testers continuously opted into the closed test for 14 days. **Status: Complete / PASS** (Verified ticked green in Play Console).
2. **Tester Engagement:** Demonstrating sufficient tester engagement during that 14-day window. **Status: Not independently established**. (Google warns that low engagement can lead to requests for additional testing).
3. **In-App Account Availability:** Providing valid test credentials if the app requires authentication. **Status: BLOCKED for 7 testers**. The 7 missing Firebase accounts are an internal UAT blocker for comprehensive role testing and user engagement; they do **not** imply that Google Play's 12-tester opt-in criterion has failed.

### 2.2 The 14-Day Continuous Testing Clock
- **Reported Testing-Period Start / Console Review Time:** November 16, 2026 at 00:02 GST (*"Reviewed today, 12:02 AM"*).
- **Current Elapsed Time:** Day 1 — in progress.
- **Earliest Calculated 14-Day Point:** **November 30, 2026 at 00:02 GST**.
- **Play Console Production Application Button:** **DISABLED / GREYED OUT**.
- **Critical Policy Mandate:** November 30 is the *earliest calculated eligibility point*, NOT a guaranteed launch date. Testers must remain continuously opted in without drop-offs, and Google Play review must independently approve production access upon re-application.

---

## 3. Profile & Permission Clarification: Admin vs Finance

The evaluation of tester **T-11** (`rashid.pvt420@gmail.com`) was conducted under its assigned role of **Admin / DevOps**. It must not be conflated with authorized financial approval authority:

```
+-----------------------------------------------------------------------------------------+
| PERMISSION DOMAIN     | T-11 / ADMIN CAPABILITY        | FINANCE APPROVAL GOVERNANCE    |
+-----------------------+--------------------------------+--------------------------------+
| General Admin         | YES: System health, properties | N/A                            |
| HR Lifecycle          | YES: Non-sensitive management  | N/A                            |
| Finance Visibility    | YES: Read-only dashboards      | YES: Read-only ledgers         |
| Financial Approval    | STRICTLY DENIED: Cannot approve| EXCLUSIVE: Finance Admin with  |
|                       | or reject payments or payroll  | live claims & verified MFA     |
+-----------------------------------------------------------------------------------------+
```

> **GOVERNANCE RULE:** The live production audit verified that general Admin screens and read-only financial dashboards load cleanly. It does **NOT** claim that PR #2014's financial approval controls are active in production. Those controls reside strictly on unmerged branch `fix/financial-approval-ceo-superadmin-segregation`.

---

## 4. Phase 1 Payment Policy: Cash and Cheque Only

The application's Phase 1 payment policy enforces **CASH and CHEQUE ONLY**. Bank transfers, Stripe, and credit card processing are strictly disabled at the architectural policy level:

- **Source Code Verification ([`functions/paymentConfiguration.ts`](file:///c:/Users/My-PC/Desktop/bin%20app/functions/paymentConfiguration.ts#L105-L137)):**
  ```typescript
  if (value.bankTransferEnabled === true || value.stripeEnabled === true) {
    throw new HttpsError(
      "failed-precondition",
      "Phase 1 requires Bank Transfer and Card/Stripe to remain disabled.",
    );
  }
  if (JSON.stringify(approvedMethods) !== JSON.stringify([...PHASE1_METHODS].sort())) {
    throw new HttpsError(
      "failed-precondition",
      "Phase 1 owner onboarding must enable exactly Cash and Cheque. Bank Transfer and Card payments are not available.",
    );
  }
  ```
- **Policy Invariant:** Supporting a transfer-related data structure in schema definitions for future migration is **not** the same as enabling transfers. In Phase 1, any payment configuration attempting to enable `BANK_TRANSFER` or `STRIPE` immediately throws `failed-precondition` and fails closed.

---

## 5. PR #2014 Security Hardening Gaps (Pre-CCB Requirements)

Before PR #2014 can be submitted for formal Change Control Board (CCB) approval, the following two security gaps must be remediated or formally risk-accepted:

1. **24-Hour Expiration Check on Pending Authorizations:**
   - *Current Behavior:* Proposals in `finance_role_authorizations` do not enforce an automatic TTL.
   - *Required Fix:* Add an explicit guard in `adminApproveFinanceRoleAssignment`:
     ```typescript
     const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
     if (Date.now() - authData.createdAt.toMillis() > maxAgeMs) {
       throw new HttpsError("failed-precondition", "Finance role authorization request has expired.");
     }
     ```
2. **Automated Two-Person Governance Test for Demotion:**
   - *Current Behavior:* Two-person appointment and reactivation are tested in `money-approval-acceptance.test.cjs`. Demotion of a Finance Approver (`finance_admin` -> `operations_admin`) relies on the general access path.
   - *Required Fix:* Implement an explicit automated test asserting that demoting or revoking a Finance Approver role enforces two-person governance and logs an immutable audit event.

---

## 6. Recommended Immediate Antigravity Task

In alignment with release governance:
1. **Do NOT restart the 24-hour pilot.**
2. **Do NOT mutate production Firebase data, rules, or custom claims.**
3. **Do NOT merge PR #2014 into `main` without CCB sign-off.**
4. **Scope the Next Antigravity Task Specifically to:**
   - Implementing the two PR #2014 hardening fixes (24-hour authorization TTL + demotion governance test).
   - Establishing an ongoing closed-testing telemetry and tester engagement audit log leading up to the November 30 evaluation point.
