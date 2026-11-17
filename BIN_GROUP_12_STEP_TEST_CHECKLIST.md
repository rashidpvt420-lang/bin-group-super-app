# BIN GROUP — Universal 12-Step Test Checklist & Tester Defect Pack

**Document ID:** BG-QA-UAT-004  
**Date:** November 16, 2026  
**Application Name:** BIN GROUP UAE Property Operations OS  
**Application ID:** `ae.bingroups.superapp`  
**Target Build:** Google Play Closed Testing Release (Version 1.0.1, Version Code 17)  
**Security Classification:** Strictly Confidential — Internal QA & Controlled UAT Only  

---

## 1. Universal 12-Step Test Protocol

This checklist applies to all 14 designated testers across all five role profiles (**Owner, Tenant, Technician, Broker, Admin/Finance**). Every step requires thorough manual verification, status recording, device context, and visual/log evidence.

> **CRITICAL RULE:** Do NOT mark any step `PASS` merely because a screen loads without throwing an error. Testers must verify that UI controls, tab navigation, list items, status badges, and interactive handlers operate strictly as expected.

| Step # | Evaluation Step | Scope & Verification Objective | Required Role Coverage | Evaluation Status Options |
|---|---|---|---|---|
| **Step 01** | **Install & Launch** | Cold launch from Play Store; splash screen animation; asset loading; permission prompts (Notifications). | All Roles | `PASS` / `FAIL` / `BLOCKED` |
| **Step 02** | **Sign In / Onboard** | Firebase Auth login with assigned credentials; email/password or OTP; remember-me toggle; session establishment. | All Roles | `PASS` / `FAIL` / `BLOCKED` |
| **Step 03** | **Role & Profile Confirmation** | Verify designated role badge matches assignment (`owner`, `tenant`, `technician`, `broker`, `admin`); check profile name/email. | All Roles | `PASS` / `FAIL` / `BLOCKED` |
| **Step 04** | **Home Dashboard & Navigation** | Role-tailored KPI widgets, quick-action cards, bottom navigation bar, header search/drawer. | All Roles | `PASS` / `FAIL` / `BLOCKED` |
| **Step 05** | **Property & Unit Visibility** | Unit listings, occupancy indicators, lease status, unit specifications (Read-Only). | Owner, Tenant, Broker, Admin | `PASS` / `FAIL` / `BLOCKED` / `N/A` |
| **Step 06** | **Maintenance Request Flow** | View ticket queues, filter by urgency, inspect issue details (view-only or non-sensitive mock ticket creation). | Owner, Tenant, Admin | `PASS` / `FAIL` / `BLOCKED` / `N/A` |
| **Step 07** | **Work Order / Technician Flow** | Job assignment list, status toggling (`Assigned` -> `In Progress`), job checklist, non-sensitive photo upload. | Technician, Admin | `PASS` / `FAIL` / `BLOCKED` / `N/A` |
| **Step 08** | **Notifications & In-App Messages** | Push notifications center, system announcements, ticket status alerts, unread counters. | All Roles | `PASS` / `FAIL` / `BLOCKED` |
| **Step 09** | **Authorized Documents & PDFs** | Leases, trade licenses, contract view in in-app PDF reader/web viewer (Read-Only; no confidential doc download). | Owner, Tenant, Broker, Admin | `PASS` / `FAIL` / `BLOCKED` / `N/A` |
| **Step 10** | **Payment / Finance (Read-Only)** | Transaction history, invoice receipts, rental schedules, commission ledger. **STRICTLY ZERO MONEY TRANSACTIONS / ZERO APPROVALS**. | Owner, Tenant, Broker, Admin | `PASS` / `FAIL` / `BLOCKED` |
| **Step 11** | **Maps, GPS & Permission Prompts** | Property geolocations, technician navigation intent, runtime GPS permission dialogs. | Technician, Owner, Broker | `PASS` / `FAIL` / `BLOCKED` / `N/A` |
| **Step 12** | **Session & Boundary Verification** | Logout, token revocation, re-login, attempting unauthorized deep links or role-restricted tabs. | All Roles | `PASS` / `FAIL` / `BLOCKED` |

