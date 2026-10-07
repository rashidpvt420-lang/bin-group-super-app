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
