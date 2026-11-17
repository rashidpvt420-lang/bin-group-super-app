# BIN GROUP — Role Access, Authentication Boundaries & Login Blockers Audit

**Document ID:** BG-QA-UAT-006  
**Date:** November 16, 2026  
**Application ID:** `ae.bingroups.superapp`  
**Classification:** Operational Security & Architecture Audit  

---

## 1. Executive Summary & Core Architectural Finding

During this 14-tester coordinated UAT audit of the BIN GROUP Super App on Android (`ae.bingroups.superapp`), the primary blocker identified is the **complete decoupling between Google Play Store tester enrollment and in-app BIN GROUP identity authentication**.

A user being invited to or enrolled in the Google Play Closed Testing Track receives permissions **only** to download the Android APK/AAB from Google Play. It does **not** create, provision, or authenticate a user account within the BIN GROUP Firebase Auth / Firestore database.

Furthermore, strict security rules prohibit:
1. Sharing privileged executive credentials (e.g., `ceo@bin-groups.com`, `finance.admin@bin-groups.com`).
2. Mutating production custom claims or promoting test accounts to administrative tiers in production.
3. Enabling public self-registration with elevated privileges.

---

## 2. In-App Identity vs Google Play Store Account Disconnection

```
+-------------------------------------------------------------------+
|                     GOOGLE PLAY CONSOLE LAYER                     |
|                                                                   |
|   14 Invited Google Accounts (12 @gmail.com, 2 @bin-groups.com)   |
|                                 |                                 |
|          Web Opt-in: play.google.com/apps/testing/...             |
|                                 v                                 |
|                 Downloads/Updates AAB (Version 17)                |
+-------------------------------------------------------------------+
                                  |
                                  | Native APK installed on device
                                  v
+-------------------------------------------------------------------+
|                    BIN GROUP APPLICATION LAYER                    |
|                                                                   |
|   In-App Sign In Screen: Firebase Auth (Email/Password or OTP)    |
|                                 |                                 |
|          Does an authorized BIN GROUP account exist?              |
|                     /                       \                     |
|                   YES                       NO                    |
|                    v                         v                    |
|         Load Assigned Role             LOGIN BLOCKED              |
|        (Owner/Tenant/Tech/...)      (User not found/      |
|                                     Requires Onboarding)          |
+-------------------------------------------------------------------+
```

### Key Differences
| Attribute | Google Play Account | BIN GROUP App Account |
|---|---|---|
| **Purpose** | Authorizes device to download beta AAB via Google Play Store. | Authenticates tenant/owner/staff to access private property data. |
| **Identity Provider** | Google Accounts (`accounts.google.com`). | Firebase Authentication (`bin-group-57c60`). |
| **Identifier Format** | Google email address. | Firebase UID linked to email/phone. |
| **Authorization Store** | Play Console Tester List (Track: Closed Testing). | Firestore `users/{uid}` + Firebase Custom Claims. |
| **Credential Used** | Google Account password / Android device lock. | Dedicated BIN GROUP password, Magic Link, or OTP. |

---

## 3. Detailed Tester Account Audit & Blocker Breakdown

### 3.1 Group A: Active & Audited Identities (6 Testers)
These 6 accounts have established identities and verified profile coverage across all five roles under controlled conditions:
1. `binagpvt@gmail.com` — **Owner Profile** (Verified read-only portfolio access).
2. `bincontraction11@gmail.com` — **Tenant Profile** (Verified lease and maintenance ticket view).
3. `binhallofficial@gmail.com` — **Technician Profile** (Verified work order queue and GPS prompts).
4. `n7118368@gmail.com` — **Broker Profile** (Verified leads and commission dashboard).
5. `rashid.pvt420@gmail.com` — **Admin / DevOps** (Verified administrative dispatch overview).
6. `ceo@bin-groups.com` / `finance.admin@bin-groups.com` — **Executive Profiles** (Independently audited; strictly isolated).