---

## 2. Step-by-Step Detailed Execution Specification

### Step 01: Install and Launch
- **Route / Surface:** Android Launcher -> Splash Screen -> `/login`
- **Expected Result:** App installs cleanly from Google Play closed testing track. Cold launch completes within 2.5 seconds. Splash screen displays BIN GROUP branding. System prompts for POST_NOTIFICATIONS permission on Android 13+. No white screens, ANR dialogs, or unhandled exceptions.
- **Fail Criteria:** Install loop, crashing on launch, infinite loading spinner, black/white blank screen.

### Step 02: Sign In / Onboard
- **Route / Surface:** `/login` or `/onboarding`
- **Expected Result:** Login form renders cleanly with Email and Password inputs. Input sanitization prevents spaces in email. Submitting valid credentials signs user in via Firebase Auth, establishes local token storage, and redirects to the designated role landing page without role leakage.
- **Fail Criteria:** Login button unresponsive, `auth/network-request-failed` without fallback messaging, uncaught promise rejection, redirecting to generic `/` or landing on public marketing page while authenticated.

### Step 03: Confirm Assigned Role and Profile
- **Route / Surface:** Bottom Navigation -> Profile / Settings (`/profile`)
- **Expected Result:** User profile card displays exact assigned email, user display name, and role badge (e.g., "Verified Property Owner", "Tenant", "Field Technician", "Licensed Broker", "System Administrator"). Role capabilities match server-side claims.
- **Fail Criteria:** Role displayed as `undefined`, generic `user`, mismatch between tester identity and UI profile, or missing profile details.

### Step 04: Inspect Home Dashboard and Navigation
- **Route / Surface:** Role Home (`/owner/dashboard`, `/tenant/dashboard`, `/technician/dashboard`, `/broker/dashboard`, `/admin/dashboard`)
- **Expected Result:** Header displays user greeting and notifications bell. KPI cards populate with live or assigned demo data (e.g., Total Units, Active Leases, Pending Tickets). Bottom navigation tabs switch routes smoothly with preserved scroll state.
- **Fail Criteria:** Blank KPI cards displaying NaN or `undefined`, tabs failing to route, bottom navigation overlapping screen content on devices with navigation gestures.

### Step 05: Inspect Property/Unit Information
- **Route / Surface:** Properties Tab (`/properties`, `/units`, `/owner/properties`)
- **Expected Result:** Filterable list of properties and units. Clicking a unit card opens unit detail sheet showing unit number, square footage, annual rent, tenant status, and amenities. Data is strictly read-only.
- **Fail Criteria:** Inability to load unit details, crashing on property image carousel, or editing controls accessible without edit permissions.

### Step 06: Inspect Maintenance Request Workflow
- **Route / Surface:** Maintenance Tab (`/maintenance`, `/tenant/requests`, `/owner/requests`)
- **Expected Result:** Ticket queue displays categorized requests (Plumbing, Electrical, HVAC, Structural) with status badges (`Pending`, `Assigned`, `In Progress`, `Completed`). Detail view displays ticket timestamp, description, urgency level, and technician note history.
- **Fail Criteria:** Ticket cards missing status indicators, filters not updating list, ticket details throwing network errors.

### Step 07: Inspect Work Order / Technician Workflow
- **Route / Surface:** Technician Jobs (`/technician/jobs`, `/technician/active-job`)
- **Expected Result:** Technician sees prioritized daily job queue. Selecting a job displays unit access notes, tenant contact (masked/in-app only), job checklist, and action buttons ("Accept", "Start Work", "Upload Evidence", "Complete"). Status transition operates smoothly on assigned test ticket.
- **Fail Criteria:** Inability to view assigned work orders, photo picker crashing on Android camera/gallery intent, status update failing silently.

