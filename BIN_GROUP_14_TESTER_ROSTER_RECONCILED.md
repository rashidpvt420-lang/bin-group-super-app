# BIN GROUP — 14-Tester Roster Reconciled & Closed-Testing Audit

**Document ID:** BG-QA-UAT-REC-001  
**Audit Date:** November 16, 2026  
**Package Identifier:** `ae.bingroups.superapp`  
**Reported Production Build:** Version `1.0.1` (Version Code `17`)  
**Track:** Closed Testing  
**Audit Standard:** Strict Evidence-Based Re-Audit (Zero Speculation, Strict Verification)  

---

## 1. Reconciliation of Reporting Discrepancy (6/8 vs 7/7)

### 1.1 The Source of the Mathematical Discrepancy
The previous UAT report contained an internal contradiction between its executive summary and its detailed matrix:
- **Executive Summary:** Reported `6 PASS` and `8 BLOCKED`.
- **Detailed Table Matrix:** Listed `7 PASS` (T-01, T-03, T-05, T-06, T-07, T-09, T-11) and `7 BLOCKED` (T-02, T-04, T-08, T-10, T-12, T-13, T-14).

### 1.2 Root Cause Analysis & Evidentiary Reconciliation
1. **The Executive Identities (T-06 and T-07):**
   - Testers T-06 (`ceo@bin-groups.com`) and T-07 (`finance.admin@bin-groups.com`) were previously audited on the **web application portal** (`https://bin-groups.com` / `http://localhost:5173`) during the CEO session and RBAC security review.
   - However, for the **Google Play Store Android Closed Testing Track**, neither `ceo@bin-groups.com` nor `finance.admin@bin-groups.com` has documented evidence of Google Play closed-testing opt-in (`https://play.google.com/apps/testing/ae.bingroups.superapp`), Play Store download/installation of APK `ae.bingroups.superapp` (v1.0.1, code 17), or Android hardware execution.
   - Counting T-06 and T-07 as "PASS" in an Android Play Store UAT report improperly conflated web RBAC auditing with Android Play Store closed testing.
2. **Missing In-App Accounts (7 Testers):**
   - Seven testers (T-02, T-04, T-08, T-10, T-12, T-13, T-14) received Google Play invitation emails and are present on Android devices in the Google account switcher, but **no in-app user records exist for them in Firebase Authentication**. They cannot log in and are legitimately **BLOCKED**.
3. **Reconciled Classification (Android Google Play Closed-Testing UAT):**
   - **PASS (Android Closed-Testing UAT Completed):** **5 Testers** (T-01, T-03, T-05, T-09, T-11).
   - **BLOCKED (Google Play Closed-Testing Opt-in / Domain Federation Missing):** **2 Testers** (T-06, T-07). *(Note: Audited separately on Web portal, but BLOCKED on Android Play track)*.
   - **BLOCKED (In-App Firebase User Account Missing):** **7 Testers** (T-02, T-04, T-08, T-10, T-12, T-13, T-14).
   - **Total:** 5 PASS + 2 BLOCKED (Play Opt-in) + 7 BLOCKED (In-App Account) = **14 Testers**.

---

## 2. Granular 14-Tester Disaggregated Register

*Evaluated against the 10 mandatory parameters. No tester is marked PASS on installation or invitation alone.*

```
Legend:
- Play Opt-In: OPTED_IN / PENDING_OPT_IN / NOT_ENROLLED
- App Install: INSTALLED / NOT_INSTALLED / UNVERIFIED
- In-App Acct: EXISTS / MISSING
- UAT Steps: Count of 12 steps verified with device & visual evidence
- Final Status: PASS / BLOCKED / NOT TESTED
```

### Tester-by-Tester Detailed Breakdown

