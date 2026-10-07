# Inspection-first Owner lifecycle repair — follow-up to #1622

## Scope and authority

Rashid authorized source stabilization, profile-by-profile repairs and individually reviewed PR integration on 7 October 2026. The previous blanket source-merge hold in #1622 is superseded by that instruction. Hard clearance, pilot reset, deployment and authenticated production mutations remain paused.

Review started from main `5595d58dd6c8bf43f2e02c197e1398fcfb5c8cfe` and the original #1622 head `8717a172ca16fa4ca03050cc7d8bbf039019feab`. During review, main independently advanced to `77b8759b60ed647d5c13959f08017921325f0c3e` through dispatch PR #1582. That dispatch tree was preserved. After the session resumed, main independently advanced through #1692, #1693, #1694, #1698 and #1704 to `9d1dcb75fe5505430370684d3091f2448000178b`. Their fifteen paths do not overlap the repair; the final source includes them intact. Final published head, Actions URLs and merge proof are recorded in the PR conversation, avoiding a self-referencing commit hash in this file.

Original #1622 was closed unmerged on 7 October during stale-branch cleanup; #1695 explicitly requires a fresh focused repair if the gap remains. This implementation is published on a new current-main branch, retaining #1622 and its original description as historical proof. Closure did not resolve the baseline defects: subsequent main changes did not touch those backend paths.

This is an Owner/Admin source repair. It does not mark either full profile checklist complete.

## Baseline failures reproduced

The isolated baseline worktree compiled its own Functions at main `5595d58`. Generated rules were prepared before the definitive baseline run. Seven real callable cases from the original F5 suite ran without the five pure helper cases, since that helper did not yet exist. No new helper was used to simulate baseline callable enforcement. Six failed and the existing final-signature approval refusal passed.

| Case | Baseline actual result | Required repaired behavior | Severity |
| --- | --- | --- | --- |
| Link visits | No lifecycle state recorded | Record SITE_VISITS_SCHEDULED atomically | Medium |
| Relink ACTIVE application | Callable succeeded and could reset financial records | Refuse and retain completed activation | High |
| Record visit evidence on ACTIVE | Callable succeeded | Refuse without replacing completed inspection | High |
| Evidence before visit scheduling | Callable succeeded | Require scheduled visits | High |
| Unknown recorded state | Callable succeeded | Reject unknown state rather than derive a default | High |
| Reject payment before evidence exists | Callable succeeded | Refuse premature financial rejection | High |

Two further real Owner-receipt cases ran against the same compiled baseline, using the added D5 cases with a test-name filter: both failed. First submission on the pre-created canonical payment row threw `already-exists` for different policy/method/amount evidence. Replacement of rejected Admin evidence left `paymentEvidenceRecordedBy = finance_d5_a`, contrary to the new receipt's Owner provenance. Neither failure depended on an absent lifecycle helper.

Representative definitive baseline output:

```text
happy path: link records SITE_VISITS_SCHEDULED...
  actual: undefined; expected: SITE_VISITS_SCHEDULED
re-linking an ACTIVE application is rejected...
  Expected HttpsError failed-precondition, but the call succeeded.
visit evidence cannot overwrite ... ACTIVE...
  Expected HttpsError failed-precondition, but the call succeeded.
visit evidence cannot skip scheduling...
  Expected HttpsError failed-precondition, but the call succeeded.
an unknown recorded lifecycle state is rejected...
  Expected HttpsError failed-precondition, but the call succeeded.
payment rejection is refused before any 15% evidence exists...
  Expected HttpsError failed-precondition, but the call succeeded.
F5 baseline: tests 7, pass 1, fail 6
Owner-receipt baseline: tests 2, pass 0, fail 2
```

## Resulting behavior and source locations

| Surface/control | Source | Repair and proof |
| --- | --- | --- |
| Owner application submission/resubmission | canonicalOwnerSubmission.ts, inspectionFirstOwnerOnboarding.ts, ownerPropertyResubmission.ts | Listed Owner transitions, identity/ownership gates retained; financial and intake records read before transaction writes |
| Owner account binding | ownerOnboarding.ts | Fresh transactional role/application checks; active and submitted applications cannot reset profile flags; rejected binding does not change Auth claims |
| Admin visit creation/linking | ownerInspectionAdminLink.ts | Fresh intake check for creation; batch update-time precondition for linking prevents stale reset of contract/payment |
| Admin visit evidence and quote completion | ownerInspectionCompletion.ts, inspectionFirstOwnerOnboarding.ts | Stage legality and intake precondition, preserving pricing, geography and three contract modes |
| Owner final signature/PDF | adminOwnerOperations.ts | Final quote must precede signature; OTP, signing lease and immutable unpaid invoice retained; early-stage refusal does not consume OTP or upload PDF |
| Owner receipt submission | contractActivation.ts | Supports first receipt on both canonical ready rows, including the actual final-signature row; fresh intake, signature, Owner, quote, amount and policy checks; pending evidence only |
| Receipt replacement/history | contractActivation.ts | New Owner receipt replaces the proof map and stale Admin recorder/receipt aliases; unique audit entries retain receipt hash/generation; earlier stored receipt and Admin audit remain |
| Admin receipt recording | inspectionFirstOwnerOnboarding.ts | Retains #1621 transactional upload protection and recorder binding; fresh intake joins payment/contract update-time checks; changed/rejected intake aborts without resetting payment |
| Finance approval/rejection | paymentTransactionApproval.ts | Dual control retained; lifecycle precheck before unpaid invoice repair and fresh assertion inside decision transaction; activation is Finance-only |
| Legacy transition aliases | backend and frontend canonicalStateMachines.ts/onboardingStateMachine.ts | Unknown transition inputs cannot normalize to draft; final-signature-pending cannot jump to approved |
| Undeployed legacy completion helper | inspectionFirstOwnerOnboarding.ts | Authenticated fail-closed retirement; canonical completion still uses protected exported callables |

