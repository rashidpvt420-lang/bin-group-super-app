# BIN GROUP — Google Play Closed Testing Period & Production Access Evidence

**Document ID:** BG-QA-UAT-REC-002  
**Audit Date:** November 16, 2026  
**Application ID:** `ae.bingroups.superapp`  
**Play Console Developer ID:** `5799216464320445251`  
**Play Console App ID:** `4974609289790604989`  
**Primary Source Evidence Artifacts:**  
- `media_1794827104273.png` (Desktop Play Console Dashboard Screenshot)  
- `media_1794827218928.jpg` (Mobile Play Console Dashboard Screenshot)  

---

## 1. Google Play Console Production Access Status

Based on direct visual inspection of the official Google Play Console dashboard for package `ae.bingroups.superapp`, the application has undergone a formal production access review by Google and received an explicit determination.

### Official Google Play Console Decision Banner
> **Alert Banner:** ⚠️ **"Your app requires more testing to access Google Play production"**  
> *"We reviewed your application, and determined that your app requires more testing before you can access production. Before applying again, continue testing your app following our guidance for gaining production access. Learn more"*  
> **Review Timestamp:** *"Reviewed today, 12:02 AM"* (November 16, 2026)  
> **Action Button:** `Apply for production` is **DISABLED / GREYED OUT**.

---

## 2. Play Console Mandatory 3-Criteria Evaluation

The Play Console dashboard presents three explicit criteria required to unlock the "Apply for production" workflow:

| Criteria # | Requirement Description | Console Status | Evidentiary Finding |
|---|---|---|---|
| **Criterion 1** | **Publish a closed testing release** | **COMPLETED (Green Checkmark ✓)** | Release published on Closed Testing track (`ae.bingroups.superapp`, Version 1.0.1, Version Code 17). |
| **Criterion 2** | **Have at least 12 testers opted in to your closed test** | **COMPLETED (Green Checkmark ✓)** | Google Play Console confirms that at least 12 tester accounts have successfully opted into the closed testing track. |
| **Criterion 3** | **Run your closed test with at least 12 testers for 14 more days starting from the review date** | **INCOMPLETE (Empty Radio Circle ○)** | **BLOCKED / IN PROGRESS.** The 14-day clock has been reset starting from the review date (November 16, 2026 at 12:02 AM). |

---

## 3. Detailed Verification of the 5 Testing-Period Parameters

### 3.1 Number of Qualifying Opted-In Testers
- **Requirement:** At least 12 opted-in testers.
- **Evidence:** Criterion 2 is officially checked (✓) in Google Play Console (`media_1794827104273.png`).
- **Audit Finding:** The closed testing track currently meets the threshold of having at least 12 opted-in testers registered with Google Play.

### 3.2 Date the Qualifying Testing Period Began
- **Console Record:** *"Reviewed today, 12:02 AM"* (November 16, 2026).
- **Mandate:** *"starting from the review date"*.
- **Audit Finding:** The effective qualifying testing period began on **November 16, 2026 at 00:02 GST**.

### 3.3 Whether the Required Continuous Testing Period Has Elapsed
- **Status:** **NO. The period has NOT elapsed.**
- **Elapsed Duration:** Less than 24 hours (Day 1 of 14).
- **Remaining Duration:** 14 full days of continuous active testing required.
- **Earliest Possible Eligibility Date:** **November 30, 2026 at 00:02 GST** (assuming continuous daily engagement from at least 12 testers with zero drop-offs).

### 3.4 Whether Any Tester Opted Out or Lost Eligibility
- **Analysis:** Because Criterion 2 remains ticked green, the active opted-in count has not fallen below 12.
- **Risk Indicator:** If any of the currently opted-in testers opt out or if testing telemetry drops to zero, Google Play will pause or reset the 14-day continuous counter. Furthermore, because 7 of the 14 testers lack in-app user credentials, their device activity telemetry on the backend is currently zero, which poses a severe risk of Google rejecting the next review.

### 3.5 Whether Play Console Confirms Production-Access Eligibility
- **Status:** **STRICTLY NO.**
- **Evidence:**
  - The banner explicitly states: *"Your app requires more testing to access Google Play production"*.
  - The button `Apply for production` is disabled.
  - No production track release can be created or submitted.

---

## 4. Google Play Published Requirements & Tester Engagement Distinction

Google's published developer requirements distinguish between three separate compliance dimensions:
1. **12 Opted-In Testers (Console Criterion 2):** Having at least 12 testers continuously opted into the closed test for 14 days. The Play Console confirms this criterion is **COMPLETE / PASS** (`media_1794827104273.png`).
2. **14 Continuous Days (Console Criterion 3):** Maintaining 12+ opted-in testers continuously for 14 days following the review reset date. This is **IN PROGRESS (Day 1 of 14)**.
3. **Sufficient Tester Engagement:** Demonstrating active usage and feedback during that period. Google's official guidance warns that insufficient tester engagement can lead to a requirement for additional testing.
4. **Test Credentials for Authentication:** Providing working test credentials if the app requires sign-in, allowing Google reviewers to evaluate features.

> **CRITICAL EVIDENTIARY DISTINCTION:**  
> Google does not state that all 12 testers must have Firebase Authentication records. The 7 missing in-app accounts are a genuine problem for comprehensive five-role UAT and authentic tester engagement, but they do **not**, by themselves, invalidate the Google Play Console's 12-tester opt-in criterion. Both dimensions must be tracked separately:
> - **12 Opted-in Testers:** Console criterion complete (PASS)
> - **14 Continuous Days:** In progress (BLOCKED)
> - **Five In-App Profiles Tested:** Reported PASS (Read-Only)
> - **Seven Missing Firebase Accounts:** Internal UAT Blocker
> - **Sufficient Tester Engagement:** Not independently established

---

## 5. Formal Closed-Testing Period Verdict

| Evaluation Item | Status | Evidentiary Basis |
|---|---|---|
| Qualifying Opted-in Testers (≥ 12) | **PASS** | Criterion 2 is checked green in Play Console. |
| 14-Day Continuous Testing Period | **BLOCKED (In Progress)** | Criterion 3 is unchecked; reset on Nov 16, 2026. |
| Production Access Button | **BLOCKED (Disabled)** | Play Console UI renders button inactive. |
| **OVERALL CLOSED-TESTING GATE** | **HOLD / NOT ELIGIBLE** | Must complete 14 continuous days through November 30, 2026. |