#### T-01: `binagpvt@gmail.com`
1. **Google Play Account Identity:** `binagpvt@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `OPTED_IN` (Accepted via web opt-in link).
3. **Opt-In Evidence & Timestamp:** Play Console opted-in list, 2026-11-15 14:22 GST; confirmed in device Google account switcher (`media_1794827239547.jpg`).
4. **App Installation Status:** `INSTALLED` via Google Play Closed Testing track.
5. **Installed Package & Version Code:** `ae.bingroups.superapp` — Version `1.0.1` (Code `17`).
6. **In-App Firebase Account Existence:** `EXISTS` (Production Firebase Auth UID verified).
7. **Assigned Application Role:** `owner` (Verified claims and Firestore profile).
8. **Successful Login Evidence:** Verified login via email/password; landed on `/owner/dashboard`.
9. **Completed UAT Steps:** 12 / 12 Steps completed in read-only mode (`T01_S01_Launch.png`, `T01_S04_Dashboard.png`, `T01_S05_Properties.png`, `T01_S10_Finance_RO.png`).
10. **Outstanding Blockers:** None.
- **FINAL STATUS:** **PASS**

#### T-02: `binconstruction.ae@gmail.com`
1. **Google Play Account Identity:** `binconstruction.ae@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `PENDING_OPT_IN` (Invited, present in device switcher `media_1794827255835.jpg`, but web opt-in not completed).
3. **Opt-In Evidence & Timestamp:** Device switcher verified; no Play opt-in confirmation timestamp available.
4. **App Installation Status:** `NOT_INSTALLED`.
5. **Installed Package & Version Code:** N/A.
6. **In-App Firebase Account Existence:** `MISSING` (No record in Firebase Auth).
7. **Assigned Application Role:** Intended `owner` (Unassigned in database).
8. **Successful Login Evidence:** None (Cannot authenticate).
9. **Completed UAT Steps:** 0 / 12 Steps.
10. **Outstanding Blockers:** Requires web opt-in acceptance + in-app QA account provisioning.
- **FINAL STATUS:** **BLOCKED**

#### T-03: `bincontraction11@gmail.com`
1. **Google Play Account Identity:** `bincontraction11@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `OPTED_IN` (Accepted via web opt-in link).
3. **Opt-In Evidence & Timestamp:** Play Console opted-in list, 2026-11-15 15:10 GST; confirmed in device switcher (`media_1794827255835.jpg`).
4. **App Installation Status:** `INSTALLED` via Google Play Closed Testing track.
5. **Installed Package & Version Code:** `ae.bingroups.superapp` — Version `1.0.1` (Code `17`).
6. **In-App Firebase Account Existence:** `EXISTS` (Production Firebase Auth UID verified).
7. **Assigned Application Role:** `tenant` (Verified claims and Firestore profile).
8. **Successful Login Evidence:** Verified login; landed on `/tenant/dashboard`.
9. **Completed UAT Steps:** 12 / 12 Steps completed in read-only mode (`T03_S01_Splash.png`, `T03_S04_TenantHome.png`, `T03_S06_MaintQueue.png`, `T03_S12_Logout.png`).
10. **Outstanding Blockers:** None.
- **FINAL STATUS:** **PASS**

#### T-04: `bincontractionexpert@gmail.com`
1. **Google Play Account Identity:** `bincontractionexpert@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `PENDING_OPT_IN` (Present in device switcher `media_1794827255835.jpg`, opt-in unconfirmed).
3. **Opt-In Evidence & Timestamp:** Device switcher verified; opt-in timestamp pending.
4. **App Installation Status:** `NOT_INSTALLED`.
5. **Installed Package & Version Code:** N/A.
6. **In-App Firebase Account Existence:** `MISSING` (No record in Firebase Auth).
7. **Assigned Application Role:** Intended `tenant` (Unassigned in database).
8. **Successful Login Evidence:** None.
9. **Completed UAT Steps:** 0 / 12 Steps.
10. **Outstanding Blockers:** Requires web opt-in acceptance + in-app QA account provisioning.
- **FINAL STATUS:** **BLOCKED**

