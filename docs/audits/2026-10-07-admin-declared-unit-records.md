# Admin declared-unit record repair — 7 October 2026

Review base: main `f0eca63a449de42a29cd4a68e43c39f41755682d`.
Original PR #1602 head: `33136e72c685d4189d4efd47c93c651b82832afa`.
User authorized source stability repairs; hard clearance, deployment and live data mutations remain paused.

## Defect and scope

Onboarding activation writes a declared count and ACTIVE property state, but does not create selectable `units` records. The only existing creation path is the separate Owner generation wizard. The reported legacy villa shape is reproduced using emulator fixtures, not a new production read. No production property or tenant is modified in this review.

| Surface | Before | Repair and evidence |
| --- | --- | --- |
| Property activation | Count can exist without unit records | New activation trigger transactionally creates the declared sequential records, owner bindings, property marker and audit |
| Admin `/admin/units` | Empty records offer no repair | MFA-protected, App Check-enforced, audited backfill for active properties with no units |
| Query failure / selection change | Failed reads can look empty; prior selection can remain visible | Successful query bound to selected property is required before the repair button appears; failures are visible |
| Repeated / concurrent calls | New operation absent | Transaction produces one complete set and one audit; repeat returns no changes |
| Existing units | May represent actual names / tenant occupancy | Always retained; even a partial existing set blocks automatic generation |
| Conflicting states / malformed count / missing Owner | Original PR accepted fractions and absent Owner | Refuses conflicting activation states, fractions, invalid primary declarations and absent ownership |
| Sanitised legacy IDs | Can collide with another property's records | Reads all candidate IDs before writes; collision refuses entire operation and preserves tenant binding |

## Implementation decisions

The server accepts explicit ACTIVE property flags, with no contradictory status/activationStatus. It does not activate a property, approve payment, or unlock an Owner. Existing activation authority and security rules are unchanged. The limit is 200 integer units; the transaction creates at most 202 documents. Trigger retries are enabled for transient failures, with idempotent replay. All generated IDs are preserved in the audit, including the 200-unit boundary.

Numbers 1..N are provisional sequence identifiers, not verified physical labels. Floors, rent and tenants are not invented. New EN/AR guidance tells Admins to review actual numbers before linking tenants. If any units already exist, no records are added or overwritten: partial inventories, alternate numbering and declarations over 200 require separate reviewed remediation.

The callable checks an Admin/Operations role, suspended token, and the existing live-user privileged MFA session policy. App Check remains enforced. Invalid identifiers are rejected rather than truncated. Emulator `.run` tests exercise handler guards and transactions; they do not prove hosted App Check or a live MFA login.

## Validation snapshot at publication

- Four original regression cases failed on compiled main: the activation/backfill operations did not exist. This is proof of missing source capability, not production execution.
- Eight focused callable cases passed against the repaired Functions: exact count and Owner binding, Owner wizard compatibility, existing/no-count/over-limit no-ops, legacy-shape backfill, roles/MFA/inactive/missing refusal, malformed/conflicting/unbound refusal, cross-property collision preservation, concurrent 200-unit cap with one complete audit, suspended/invalid identifier refusal (some cases grouped in one test).
- Node 22 Functions build, root typecheck and lint passed.
- Launch honesty: 2,041 passes, zero failures, two pre-existing skips; five lifecycle tests passed.
- Full mandatory builds, rules/callable suites and exact-head CI were running at this snapshot. Their final results, reviewed head, Actions links and merge binding will be retained in PR #1602 and tracker #1691.

Commands: `npm run build:functions`, `npm run test:launch-honesty`, `npm run typecheck`, `npm run lint`, `npm run test:repo-hygiene`, `npm run build:shared`, `npm run build`, `npm run build:admin`, `npm run test:rules`, `npm run test:stability`, `npm run test:mobile-store-readiness`. Focused emulator command: Firebase Auth/Firestore/Storage on `demo-bin-callables`, Node test `test/emulator-callables/property-declared-unit-records.test.cjs` with concurrency 1. Java 21 is used by the Firebase emulator. The existing local-only dependency proxy fix keeps emulator loopback requests local; no permission or assertion is weakened.

## Remaining evidence

Authenticated Admin EN/AR/mobile interaction, hosted trigger delivery/retry, real physical unit naming, and production backfill outcomes have not been tested. No backfill or deployment was run. Inspection-first lifecycle PR #1622 remains a separate review. This report does not mark the Admin profile complete.