### Step 08: Inspect Notifications and Messages
- **Route / Surface:** Notifications Center (`/notifications`)
- **Expected Result:** Notifications list shows categorized system notifications (Ticket updates, Rental notices, Announcements) sorted by timestamp descending. Tapping an item marks it as read and navigates to the relevant entity.
- **Fail Criteria:** Notification badge count does not decrement on read, clicking notification results in 404/broken route, list fails to refresh on pull-to-refresh.

### Step 09: Inspect Authorized Documents and PDFs
- **Route / Surface:** Documents Tab (`/documents`, `/contracts`)
- **Expected Result:** Document repository lists signed Tenancy Contracts (Ejari), Inspection Reports, and Insurance Policies. Tapping a document opens secure in-app viewer. Confidential fields (Emirates ID numbers, bank IBANs) are properly redacted or masked in test files.
- **Fail Criteria:** PDF viewer displays blank grey page, app crashes when rendering embedded viewer, unauthorized access to other tenants' documents.

### Step 10: Inspect Payment / Finance Screens (Read-Only)
- **Route / Surface:** Finance / Payments Tab (`/finance`, `/payments`, `/invoices`)
- **Expected Result:** Financial summary loads with AED currency formatting (e.g., `AED 120,000`). Invoices list dates, amounts, status (`Paid`, `Pending`, `Overdue`). Details drawer displays line items and download receipt option. **Zero transaction execution or approval controls enabled for non-finance roles**.
- **Fail Criteria:** Action buttons permitting real credit card charges or approval actions for non-finance accounts; negative or corrupted currency strings (e.g., `$undefined`).

### Step 11: Inspect Maps, GPS and Permission Prompts
- **Route / Surface:** Property Map / Technician Navigation (`/map`, `/jobs/:id/navigate`)
- **Expected Result:** Interactive map pins property location. Tapping a property shows bottom preview card. Technician navigation prompts for ACCESS_FINE_LOCATION permission gracefully; refusing permission gracefully falls back to static address.
- **Fail Criteria:** Map rendering as gray blank grid (API key rejection), app crashing immediately upon location permission denial.

### Step 12: Test Logout, Re-Login & Session Boundaries
- **Route / Surface:** Profile -> Logout -> `/login`
- **Expected Result:** Tapping "Sign Out" triggers confirmation dialog. Confirming revokes session, clears secure storage tokens, and redirects immediately to `/login`. Pressing Android "Back" hardware button does NOT restore authenticated screens. Attempting deep link to `/admin` as tenant redirects to login or unauthorized page.
- **Fail Criteria:** Session remains active after logout; hardware back button navigates back into authenticated screens (cache leak); unauthorized route accessible.

---

## 3. Standard Tester Execution Sheet Template

*Testers must fill out one execution record for each step tested.*

```markdown
### TEST EXECUTION RECORD: STEP [01 - 12]
- **Tester ID:** [T-01 to T-14]
- **Tester Email:** [tester@domain.com]
- **Assigned Role:** [Owner | Tenant | Technician | Broker | Admin]
- **Test Date & Time:** [YYYY-MM-DD HH:MM UTC/GST]
- **Device Make & Model:** [e.g., Samsung Galaxy S23 Ultra / Google Pixel 8 / Xiaomi Redmi Note 13]
- **Android OS Version:** [e.g., Android 14 (API 34) / Android 13 (API 33)]
- **App Version:** 1.0.1 (Version Code 17)
- **Step Evaluated:** Step [XX] - [Step Name]
- **Target Route / Screen:** [e.g., /owner/dashboard]

#### RESULTS
- **Outcome:** [ ] PASS   [ ] FAIL   [ ] BLOCKED   [ ] NOT AVAILABLE
- **Expected Behavior:** [Brief summary of what was expected]
- **Observed Behavior:** [Exact behavior observed on device]
- **Evidence Reference:** [e.g., screenshot_step04_pixel8.png or screenrecord_step04.mp4]

#### DEFECT REPORTING (If FAIL or BLOCKED)
- **Defect Severity:** [ ] CRITICAL (Crash/Blocker)  [ ] HIGH (Core broken)  [ ] MEDIUM (UI glitch)  [ ] LOW (Minor cosmetic)
- **Steps to Reproduce:**
  1. 
  2. 
  3. 
- **Error Messages / Log Snippets:** [Paste exact text from screen or logcat]
- **Notes / Observations:** [Any additional context]
```