#### T-05: `binhallofficial@gmail.com`
1. **Google Play Account Identity:** `binhallofficial@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `OPTED_IN` (Accepted via web opt-in link).
3. **Opt-In Evidence & Timestamp:** Play Console opted-in list, 2026-11-15 16:04 GST; confirmed in device switcher (`media_1794827239547.jpg`, `media_1794827255835.jpg`).
4. **App Installation Status:** `INSTALLED` via Google Play Closed Testing track.
5. **Installed Package & Version Code:** `ae.bingroups.superapp` — Version `1.0.1` (Code `17`).
6. **In-App Firebase Account Existence:** `EXISTS` (Production Firebase Auth UID verified).
7. **Assigned Application Role:** `technician` (Verified claims and Firestore profile).
8. **Successful Login Evidence:** Verified login; landed on `/technician/dashboard`.
9. **Completed UAT Steps:** 12 / 12 Steps completed with safe mock work order (`T05_S01_Launch.png`, `T05_S04_TechJobs.png`, `T05_S07_WorkOrder.png`, `T05_S11_GPSPrompt.png`).
10. **Outstanding Blockers:** None.
- **FINAL STATUS:** **PASS**

#### T-06: `ceo@bin-groups.com`
1. **Google Play Account Identity:** `ceo@bin-groups.com` (Corporate domain `@bin-groups.com`; requires Google Workspace federation).
2. **Closed-Testing Opt-In Status:** `NOT_ENROLLED` on Google Play Android track.
3. **Opt-In Evidence & Timestamp:** NONE. (No evidence of Play Console tester opt-in).
4. **App Installation Status:** `NOT_INSTALLED` on Android Play track. (Audited via Web Browser on `https://bin-groups.com`).
5. **Installed Package & Version Code:** N/A for Android package.
6. **In-App Firebase Account Existence:** `EXISTS` (Production Executive profile in Firebase Auth).
7. **Assigned Application Role:** `ceo` (Verified in Firestore and custom claims).
8. **Successful Login Evidence:** Web browser authenticated session verified (`CEO_AUTHENTICATION_AND_RBAC_AUDIT.md`).
9. **Completed UAT Steps:** Web RBAC audited; 0 / 12 Android Play UAT steps.
10. **Outstanding Blockers:** Must link corporate email to Google Account for Play Console testing; credential protection mandates zero account sharing.
- **FINAL STATUS:** **BLOCKED (On Android Play Closed Testing)**

#### T-07: `finance.admin@bin-groups.com`
1. **Google Play Account Identity:** `finance.admin@bin-groups.com` (Corporate domain `@bin-groups.com`; requires Google Workspace federation).
2. **Closed-Testing Opt-In Status:** `NOT_ENROLLED` on Google Play Android track.
3. **Opt-In Evidence & Timestamp:** NONE. (No evidence of Play Console tester opt-in).
4. **App Installation Status:** `NOT_INSTALLED` on Android Play track. (Audited via Web Browser on `apps/admin-panel`).
5. **Installed Package & Version Code:** N/A for Android package.
6. **In-App Firebase Account Existence:** `EXISTS` (Production Finance profile in Firebase Auth).
7. **Assigned Application Role:** `finance_admin` (Verified in Firestore and custom claims).
8. **Successful Login Evidence:** Web browser session verified (`FIN_ADMIN_DASHBOARD.png`).
9. **Completed UAT Steps:** Web RBAC audited; 0 / 12 Android Play UAT steps.
10. **Outstanding Blockers:** Must link to Google Account for Play Console; credential protection mandates zero account sharing; PR #2014 unmerged.
- **FINAL STATUS:** **BLOCKED (On Android Play Closed Testing)**

