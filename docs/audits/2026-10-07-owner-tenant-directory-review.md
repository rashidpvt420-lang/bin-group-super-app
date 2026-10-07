# Owner tenant directory stability review — 7 October 2026

Current corrective base: `47503c1bd4de6918c719975b27e313657b56becf`; previous base: `977252693a0cd08268bd3d8444637fa5f5d2f2ee` (CI #1720 merged); original base `7ceb6aae7867567c8da3e04c73ceb9c00495e08a` (marketing/global-shell #1718 merged). #1719 was superseded without merging; another session merged #1721 before the independent-review hold was resolved. This correction preserves that merged tree.
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

Original reviewed head `9f49992935ad81a08c2ae39842191388d12a2aa4` failed the Play Integrity launch suite with HTTP 403 in the live GitHub release-lock lookup (job 112848837754). That workflow and Current Main Firestore Verification omitted the explicit token used by the other full-suite workflows. The workflow fixes were excluded from the Owner-only head and merged separately in CI #1720, reviewed head `3d4deb66030c2bdbc00b4d24786c80eaa7fa4062`, main `977252693a0cd08268bd3d8444637fa5f5d2f2ee`. All 13 hosted checks completed (11 success, two expected certificate skips), and all eight triggered workflows succeeded. PR Validation executed 39 browser, 184 rules, 280 callable, and 2,078 launch cases with zero failures plus one expected skip and six lifecycle cases. Both affected workflows now pass the workflow token to that step with Actions read permission. The release lock remains fail-closed; no test is skipped or permission widened to write. A parsed-workflow regression covers all five full-suite PR callers. Final head and hosted results are recorded in the PR proof comments.


## Phase 2 Owner follow-up findings

Additional Owner-surface defects were confirmed while this exact-main repair was still open.

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


### Unit registry authority
- The Owner unit registry still mixed canonical `ownerId` queries with legacy `ownerEmail` / `ownerUid` list queries.
- Because those reads were executed together, one policy-denied legacy query could fail the complete page load; an unavailable identity could also leave the loader unresolved.
- Repair: property and unit list authority now uses canonical `ownerId` only. Missing identity and read failures clear stale state, show an explicit error, and end loading.
- Unit creation remains behind the existing `ownerGenerateUnits` callable with the existing saving/double-submit guard.
- Regression: `tests/launch/owner-unit-registry-authority.test.mjs`.


## Independent review of the expanded repair

The first BIN Connect callable implementation incorrectly granted global access from role strings, omitted fresh Admin MFA checks, and wrote audit evidence after committing messages. Executing that implementation produced 7 passes and 58 failures across 65 initial authority cases. It also broke the dedicated Admin inbox once browser writes were denied. The initial hardener could remove an unrelated maintenance permission and failed to save a canonical-block replacement.

The reviewed server derives current authority from Firebase Auth, checks account suspension and current verified Admin MFA, and never elevates a profile role. Participants and creators retain their own conversation access; assignment alone grants no privilege. Thread/message writes and audit evidence share one Firestore transaction. Create/send require actor-bound request IDs with payload binding, so retrying the same request returns its original result while changed payloads cannot reuse that key. Admin metadata updates require current MFA authority and allow self-assignment only. Arbitrary property/unit/ticket context grants no participant access; tenant-targeted handoff remains outstanding.

The dedicated Admin inbox uses the same regional callables, retains drafts and request IDs after failure, and synchronously locks mutations. Shared create/reply paths retain request IDs for safe retries. The hardener replaces the exact BIN Connect block and excludes that collection from the two global Admin write fallback lists, preserves unrelated bytes, rejects ambiguous blocks, and saves its result. New emulator assertions initially produced 183 passes and one failure because the Admin catchall overrode the explicit denial; the reviewed exclusion closes this real bypass. Emulator assertions deny browser thread/message create and thread update for both a participant and an MFA Admin while preserving authorized reads.

Executed proof: 87 actual server handler cases, nine actual Admin handler cases, nine real hardener fixture cases, 18 shared client handler cases, nine actual OwnerProperties hook/render cases and nine Unit Registry handler/render cases pass. Portfolio state is tagged by Owner identity before effects run; superseded and failed enrichment cannot restore rows, snapshot document identity wins over embedded IDs, and revenue/history text is readable on light cards. Unit Registry additionally removes the parent-only query that cannot prove unit ownership, hides old identity state before effects, resets the wizard, validates the selected owned property, and guards same-frame duplicate/stale submissions. Final local launch results: 2,229 passes, zero failures, two operational skips and six lifecycle cases. The corrected rules suite passes all 184 cases. The corrective PR retains final exact-head hosted results before merge.

These deterministic tests and emulators prove source behavior, not real-account, hosted App Check, physical-device or production deployment acceptance. Hard clearance, pilot reset and production writes remain paused.