The new lifecycle accepts exact recorded states. ACTIVE and REJECTED are terminal. Explicit null/empty/unknown recorded states, missing intakes with financial records and stale state conflicting with legacy activation fail closed. Legacy Admin quote approval alone is not payment activation. Legacy Owner pending evidence derives a review state only with inspection, signature and Owner/payment-scoped receipt bindings. An Owner may submit evidence, but cannot approve, reject or activate a payment.

## Regression coverage

- F5 lifecycle suite: listed/illegal actors and states; normal link/evidence flow; terminal and unknown-state refusals; scheduling order; premature payment rejection; stale activation conflict; account binding refusals and fresh-read races; batch intake update-time race.
- D5 suite: original recorder/reviewer separation, refusal audit and distinct Finance positive path retained; payment and intake changes during upload refuse; actual signed-row Owner submission reaches Finance activation; Owner cannot invoke Finance approval; replay never reopens ACTIVE; rejected receipt provenance replacement retains prior stored proof; cross-owner and changed-signature refusals; unknown lifecycle refuses before invoice repair; legacy bound Owner evidence reaches review.
- N31 suite: actual final signature, OTP consumption, generated contract/invoice bytes, SHA-256 and Storage generation; unpaid 15% invoice amount; idempotent replay; forbidden early signature leaves OTP and PDF untouched.
- All three inspection completion contract modes assert FINAL_QUOTE_AWAITING_OWNER_SIGNATURE.

## Validation

Final local results are appended below after all required checks finish. All commands use Node 22; emulators use Java 21.

```bash
npm run test:repo-hygiene
npm run typecheck
npm run lint
npm run build:shared
npm run build
npm run build:admin
npm run test:mobile-store-readiness
npm run test:rules
npm run test:launch-honesty
npm run test:stability
```

`test:rules` compiles Functions, then runs rules and all callable suites. Rules preparation and tests reading checked-in rules must run sequentially: an earlier overlapping local run observed an intermediate transform and failed a payroll catch-all verifier. It was not used as a passing result, and its generated changes were discarded. The definitive run uses sequential preparation, rules, launch and stability checks.

The local firebase-tools dependency's explicit HTTP proxy was corrected only for emulator loopback URLs; external requests still use the configured proxy. This dependency-only change is not committed and does not relax application checks.

## Evidence limits and remaining acceptance

Callable tests invoke handler `.run` against demo Auth/Firestore/Storage emulators. They prove handler behavior and persisted records, not hosted App Check transport or a physical MFA login. Positive PDF tests stub only URL signing because emulator Storage has no IAM signing service; stored bytes, hash, generation and financial guards remain real.

No production receipt, payment decision, unit backfill, deployment, pilot or hard-clearance workflow was run. Authenticated EN/AR/RTL Owner/Admin journeys, device/offline behavior, live email delivery and protected production evidence remain open. The existing verified-Auth-only Owner bootstrap callable keeps its prior `enforceAppCheck: false` policy; protected Admin, Finance and receipt operations retain App Check and privileged MFA where applicable.

### Definitive local result

All mandatory source checks passed on the combined main-plus-repair source. Rules: **184/184**. Final freshly compiled callable run after receipt-history audit changes: **280/280**. Launch: **2,041 pass, zero fail, two pre-existing skips**, plus **6/6 lifecycle tests**. Repository hygiene, root typecheck/lint, shared/main/Admin/Functions builds, stability and mobile-store-readiness passed. The Admin build retained existing warnings; no new build error occurred.

The suite includes the independently merged dispatch tests from current main. No generated Admin asset manifest or rules mutation belongs to this PR. Final exact-head GitHub CI must pass before merge; local results alone are insufficient.

### Latest-main integration verification

After main advanced to `9d1dcb75fe5505430370684d3091f2448000178b`, all fifteen newer main paths were incorporated intact. All twenty authored source/test blobs exactly match the previously compiled/tested repair tree `aeffe6fd2a9d29a2b63440ebd1ccd08c70268808`; this comparison excludes the evolving audit report. Therefore the recorded 184-rule and 280-callable proof applies to the unchanged backend and tests. Fresh latest-main Node 22 checks passed: hygiene, typecheck, lint, shared/main/Admin/Functions builds, stability and mobile readiness. Fresh launch totals: **2,049 pass, zero fail, two existing skips**, plus **6/6 lifecycle tests**. Fresh exact-head hosted CI will rerun rules and callables before merge.