#### T-08: `meandyouinone54@gmail.com`
1. **Google Play Account Identity:** `meandyouinone54@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `PENDING_OPT_IN` (Present in device switcher `media_1794827239547.jpg`, opt-in unconfirmed).
3. **Opt-In Evidence & Timestamp:** Device switcher verified; opt-in timestamp pending.
4. **App Installation Status:** `NOT_INSTALLED`.
5. **Installed Package & Version Code:** N/A.
6. **In-App Firebase Account Existence:** `MISSING` (No record in Firebase Auth).
7. **Assigned Application Role:** Intended `technician` (Unassigned in database).
8. **Successful Login Evidence:** None.
9. **Completed UAT Steps:** 0 / 12 Steps.
10. **Outstanding Blockers:** Requires web opt-in acceptance + in-app QA account provisioning.
- **FINAL STATUS:** **BLOCKED**

#### T-09: `n7118368@gmail.com`
1. **Google Play Account Identity:** `n7118368@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `OPTED_IN` (Accepted via web opt-in link).
3. **Opt-In Evidence & Timestamp:** Play Console opted-in list, 2026-11-15 16:45 GST; confirmed in device switcher (`media_1794827239547.jpg`).
4. **App Installation Status:** `INSTALLED` via Google Play Closed Testing track.
5. **Installed Package & Version Code:** `ae.bingroups.superapp` — Version `1.0.1` (Code `17`).
6. **In-App Firebase Account Existence:** `EXISTS` (Production Firebase Auth UID verified).
7. **Assigned Application Role:** `broker` (Verified claims and Firestore profile).
8. **Successful Login Evidence:** Verified login; landed on `/broker/dashboard`.
9. **Completed UAT Steps:** 12 / 12 Steps completed in read-only mode (`T09_S01_Launch.png`, `T09_S04_BrokerHome.png`, `T09_S05_LeadList.png`, `T09_S10_CommissionRO.png`).
10. **Outstanding Blockers:** None.
- **FINAL STATUS:** **PASS**

#### T-10: `officialbinabdulghani@gmail.com`
1. **Google Play Account Identity:** `officialbinabdulghani@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `PENDING_OPT_IN` (Present in device switcher `media_1794827239547.jpg`, `media_1794827255835.jpg`, opt-in unconfirmed).
3. **Opt-In Evidence & Timestamp:** Device switcher verified; opt-in timestamp pending.
4. **App Installation Status:** `NOT_INSTALLED`.
5. **Installed Package & Version Code:** N/A.
6. **In-App Firebase Account Existence:** `MISSING` (No record in Firebase Auth).
7. **Assigned Application Role:** Intended `broker` (Unassigned in database).
8. **Successful Login Evidence:** None.
9. **Completed UAT Steps:** 0 / 12 Steps.
10. **Outstanding Blockers:** Requires web opt-in acceptance + in-app QA account provisioning.
- **FINAL STATUS:** **BLOCKED**

#### T-11: `rashid.pvt420@gmail.com`
1. **Google Play Account Identity:** `rashid.pvt420@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `OPTED_IN` (Accepted via web opt-in link).
3. **Opt-In Evidence & Timestamp:** Play Console opted-in list, 2026-11-15 13:50 GST; confirmed in device switcher (`media_1794827239547.jpg`, `media_1794827255835.jpg`).
4. **App Installation Status:** `INSTALLED` via Google Play Closed Testing track.
5. **Installed Package & Version Code:** `ae.bingroups.superapp` — Version `1.0.1` (Code `17`).
6. **In-App Firebase Account Existence:** `EXISTS` (Production Founder / DevOps / Admin profile verified).
7. **Assigned Application Role:** `admin` (Verified claims and Firestore profile).
8. **Successful Login Evidence:** Verified login; landed on `/admin/dashboard`.
9. **Completed UAT Steps:** 12 / 12 Steps completed in read-only mode (`T11_S01_AdminLaunch.png`, `T11_S04_AdminConsole.png`, `T11_S06_MaintDispatch.png`).
10. **Outstanding Blockers:** None.
- **FINAL STATUS:** **PASS**

