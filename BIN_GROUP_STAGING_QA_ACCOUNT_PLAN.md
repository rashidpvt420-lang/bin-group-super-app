# BIN GROUP — Staging QA Account Provisioning Plan & Safe Onboarding Protocol

**Document ID:** BG-QA-UAT-REC-003  
**Audit Date:** November 16, 2026  
**Application ID:** `ae.bingroups.superapp`  
**Classification:** Operational Security & Test Environment Protocol  

---

## 1. Context & Architectural Constraint

Seven invited Google Play testers (T-02, T-04, T-08, T-10, T-12, T-13, T-14) cannot authenticate because they do not have active user accounts in the Firebase backend.

### Critical System Rule (from `AGENTS.md`)
> *"The frontend always talks to production Firebase (`bin-group-57c60`) — it does not wire itself to the local emulators, and there is no anonymous auth... Full authenticated end-to-end testing is blocked without credentials."*

Because the currently published Google Play Store build (`ae.bingroups.superapp`, Version 1.0.1, Version Code 17) compiles hardcoded production Firebase configuration, **staging accounts provisioned in a local emulator or a separate staging Firebase project cannot authenticate on the published Play Store APK**.

### Mandatory Safety Guardrails (Prompt Section 3 & 6)
To ensure zero compromise of the production environment, the following actions are **STRICTLY PROHIBITED**:
- ❌ Do NOT create unverified production Firebase users without Change Control Board (CCB) authorization.
- ❌ Do NOT mutate production custom claims or grant elevated administrative roles.
- ❌ Do NOT reset existing users' passwords.
- ❌ Do NOT share CEO (`ceo@bin-groups.com`) or Finance Admin (`finance.admin@bin-groups.com`) credentials.
- ❌ Do NOT use a single shared account to represent multiple testers.
- ❌ Do NOT expose OTPs, passwords, refresh tokens, or session secrets.

---

## 2. Individual Staging QA Role Allocation Plan

The 7 missing accounts are mapped to their intended profiles to achieve comprehensive five-role coverage:

| Tester ID | Email Address | Assigned Application Role | Target Profile Scope | Justification & Role Boundary |
|---|---|---|---|---|
| **T-02** | `binconstruction.ae@gmail.com` | **Owner** | Property portfolio, unit lists, occupancy KPI, maintenance visibility. | Validates primary Owner journey; strictly read-only financials. |
| **T-04** | `bincontractionexpert@gmail.com` | **Tenant** | Lease contract viewer, unit details, maintenance ticket logging. | Validates tenant lifecycle and ticket triage. |
| **T-08** | `meandyouinone54@gmail.com` | **Technician** | Assigned work order queue, job status progression, mock photo upload, GPS permissions. | Validates field service dispatch without affecting live properties. |
| **T-10** | `officialbinabdulghani@gmail.com` | **Broker** | Lead pipeline, property catalog, commission ledger (read-only). | Validates commercial broker operations. |
| **T-12** | `rashidbinabdulghani@gmail.com` | **Owner (Secondary / Backup)** | Multi-property management, multiple unit associations. | Validates secondary owner edge cases and concurrent viewing. |
| **T-13** | `rashood.binag@gmail.com` | **Tenant (Secondary / Backup)** | Renewal notices, notification center, document downloads. | Validates tenant renewal workflows and notification receipts. |
| **T-14** | `umzayood420@gmail.com` | **Technician (Secondary / Backup)** | Emergency ticket response, off-duty status toggle. | Validates multi-technician concurrent dispatch. |

---

## 3. Staging-Only Safe Provisioning Specification

### 3.1 Isolated Test Fixtures Schema
When seeded in a staging Firebase instance (`bin-group-staging`), each tester identity is paired with isolated mock data records:
- **Mock Properties:** Pre-seeded properties in `properties/` collection tagged with `isTestRecord: true` and `env: "staging"`.
- **Mock Leases:** Tenancy contracts with synthetic dates (e.g., `START: 2026-01-01`, `END: 2026-12-31`), synthetic rent amounts (`AED 85,000`), and redacted PII placeholders.
- **Mock Work Orders:** Plumbing and HVAC tickets tagged `testRecord: true` assigned exclusively to `T-08` and `T-14`.

### 3.2 Password & Credential Lifecycle
1. Accounts must be initialized via Firebase Admin SDK with a cryptographically secure random bootstrap secret.
2. An automated password-reset link is generated using Firebase Auth `generatePasswordResetLink()`.
3. The individual tester sets their private password directly on the secure Firebase Auth verification page.
4. Passwords and OTPs are never stored, logged, or communicated across unencrypted channels.

### 3.3 Custom Claims Matrix for Staging
```json
// T-02 / T-12 (Owner)
{ "role": "owner", "userRole": "owner", "owner": true, "isStaff": false, "isAdmin": false, "env": "staging" }

// T-04 / T-13 (Tenant)
{ "role": "tenant", "userRole": "tenant", "tenant": true, "isStaff": false, "isAdmin": false, "env": "staging" }

// T-08 / T-14 (Technician)
{ "role": "technician", "userRole": "technician", "technician": true, "isStaff": true, "isAdmin": false, "env": "staging" }

// T-10 (Broker)
{ "role": "broker", "userRole": "broker", "broker": true, "isStaff": false, "isAdmin": false, "env": "staging" }
```
*Note: Under no circumstances are `admin`, `super_admin`, `ceo`, or `finance_admin` claims assigned to any of these accounts.*

---

## 4. Operational Blocker & Exact Prerequisites

### Current Status: **BLOCKED**

### Root Cause
1. **Target Build Coupling:** The published Google Play APK (`ae.bingroups.superapp`, v1.0.1, code 17) connects exclusively to the live production Firebase project (`bin-group-57c60`).
2. **Safety Rule Conflict:** Creating staging accounts in a local emulator or staging database does not allow login on the production APK, while creating accounts in the production database is strictly prohibited by change-control rules without formal CCB authorization.

### Exact Prerequisites to Unblock
To unblock authenticated testing for these 7 testers, the project requires one of two formal operational authorizations:

#### Path A: Staging Android APK Build (Recommended for Pure Staging)
1. Configure Vite build with `VITE_FIREBASE_PROJECT_ID=bin-group-staging`.
2. Generate an Android staging build: `cd android && ./gradlew assembleStaging`.
3. Distribute the staging APK via Firebase App Distribution or Google Play Internal App Sharing to the 7 testers.
4. Seed the staging database using `test/helpers/seedStagingUsers.mjs`.

#### Path B: Controlled Production Pre-Provisioning (If Testing Must Use Play Store Build)
1. Obtain formal written Change Control Board (CCB) approval to create 7 standard end-user accounts in production Firebase Auth.
2. Execute automated provisioning using `functions/adminUserProvisioning.ts` with explicit end-user roles (`owner`, `tenant`, `technician`, `broker`).
3. Enforce mandatory password reset on first login.
4. Associate accounts strictly with designated synthetic test property documents (`isTestRecord: true`).
