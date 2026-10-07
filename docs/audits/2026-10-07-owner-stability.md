# Owner stability repair evidence — 7 October 2026

Tracker: [#1691](https://github.com/rashidpvt420-lang/bin-group-super-app/issues/1691). Repair: [#1690](https://github.com/rashidpvt420-lang/bin-group-super-app/pull/1690).

## Reviewed baseline

- Owner PR head: `d95c7b7ece201b9ee2308f99ee659a27050e393e`.
- Current main incorporated into this repair: `f228d5313a7fbf7f1d48fac00f829b2697b9d516`.
- Before evidence: [PR Validation failure](https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/37567137823/job/112617316714) and [CI failure](https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/37567137750/job/112617330290), each reporting the same nine failed regression assertions.

## Findings and fixes

| Finding | Root cause | Repair and verification |
| --- | --- | --- |
| View Certificates did nothing | Button lacked a click handler | Opens the existing `/owner/documents` route; existing action regression passes. |
| Renewal action did nothing | Retention button lacked a handler | Review Renewals opens the existing `/owner/renewals` route; existing action regression passes. |
| Financial card exposed collection and developer terms | Visible EN/AR copy described implementation details | Copy describes verified property records and keeps the fee/payout distinction; financial computations are unchanged. |
| Owner action tiles were unreadable in the light shell | White text and pale icons on a surface overridden to white | Explicit white tiles, dark body text, readable warning/gold icons and help text. Existing action routes are retained. |
| Four reporting pages retained dark-theme styling | Explicit white text and dark panels conflicted with the light shell | ReportingDashboard, ExecutiveReportingPage, PropertyUnitsPage and MaintenanceCalendarPage use light panels, dark ink, readable status tones and chart labels. PDF colour calls are untouched. |
| Review auth regression asserted obsolete inline code | Failure classification was extracted to `ownerQuoteFailure.ts` | Regression now checks the classifier and its connection to the sign-in decision. Behavioural tests still prove an App Check rejection after successful ID-token refresh is not an expired session. |
| Property page claimed blanket government compliance | Unconditional static text represented every property as compliant | Text asks the Owner to review valid certificates and inspection review; no unverified compliance claim is made. |

These findings are source/test evidence. This repair does not claim authenticated production observation of every screen.

## Local verification

Executed with Node.js 22.23.3 and frozen dependencies:

- `node --test tests/launch/owner-honest-actions.test.mjs tests/launch/owner-review-quote-failure.test.mjs tests/launch/owner-onboarding-live-ui-regressions.test.mjs`: **29 passed, 0 failed**.
- `npm run test:launch-honesty`: **2,032 passed, 0 failed, 2 existing skips** in the primary suite; the additional lifecycle suite: **5 passed, 0 failed**. The skipped assertions are the existing release-control-plane/ordinary-PR deployment-policy cases; no skip was introduced by this repair.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npm run test:repo-hygiene`, `npm run test:stability`, `npm run test:mobile-store-readiness`: passed.
- `npm run build:shared`, `npm run build:functions`: passed.
- `git diff --check`: passed.

Dedicated Admin build and Java-21 emulator validation were still running at publication. Their final outcomes and exact-head protected CI links must be recorded on the PR before merge. An initial emulator attempt stopped at the Java 17 prerequisite without running tests; it is not a rules failure or a pass. A temporary Java 21 runtime was obtained for the subsequent attempt.

## Boundaries and remaining work

- No rules, server authorization, pricing calculations, payment policy or production records changed in this follow-up repair.
- Hard clearance remains paused; the completed pilot is not restarted.
- A green source build is not deployment evidence. Hosted Owner sign-in/onboarding, documents, technician map/fresh GPS/arrival notification, and physical-device journeys still require the corresponding authenticated checks.
- Other Owner issues and older overlapping PRs must be compared with the final merged main before they are marked complete or superseded. Admin, Technician, Tenant and Broker acceptance are tracked separately in #1691.