#### T-12: `rashidbinabdulghani@gmail.com`
1. **Google Play Account Identity:** `rashidbinabdulghani@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `PENDING_OPT_IN` (Present in device switcher `media_1794827239547.jpg`, `media_1794827255835.jpg`, opt-in unconfirmed).
3. **Opt-In Evidence & Timestamp:** Device switcher verified; opt-in timestamp pending.
4. **App Installation Status:** `NOT_INSTALLED`.
5. **Installed Package & Version Code:** N/A.
6. **In-App Firebase Account Existence:** `MISSING` (No record in Firebase Auth).
7. **Assigned Application Role:** Intended `owner` (Backup) (Unassigned in database).
8. **Successful Login Evidence:** None.
9. **Completed UAT Steps:** 0 / 12 Steps.
10. **Outstanding Blockers:** Requires web opt-in acceptance + in-app QA account provisioning.
- **FINAL STATUS:** **BLOCKED**

#### T-13: `rashood.binag@gmail.com`
1. **Google Play Account Identity:** `rashood.binag@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `PENDING_OPT_IN` (Present in device switcher `media_1794827239547.jpg`, `media_1794827255835.jpg`, opt-in unconfirmed).
3. **Opt-In Evidence & Timestamp:** Device switcher verified; opt-in timestamp pending.
4. **App Installation Status:** `NOT_INSTALLED`.
5. **Installed Package & Version Code:** N/A.
6. **In-App Firebase Account Existence:** `MISSING` (No record in Firebase Auth).
7. **Assigned Application Role:** Intended `tenant` (Backup) (Unassigned in database).
8. **Successful Login Evidence:** None.
9. **Completed UAT Steps:** 0 / 12 Steps.
10. **Outstanding Blockers:** Requires web opt-in acceptance + in-app QA account provisioning.
- **FINAL STATUS:** **BLOCKED**

#### T-14: `umzayood420@gmail.com`
1. **Google Play Account Identity:** `umzayood420@gmail.com` (Direct `@gmail.com` account).
2. **Closed-Testing Opt-In Status:** `PENDING_OPT_IN` (Present in device switcher `media_1794827239547.jpg`, opt-in unconfirmed).
3. **Opt-In Evidence & Timestamp:** Device switcher verified; opt-in timestamp pending.
4. **App Installation Status:** `NOT_INSTALLED`.
5. **Installed Package & Version Code:** N/A.
6. **In-App Firebase Account Existence:** `MISSING` (No record in Firebase Auth).
7. **Assigned Application Role:** Intended `technician` (Backup) (Unassigned in database).
8. **Successful Login Evidence:** None.
9. **Completed UAT Steps:** 0 / 12 Steps.
10. **Outstanding Blockers:** Requires web opt-in acceptance + in-app QA account provisioning.
- **FINAL STATUS:** **BLOCKED**

---

## 3. Summary of Reconciled Register

| Category | Total Count | Tester IDs | Evidentiary Basis |
|---|---|---|---|
| **Android Play UAT Completed (PASS)** | **5** | T-01, T-03, T-05, T-09, T-11 | Play opt-in, APK v1.0.1 (code 17) installed, valid Firebase Auth account, 12/12 steps verified with device screenshots. |
| **Play Track Opt-In Blocked (BLOCKED)** | **2** | T-06, T-07 | Domain emails (`@bin-groups.com`) have no Google Play opt-in or Android device execution evidence. (Audited on Web only). |
| **In-App Firebase Account Missing (BLOCKED)** | **7** | T-02, T-04, T-08, T-10, T-12, T-13, T-14 | Present on devices but have no user accounts in Firebase Auth; cannot log into app. |
| **Total Invited Addresses** | **14** | All T-01 through T-14 | 100% accounted for with zero ambiguity. |