---

## 4. Central Defect Severity Classification Matrix

| Severity Level | Definition | SLA / Remediation Policy | Examples |
|---|---|---|---|
| **CRITICAL** | Application crash, freeze (ANR), security breach, unauthorized role escalation, unhandled fatal exception preventing app usage. | Immediate stop-ship; must be resolved and verified before public release. | App crashes on launch; Tenant able to view Admin dashboard; financial write action executable on live funds. |
| **HIGH** | Major functional feature broken with no available workaround; core user journey completely blocked. | Release blocker unless non-critical auxiliary feature with documented workaround. | Cannot view assigned work orders; Maintenance request submission button completely unresponsive. |
| **MEDIUM** | Feature functions partially, non-optimal UI glitch, cosmetic layout corruption on specific screen resolutions, data truncation. | Remediate in next scheduled patch or hotfix. | Text overlapping on Arabic RTL mode; thumbnail image fails to load placeholder; filter dropdown misaligned. |
| **LOW** | Minor aesthetic defect, spelling error, minor padding discrepancy, non-disruptive animation stutter. | Backlog for routine release maintenance. | Icon off-center by 2px; minor typo in disclaimer footnote; animation frame drop during page transition. |

---

## 5. Step-by-Step Guidance for Testers

### 5.1 Google Play Store Enrollment
1. Open invitation email on your Android smartphone.
2. Click the official closed testing opt-in link:  
   `https://play.google.com/apps/testing/ae.bingroups.superapp`
3. Ensure you are signed in with the exact Google account invited.
4. Tap the blue button: **"Become a tester"**.
5. You will see the confirmation screen: *"You are now a tester"*.
6. Click the link provided on that screen: **"Download it on Google Play"**.
7. In the Google Play Store app, verify the badge says "Early Access" or "(Beta)", then tap **Install** or **Update**.

### 5.2 Application Login & Role Selection
1. Launch **BIN GROUP** from your app drawer.
2. On the `/login` screen, enter your assigned BIN GROUP credentials (NOT your personal Google Play password).
3. If prompted, verify your email or complete in-app profile confirmation.
4. Verify your assigned role profile loads automatically.

### 5.3 Capturing & Redacting Evidence Safely
1. Take a screenshot (Power + Volume Down) or screen recording of each checklist step.
2. **REDACTION MANDATE:** Before uploading or submitting evidence:
   - Blur or redact any personal telephone numbers, Emirates ID numbers, passport scans, or banking IBANs.
   - Do NOT capture OTP popups or password manager overlays.
3. Save files with standard naming: `T{ID}_Step{XX}_{Device}_{Outcome}.png` (e.g., `T01_Step04_GalaxyS23_PASS.png`).

### 5.4 Troubleshooting: Play Store vs In-App Login Errors
- **"Item not found" or "URL not found" on Google Play:**  
  *Cause:* You have not completed Step 5.1 (opt-in link) OR you are logged into Play Store with a different Google account.  
  *Fix:* Switch Google accounts in Play Store app top-right avatar, or open the opt-in link in Chrome under your invited account.
- **"Invalid email or password" in App:**  
  *Cause:* In-app BIN GROUP credentials differ from your Google account.  
  *Fix:* Check your tester onboarding pack for assigned QA credentials. Contact QA lead if password reset is needed.
- **"Account Disabled / Role Unassigned":**  
  *Cause:* Your account has not yet been provisioned in the staging/QA user directory.  
  *Fix:* Report to QA Coordinator with your Tester ID for role assignment. Do not attempt self-signup as an Admin.
