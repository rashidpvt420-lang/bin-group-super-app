# BIN GROUP — 14-TESTER TRACKING MATRIX & ACCOUNT READINESS ROSTER

**Programme:** Google Play 14-Day Closed Testing & Controlled Live UAT  
**Application ID:** `ae.bingroups.superapp`  
**Package:** `ae.bingroups.superapp`  
**Production URL:** [https://play.google.com/store/apps/details?id=ae.bingroups.superapp](https://play.google.com/store/apps/details?id=ae.bingroups.superapp)  
**Web Opt-In URL:** [https://play.google.com/apps/testing/ae.bingroups.superapp](https://play.google.com/apps/testing/ae.bingroups.superapp)  
**Security Classification:** CONFIDENTIAL — STRICT CREDENTIAL ISOLATION  
**Policy Rule:** No passwords, OTPs, MFA secrets, refresh tokens, or session cookies may ever be logged, shared, or displayed.

---

## 1. EXECUTIVE TESTER TRACKING MATRIX

The following roster tracks all 14 invited tester addresses through the complete UAT lifecycle.

| # | Tester ID | Invited Email Address | Account Type | Google Play Eligibility | App Installed | Play Account Verified | BIN GROUP Account Status | Assigned Role | Login Status | Test Status | Evidence Received | Defects Reported |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| 1 | `T-01` | `binagpvt@gmail.com` | Google Account | ELIGIBLE | PENDING | `binagpvt@gmail.com` | UNCONFIRMED | Tenant | PENDING | NOT TESTED | PENDING | NONE |
| 2 | `T-02` | `binconstruction.ae@gmail.com` | Google Account | ELIGIBLE | PENDING | `binconstruction.ae@gmail.com` | UNCONFIRMED | Technician | PENDING | NOT TESTED | PENDING | NONE |
| 3 | `T-03` | `bincontraction11@gmail.com` | Google Account | ELIGIBLE | PENDING | `bincontraction11@gmail.com` | UNCONFIRMED | Technician | PENDING | NOT TESTED | PENDING | NONE |
| 4 | `T-04` | `bincontractionexpert@gmail.com` | Google Account | ELIGIBLE | PENDING | `bincontractionexpert@gmail.com` | UNCONFIRMED | Technician | PENDING | NOT TESTED | PENDING | NONE |
| 5 | `T-05` | `binhallofficial@gmail.com` | Google Account | ELIGIBLE | PENDING | `binhallofficial@gmail.com` | UNCONFIRMED | Owner | PENDING | NOT TESTED | PENDING | NONE |
| 6 | `T-06` | `ceo@bin-groups.com` | Enterprise Domain | CONDITIONAL* | VERIFIED | Google Workspace Req. | VERIFIED | Executive / Admin | VERIFIED | IN PROGRESS | PARTIAL | NONE |
| 7 | `T-07` | `finance.admin@bin-groups.com` | Enterprise Domain | CONDITIONAL* | PENDING | Google Workspace Req. | VERIFIED | Finance Admin | PENDING | NOT TESTED | PENDING | NONE |
| 8 | `T-08` | `meandyouinone54@gmail.com` | Google Account | ELIGIBLE | PENDING | `meandyouinone54@gmail.com` | UNCONFIRMED | Tenant | PENDING | NOT TESTED | PENDING | NONE |
| 9 | `T-09` | `n7118368@gmail.com` | Google Account | ELIGIBLE | PENDING | `n7118368@gmail.com` | UNCONFIRMED | Broker | PENDING | NOT TESTED | PENDING | NONE |
| 10 | `T-10` | `officialbinabdulghani@gmail.com` | Google Account | ELIGIBLE | PENDING | `officialbinabdulghani@gmail.com` | UNCONFIRMED | Owner | PENDING | NOT TESTED | PENDING | NONE |
| 11 | `T-11` | `rashid.pvt420@gmail.com` | Google Account | ELIGIBLE | VERIFIED | `rashid.pvt420@gmail.com` | VERIFIED | Owner / Lead Dev | VERIFIED | IN PROGRESS | PARTIAL | NONE |
| 12 | `T-12` | `rashidbinabdulghani@gmail.com` | Google Account | ELIGIBLE | PENDING | `rashidbinabdulghani@gmail.com` | UNCONFIRMED | Owner | PENDING | NOT TESTED | PENDING | NONE |
| 13 | `T-13` | `rashood.binag@gmail.com` | Google Account | ELIGIBLE | PENDING | `rashood.binag@gmail.com` | UNCONFIRMED | Tenant | PENDING | NOT TESTED | PENDING | NONE |
| 14 | `T-14` | `umzayood420@gmail.com` | Google Account | ELIGIBLE | PENDING | `umzayood420@gmail.com` | UNCONFIRMED | Tenant | PENDING | NOT TESTED | PENDING | NONE |

*\*Note on Custom Domain Accounts (`@bin-groups.com`): Google Play Console requires an active Google Account or Google Workspace account to accept closed-testing invitations and download builds from Google Play. If the domain is not backed by Google Workspace, the tester must associate the email with a Google Account or use a linked Gmail account to install the app.*

---

## 2. GOOGLE PLAY ACCOUNT VS. BIN GROUP APP IDENTITY

A critical failure point in mobile UAT is confusing the **Google Play Store Account** with the **BIN GROUP Application Account**:

```
┌────────────────────────────────────────┐       ┌────────────────────────────────────────┐
│      Google Play Store Account         │       │       BIN GROUP In-App Identity        │
│  (Used for APK/AAB Download & Opt-in)  │  ≠    │ (Used for UAE Property OS Role Access) │
│   e.g. your_personal@gmail.com         │       │     e.g. registered tenant/owner email │
└────────────────────────────────────────┘       └────────────────────────────────────────┘
```

1. **Google Play Tester Account:**
   - Exists exclusively on Google Play Console and the user's Android device Google Play Store.
   - Purpose: Grants permission to view the closed testing track, opt into the test, and install `ae.bingroups.superapp` on hardware running Google Play Services.
   - Requirement: Must be one of the 14 authorized email addresses invited to the Closed Testing track.
2. **BIN GROUP In-App Account:**
   - Exists in Firebase Authentication (`bin-group-57c60`) and Firestore (`users/{uid}`).
   - Purpose: Authorizes role-specific dashboards (`/owner`, `/tenant`, `/technician`, `/broker`, `/admin`).
   - Requirement: Testers must register or log in using an authorized email address. Having Google Play access **does not automatically create** an app account.

---

## 3. ROLE ALLOCATION & COVERAGE ANALYSIS

To satisfy Google Play's 14-day requirement and achieve rigorous 5-profile acceptance testing, the 14 testers are mapped across the 5 application profiles:

| Profile | Target Quota | Allocated Testers | Assigned Tester IDs | Primary Verification Focus |
|:---|:---:|:---|:---|:---|
| **Owner** | 3 | 4 | `T-05`, `T-10`, `T-11`, `T-12` | Property onboarding, unit registry, contracts, tenant occupancy, read-only financials |
| **Tenant** | 3 | 4 | `T-01`, `T-08`, `T-13`, `T-14` | Unit view, maintenance request creation, job progress, rent schedule (read-only) |
| **Technician** | 3 | 3 | `T-02`, `T-03`, `T-04` | Job acceptance, GPS arrival, evidence photo capture, completion sign-off |
| **Broker** | 2 | 1 | `T-09` | Client referrals, lead submission, commission visibility (read-only), marketing sheets |
| **Admin / Finance** | 2 | 2 | `T-06` (CEO), `T-07` (Finance) | Operational KPI oversight, queue inspection, dual-control validation (zero money execution) |
| **TOTAL** | **13** | **14** | All 14 Testers | **Comprehensive 5-Profile Matrix** |

---

## 4. STRICT PRIVILEGE & CREDENTIAL BOUNDARIES

In accordance with BIN GROUP Security Directives and UAE Data Protection regulations:
1. **No Shared Privileged Credentials:**
   - Under no circumstances will `ceo@bin-groups.com` or `finance.admin@bin-groups.com` credentials be shared with any external tester.
   - CEO and Finance Admin sessions must remain individually controlled by authorized executive personnel.
2. **No Production Role Elevation:**
   - Testers (`T-01` through `T-05` and `T-08` through `T-14`) will **never** be granted administrative, executive, or financial approval roles in the production environment.
   - No custom claims (`admin`, `super_admin`, `ceo`, `finance_admin`, `finance_manager`, `finance_controller`) may be added to general tester accounts.
3. **Safe Missing-Role Prototyping:**
   - If a specific role workflow cannot be exercised on a live tester account without risking production data integrity, it will be tested in local Firebase emulators or an isolated staging sandbox.
4. **MFA Integrity:**
   - All administrative tests require verified live Phone or TOTP MFA. Test scripts must never attempt to bypass MFA.
