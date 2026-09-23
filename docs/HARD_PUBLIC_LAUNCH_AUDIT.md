# BIN GROUP hard public launch audit

**State: NO-GO.** This is an in-progress, source-level audit of PR #1343 and the frozen pilot release. No changes in this branch have been deployed or exercised with authenticated production identities. Passing a source check is not a live or device pass.

| Binding | Recorded value | Evidence |
| --- | --- | --- |
| Source baseline `main` | `045338098eb637b298cbdf28ace68a233c68be1b` | Repository checkout at start of repair. |
| Frozen production/pilot release | `7667ff54f9c43e07f78b3710578cd132b1bc7963` | Existing protected production deployment run 35520810688; completed 24-hour pilot is retained. Revalidate in exact-SHA verifier; do not restart solely because this PR exists. |
| Candidate PR | [#1343](https://github.com/rashidpvt420-lang/bin-group-super-app/pull/1343), repaired source tree `5a5faa5444593a407900a4cd8688f40a992ab203`, published as `eedfb20138ea02b9ed967a5c597c1a28626029a1` before this audit note | Initial PR Validation run 35822922892 failed the quote guard on the earlier SHA `640a406dce905cf71845082a34c1607eb31dcd4f`; fetch the current PR head at CI/deploy time, as this document-only follow-up changes the commit SHA. Nothing is deployed. |
| Operational evidence | [#91](https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/35816845463) | Passed on the frozen release; exact control-plane binding still needs verification. |
| Hard clearance | [#699](https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/35818695618) | NO-GO: native physical technician GPS lifecycle proof missing; physical evidence run 35819383981 reported registeredNative=0, physicalBound=0, gpsVerified=0, orderedLifecycle=0. |

## Defects and corrections in candidate

| Severity | Finding and root cause | Candidate correction | Current proof |
| --- | --- | --- | --- |
| P1 | Review screen showed expired/restored session, misleading zero recap, incomplete portfolio coordinates and locally labeled service scope. | PR #1343 adds in-page authentication restoration, fresh authenticated quote and explicit preliminary 15% display, Owner location/portfolio editing, current quote and pins before signature. | Source/typecheck/main build passed before additional audit edits; **no authenticated live verification**. |
| P1 | PR #1343 failed launch honesty because a source-regex guard recognized only the old disabled expression. The new implementation guarded more states but was not behavior-tested. | `reviewQuoteGate.ts` and runtime condition exercise fresh Owner/portfolio/quote/pins; the regex guard now asserts the stronger runtime gate and new test proves denied states. | Focused 10 tests passed; CI must run again against the updated candidate. |
| P0 | `adminReviewOwnerProperty` allowed DRAFT review and document approval to promote an Owner-submitted coordinate to trusted dispatch geo. It did not distinguish five-page inspection-first submissions. | Candidate branch checks linked intake identity/state; for five-page properties records document approval while keeping `PENDING_PROPERTY_INSPECTION` and submitted geo untrusted; DRAFT removed from reviewable set; `workflowVersion` written to canonical property records. Legacy already-approved geography requires separate migration review. | Focused policy tests passed; emulator and cross-role test pending. |
| P0 | `checkPropertyUniqueness` searches only legacy exact unit/community collections, so canonical property and open submission duplicates can pass, including concurrent calls. | **Unresolved**. Needs atomic server identity reservation and private, minimal response; no customer data altered. | NO-GO. |
| P1 | Privacy and Terms documents disagree on legal entity and support/privacy addresses. | **Unresolved**; approved identity and legal copy must be provided/confirmed before publishing. | NO-GO. |
| P1 | Legacy `adminOwnerOperations.ts` keeps unreachable code that would mint operational property, geo, payment and dashboard states after a fail-closed throw. | **Unresolved**; preserve fail-closed callable but remove/isolate misleading implementation with regression. | NO-GO. |
| P1 | Owner property payload was spread into canonical records before stripping submitted privilege fields. | Server now removes browser supplied status/geo/payment/approval/inspection/activation fields and recreates unverified submitted geo. | Focused regression and Functions build pass; emulator and live denial tests pending. |
| P1 | Admin launch command center memoized gate counts without including its gate predicate in dependencies. | Stable `useCallback` predicate added to the memo dependencies. | Admin rebuild pending; prior build reproduced the React warning. |
| P1 | Root production dependency audit found `nodemailer@9.0.5` with one high severity advisory. | Locked Functions `nodemailer@9.1.1`; no source security gate bypass. | `npm audit --omit=dev` now reports 0 high/critical and 11 moderate; Functions compile passes. |
| P1 | Admin audit initially reported 23 high findings including direct `axios@1.17.0` and transitive `react-scripts@5.0.1` build dependencies (PostCSS, SVGR, CSS tooling). | Axios patched to 1.18.0 and Admin rebuilt. CRA toolchain requires a reviewed migration; never use `npm audit fix --force` to replace `react-scripts` with the suggested `0.0.0`. | Admin audit after Axios: 56 total (10 low, 24 moderate, 22 high). Distinguish build-time tooling from shipped runtime bundle in reachability review; unresolved for public release. |
| P0 | Physical technician/GPS proof is incomplete in the protected hard-clearance chain. | **Unresolved**; use approved physical-device workflow with real authorized installation and test identity. | NO-GO. |

## Verification matrix

| Gate | Result | Scope/limit |
| --- | --- | --- |
| `npm ci --include=optional --legacy-peer-deps` | PASS twice, including after dependency upgrade | Clean install added 1,488 packages; Node 24 local versus declared Node 22 remains a parity limit. |
| `npm run typecheck`, `npm run lint` | PASS after Functions dependency update | Root app scope; standalone Admin has its own build checks. |
| `npm run test:stability`, `npm run test:launch-honesty` | PASS | Stability/rules hardening checks pass; launch suite 1,518 passed, 0 failed, 2 skipped, plus 5/5 state-machine tests. CI on the updated SHA pending. |
| `npm run test:rules` | BLOCKED before emulator tests | Installed Firebase CLI requires JDK 21; this workspace has JDK 17. CI Java 21 emulator run mandatory. Generated hardened `firestore.rules` disallows client edits/deletions to execution evidence and needs this check. |
| `npm run build`, `npm run build:admin`, `npm run build:functions`, `npm run test:mobile-store-readiness` | PASS after memo, Axios and Functions dependency repairs | Main Vite, Admin CRACO, Functions TS and mobile readiness passed. Remaining Admin source-map warning from `stylis-plugin-rtl`. |
| Five role browser and role-to-role tests | Not run on repaired SHA | Test identities/credentials and approved disposable fixture cleanup needed. |
| Production exact-SHA deploy/smoke, English/Arabic/mobile, App Check, MFA, payment/inspection and device proof | NOT PROVEN on repaired SHA | Changes are not on `main` or Hosting. |
| Security status | NO-GO | Existing rules suite and dependency audit pending; do not loosen App Check, claims or write rules. |
| Owner onboarding/Admin review/payment and GPS | Source repairs in progress | Real field lifecycle and signed payment approval unverified on this candidate. |
| Legal/public truth | NO-GO | Contradictory legal copies and live claims need reconciliation. |

The authoritative workflow map and implementation classifications are in [CANONICAL_RUNTIME_CONTRACT.md](CANONICAL_RUNTIME_CONTRACT.md). This file must be updated with the final candidate SHA, CI run links, full local results, deployment artifact digest and exact release binding before reconsidering public clearance. The completed pilot record is preserved; its validity must be decided by the existing protected release contract, not by editing evidence.
