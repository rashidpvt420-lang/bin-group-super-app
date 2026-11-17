# BIN GROUP — GOOGLE PLAY TEST ACCESS & BUILD METADATA AUDIT

**Target Package:** `ae.bingroups.superapp`  
**Application Title:** BIN GROUP Home OS  
**Audit Date:** November 16, 2026  
**Environment:** Google Play Console — Closed Testing Track  
**Strict Restriction:** READ-ONLY AUDIT — Zero modifications to Play Console, tracks, releases, or AAB artifacts.

---

## 1. PUBLISHED BUILD METADATA

The build metadata extracted from the project repository and confirmed against the active release pipeline is as follows:

| Metadata Attribute | Verified Value | Authoritative Source | Audit Remarks |
|:---|:---|:---|:---|
| **Package Name / Application ID** | `ae.bingroups.superapp` | `android/app/build.gradle` (line 7), `capacitor.config.ts` | Fully canonical across Android and iOS targets |
| **Version Name** | `1.0.1` | `android/app/build.gradle` (line 11) | Semantic release version |
| **Version Code** | `17` | `android/app/build.gradle` (line 10) | Monotonically increasing build integer |
| **Compile SDK** | `34` (Android 14) | `android/variables.gradle` | Meets Google Play 2026 API requirements |
| **Target SDK** | `34` (Android 14) | `android/variables.gradle` | Fully compliant with target API level mandates |
| **Minimum SDK** | `22` (Android 5.1) | `android/variables.gradle` | Broad hardware compatibility across UAE devices |
| **Testing Track** | **Closed Testing** (`Alpha` / Closed Track) | Google Play Console | Currently active 14-day continuous testing program |
| **Release Status** | **Active in Closed Testing** | Google Play Console | 14-day reset mandate by Google Play review |
| **App Signing** | Google Play App Signing | Google Play Console | Upload key managed via protected workflow |
| **Play Integrity Integration** | Enabled (App Check) | `FirebaseAppCheckBridgePlugin.java` | Protects production callables from unauthorized clients |

---

## 2. ENROLLMENT URL & STORE ACCESS ARCHITECTURE

A common source of tester confusion and reported "404 Not Found" defects is attempting to access the Google Play listing directly without first completing web-based opt-in.

### The Two Critical URLs:

1. **Web Opt-In Enrollment URL (MANDATORY FIRST STEP):**
   ```
   https://play.google.com/apps/testing/ae.bingroups.superapp
   ```
   - **Role:** Registers the tester's Google account into Google Play's internal testing license database.
   - **User Action:** The tester must sign in with their invited Google account and tap the blue button: **"Become a tester"**.
   - **Confirmation Text:** *"You are now a tester. An update will be available shortly..."*

2. **Google Play Store Direct Listing URL:**
   ```
   https://play.google.com/store/apps/details?id=ae.bingroups.superapp
   ```
   - **Behavior Before Opt-In:** Displays `Item not found` or `We're sorry, the requested URL was not found on this server.`
   - **Behavior After Opt-In:** Successfully renders the BIN GROUP Home OS store listing with the **"Install"** or **"Update"** button.

```
Tester clicks Direct Store Link ──> NOT OPTED IN ──> Error: "Item not found" (BLOCKED)
       │
       └───> Visits Opt-In Link ──> Clicks "Become a tester" ──> Opens Store ──> "Install" (PASS)
```

---

## 3. TESTER ACCOUNT ELIGIBILITY AUDIT

### 1. Gmail Accounts (12 Accounts) — Status: **ELIGIBLE IMMEDIATELY**
The following 12 accounts are standard Google consumer accounts (`@gmail.com`). Once invited in Google Play Console, they can accept the opt-in link instantly:
- `binagpvt@gmail.com`
- `binconstruction.ae@gmail.com`
- `bincontraction11@gmail.com`
- `bincontractionexpert@gmail.com`
- `binhallofficial@gmail.com`
- `meandyouinone54@gmail.com`
- `n7118368@gmail.com`
- `officialbinabdulghani@gmail.com`
- `rashid.pvt420@gmail.com`
- `rashidbinabdulghani@gmail.com`
- `rashood.binag@gmail.com`
- `umzayood420@gmail.com`

### 2. Custom Domain Accounts (2 Accounts) — Status: **CONDITIONAL / WORKSPACE PREREQUISITE**
- `ceo@bin-groups.com`
- `finance.admin@bin-groups.com`

**Technical Constraint:**
Google Play Console only delivers closed testing builds to accounts authenticated through Google Identity. If `@bin-groups.com` is an independent mail server (e.g. cPanel / Postfix) and not configured as a Google Workspace tenant, attempting to open `https://play.google.com/apps/testing/ae.bingroups.superapp` will trigger a Google sign-in prompt that fails because no Google Account exists for that email.

**Resolution Protocol (Without Production Mutation):**
1. Testers using enterprise email must either:
   - Link their `@bin-groups.com` address as an alternate/recovery email to their primary Google Account, OR
   - Download the app from Google Play using their invited Gmail account (`rashid.pvt420@gmail.com` or similar) and subsequently sign in to the app using their `@bin-groups.com` credentials.
2. Under no circumstances will Play Console permissions or production Firebase claims be modified to bypass this requirement.

---

## 4. STRICT CHANGE-CONTROL CERTIFICATION

- **No Track Alterations:** No closed testing tracks have been renamed, created, or closed.
- **No Tester List Modification:** No testers were added or deleted from Google Play Console during this audit.
- **No AAB Generation or Upload:** Build `1.0.1` (`17`) remains the immutable artifact in the Play Console track.
- **No Policy Changes:** App content, Data Safety declarations, and Target Audience settings remain untouched.
