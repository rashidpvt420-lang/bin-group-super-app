# Owner tenant directory stability review — 7 October 2026

Base: `7ceb6aae7867567c8da3e04c73ceb9c00495e08a` (marketing/global-shell #1718 merged).
This focused repair carries the outstanding directory intent from #1626 / #1695.

## Observed defects and repair

The former directory exposed enabled CHAT/activity/RERA controls without handlers, claimed all messages were logged for RERA compliance, rendered missing status as ACTIVE, and generated mail links from unchecked records. Its pale text assumed a dark layout. Search could throw on malformed fields and showed the portfolio-empty message for a search with no matches. Listener errors and superseded snapshots could retain or restore stale rows; missing sessions never finished loading.

The directory now uses readable light cards, typed normalized rows, validated single-mailbox links, disabled unavailable email, and truthful missing status/property labels. Property names use the existing shared display-name resolver. Search includes units and distinguishes empty results. English and Arabic labels and RTL are supported. Error recovery reinstalls UID-bound listeners. Identity-tagged state hides previous-owner contacts before effects run; cancelled/superseded callbacks cannot publish rows. Property and tenant listener errors clear contacts and expose a generic retry message.

Removed unsupported audit/certification claims and dead controls. The available BIN Connect inbox has a real route link. Email guidance explicitly says external mail is not recorded in this directory. This is not a tenant-targeted chat implementation.

## Proof and boundaries

Before repair, strengthened guards failed two tests on the unchanged page: unsupported RERA/audit claims and enabled controls without actions. The former regex stopped at nested JSX icons; the replacement parses actual JSX attributes with TypeScript.

After repair, 39 focused cases pass, including six actual-page React/MUI server-render tests, model/mailbox tests and executed listener callback tests. Render tests mock session and initial hook state; listener tests use deterministic snapshots. They do not claim authenticated Firestore or physical-device acceptance.

Local validation uses Node 22. Typecheck, lint, repository hygiene, main build, shared build, Functions build and mobile store readiness passed. Full launch, Admin build and emulator results plus exact hosted-head evidence are recorded on the repair PR before merge.

Remaining: verify real Owner contacts and property mappings with a seeded account; exercise tenant-targeted communication after an authorized participant-bound server handoff is implemented; complete physical-device/profile acceptance. This repair does not certify all Owner pages or the five profiles. No production deployment, pilot reset or hard-clearance action is part of this change.

## CI issue found during review

Original reviewed head `9f49992935ad81a08c2ae39842191388d12a2aa4` failed the Play Integrity launch suite with HTTP 403 in the live GitHub release-lock lookup (job 112848837754). That workflow and Current Main Firestore Verification omitted the explicit token used by the other full-suite workflows. Both now pass the workflow token to that step with Actions read permission. The release lock remains fail-closed; no test is skipped or permission widened to write. A parsed-workflow regression covers all five full-suite PR callers. Final head and hosted results are recorded in the PR proof comments.


## Phase 2 Owner follow-up findings

Two additional Owner-surface defects were confirmed while this exact-main repair was still open.

### Property portfolio
- Missing authenticated UID could leave the page in a permanent loading state.
- Async passport enrichment from an older snapshot could overwrite a newer portfolio snapshot.
- The page still used legacy dark-surface white text inside the current light Owner shell and had no page-level RTL direction.
- Repair: fail closed when identity is unavailable, version async snapshots so stale enrichment is discarded, and align the page with the light RTL-aware Owner shell.
- Regression: `tests/launch/owner-properties-stability.test.mjs`.

### BIN Connect mutation authority
- BIN Connect enumeration was already server-authoritative, but thread creation, replies, and resolution still wrote directly from the browser.
- Repair: `createBinConnectThread`, `sendBinConnectMessage`, and `resolveBinConnectThread` are Auth + App Check callables. The server derives actor identity, validates participant access, writes the thread/message mutation, and emits `audit_logs` evidence.
- Firestore now denies browser create/update for BIN Connect threads and messages; participant reads remain available.
- The rule-hardening script is updated so normalization cannot silently restore browser mutation access.
- Regression: `tests/launch/bin-connect-server-list.test.mjs` now proves the callable boundary, audit writes, client removal of `addDoc/updateDoc/serverTimestamp`, and fail-closed rules.

No hard-clearance workflow, production-release lock, pilot evidence, or launch authorization file is modified by these Owner repairs.