### 3.2 Group B: Blocked on In-App Account Existence (8 Testers)
The following 8 testers have received invitations to the Google Play track but **do not possess active production in-app user records**:
1. `binconstruction.ae@gmail.com` (Intended: Owner)
2. `bincontractionexpert@gmail.com` (Intended: Tenant)
3. `meandyouinone54@gmail.com` (Intended: Technician)
4. `officialbinabdulghani@gmail.com` (Intended: Broker)
5. `rashidbinabdulghani@gmail.com` (Intended: Owner Backup)
6. `rashood.binag@gmail.com` (Intended: Tenant Backup)
7. `umzayood420@gmail.com` (Intended: Technician Backup)

**Why they are blocked:**
When these testers install the app and enter their email on the login screen, Firebase Auth throws `auth/user-not-found` or the app informs them that their profile is not registered.

---

## 4. Google Account vs Custom Domain (`@bin-groups.com`) Blockers

Testers `ceo@bin-groups.com` and `finance.admin@bin-groups.com` use custom corporate domain addresses:
- **Play Store Requirement:** To accept an invite on Google Play with a custom domain email, that email must be backed by a **Google Workspace** tenant or a user-created Google Account ("Use my current email address instead").
- **Current Blocker:** If the user attempts to open `https://play.google.com/apps/testing/ae.bingroups.superapp` while logged into an unlinked email, Google Play returns `HTTP 403 Forbidden` or `Item not found`.
- **Operational Requirement:** The individual holders of `ceo@bin-groups.com` and `finance.admin@bin-groups.com` must ensure their Google Play app store profile is federated or use an associated Google ID for Play downloads, while preserving their corporate email for in-app login.

---

## 5. Strict Executive Credential Isolation & Anti-Sharing Mandate

Under the governance rules established in `CEO_AUTHENTICATION_AND_RBAC_AUDIT.md` and `CEO_FINANCIAL_AUTHORITY_POLICY_RECONCILIATION.md`:
1. **Never Share Executive Accounts:** `ceo@bin-groups.com` and `finance.admin@bin-groups.com` must never be shared among QA testers or external testing agencies.
2. **Never Promote Testers in Production:** No external tester may be assigned `admin`, `super_admin`, `finance_admin`, or `ceo` custom claims in the live production database.
3. **MFA Binding:** Both executive accounts are protected by multi-factor authentication and device binding. Sharing passwords or session tokens represents an immediate security violation.

---

## 6. App Check & Play Integrity Enforcement on Native Android

The Android application `ae.bingroups.superapp` is configured with **Firebase App Check** backed by the **Google Play Integrity API**:
- **Release Fingerprint:** Only builds signed with the official Google Play upload key or Play app signing key generate valid Play Integrity attestation tokens.
- **Symptom if Integrity Fails:** If a tester attempts to sideload a raw debug APK or install from an unauthorized channel, Firebase Cloud Functions and Firestore will reject requests with:
  ```json
  { "error": { "code": 401, "message": "AppCheck failed: App not recognized by Play Integrity" } }
  ```
- **Verification:** All 14 testers must install strictly through the official Google Play closed testing track to obtain genuine Play Integrity tokens.

---

## 7. Recommended Remediation & Safe Onboarding Protocol

To enable testing for the 8 currently blocked testers without modifying production data or compromising security:

1. **Option A: Staging / Emulator Environment Provisioning (Recommended)**
   - Boot the staging Firebase environment with test seed accounts.
   - Provision mock records for `T-02`, `T-04`, `T-08`, `T-10`, `T-12`, `T-13`, `T-14`.
   - Provide temporary, time-bound QA passwords directly to individual testers over secure channels.

2. **Option B: Controlled Production Pre-Provisioning (Requires Formal Sign-off)**
   - If testing must be performed on production, an authorized administrator must use `functions/adminUserProvisioning.ts` to create the 8 user profiles with read-only scopes.
   - Enforce mandatory password reset on first login.
   - Strictly prohibit assignment of financial or administrative claims.
