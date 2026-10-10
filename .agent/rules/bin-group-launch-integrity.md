# BIN GROUP — Antigravity repository operating rules

These instructions apply to the BIN GROUP HOME OS monorepo whenever Antigravity opens this workspace. Read `AGENTS.md`, `TESTING.md`, `docs/RELEASE_BLOCKERS.md`, `docs/FULL_FIVE_PROFILE_AUDIT.md`, `docs/PROPERTY_ONBOARDING_AUDIT.md`, and `OPERATIONS_ONLY_CHECKLIST.md` before changing code.

## First: synchronize safely

1. Verify `git remote -v` points to `rashidpvt420-lang/bin-group-super-app`. Run `git status --short --branch` and `git fetch --prune origin`.
2. If local changes or unpushed commits exist, preserve them on a separate branch or patch after inspecting for secrets. Never reset, clean, stash-and-drop, overwrite or force-push user work.
3. Resolve the exact current `origin/main` SHA; use that as the audit baseline, not a historical SHA in a document. If the workspace is clean, switch to `main` and fast-forward only (`git pull --ff-only origin main`). Otherwise create a clean audit worktree from `origin/main`, preserving the current checkout.
4. Check current deployment workflows, PRs, incident status and production SHA before editing. An active production run is not proof of success and must not be interrupted by unrelated changes. Refresh before every merge.
5. Never paste or persist service account keys, passwords, TOTP seeds, App Check debug tokens or other secrets in repository, chat, logs or screenshots.

## Scope and proof

Audit routes, screens, forms, buttons, role access, loading/empty/error/success states, Arabic/RTL/mobile and authenticated end-to-end journeys for Owner, Admin (dedicated panel versus read-only main-app bridge), Technician, Tenant and Broker. Include marketing/public site, Firebase Auth/MFA/App Check, Firestore/Storage rules, Functions server authorization, Maps/live GPS, payment evidence, inspections, property/contract/quote/pricing state machines, documents/PDF, notifications, HR, broker KYC/commission, and AI Design Studio. Verify Maintenance-only, Property-Management-only and combined pricing/contract isolation using backend-calculated values.

Run the exact existing commands in `TESTING.md` (Node 22); validate root and Admin builds, Functions, rules emulators, TypeScript, ESLint, launch honesty, mobile readiness, protected E2E and five-role workflows. Use real hosted evidence only via approved protected workflows and controlled E2E identities. Record concrete file/line, failing step, repro steps, expected/actual output, severity and test evidence for each finding. Do not claim that every screen/button has been tested without a route/control inventory with explicit coverage.

Keep security server-authoritative: no client self-approval or self-activation, payment or MFA bypass, fabricated GPS/photo evidence, skipped live tests, fake audit artifacts, or test-only production loopholes. Genuine device GPS evidence must remain genuine; Playwright's browser-location simulation is only allowed for clearly designated automated E2E validation and may not count as physical-device proof.

## Launch gates are never optional

Current source-of-truth Phase 1 policy is AED Cash/Cheque only; Bank Transfer, Card and Stripe stay disabled unless separately authorized and documented. Do not extrapolate readiness from stale historical docs. Preserve frozen pilot evidence; DO NOT restart the completed 24-hour pilot or change its frozen SHA by default. Check the approved evidence chain before claiming it reusable.

`HARD PUBLIC LAUNCH = NO-GO` until current exact-main SHA / deployed SHA / digest and same-run metadata, secured operational five-role evidence, production App Check, MFA, payment, SMTP, GPS/physical-device evidence, incident/rollback/monitoring, hard-clearance and signed final decision are independently verified. Do not toggle the public launch gate, dispatch public production or write `hardLaunchClaim=true` on your own.

## Fix and synchronization workflow

- Take one bounded, reproducible blocker at a time, P0/P1 first. Prefer small PRs; avoid unrelated feature additions.
- Keep code and tests aligned; rerun affected gates and required CI. Do not suppress/redesign a test just to make it green or hide production errors.
- Create a feature branch and PR with changed-file inventory, root cause, exact SHA, test proof, rollback notes and residual risks. Do not push unfinished work directly to protected `main`.
- Wait for required reviews, signed commits and branch protection. Never bypass these controls. Merge only with owner authorization and valid exact-head checks.
- After approved merges, fetch and fast-forward the Antigravity workspace to the resulting `origin/main` SHA. Record both SHAs and whether there are unpushed local changes. Re-run impacted tests.
- Do not overwrite a running production deployment. Use only the authorized protected Firebase workflow and preserve evidence. A green dispatcher alone is NOT a green deployment.

## Deliverable

Maintain `docs/ANTIGRAVITY_LAUNCH_AUDIT_HANDOFF.md` as a versioned plan and evidence index (no secrets), distinguishing VERIFIED / FAILING / PENDING / NOT RUN, with live run links and exact SHA. Report the remaining P0/P1 blockers and the smallest next action. Mark public launch ready ONLY on signed authoritative evidence, not a local assertion.
