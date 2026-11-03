# BIN GROUP Five-Profile Re-Audit — 2026-11-03

## Scope and evidence boundary

Repository: `rashidpvt420-lang/bin-group-super-app`  
Audited baseline: `25a1d0df9ddcfe5917dd66a6e7c69690eb4ea5be`  
Environment: Firebase production / public web and dedicated Admin app  
Roles: Owner, Tenant, Technician, Broker, Admin / Finance / Operations

This is a source review combined with the current-commit production E2E results from Firebase Production Deploy run #1265. It is not a claim that every real customer account, Android device, Play Integrity signal, physical GPS reading, or every staff permission combination was manually tested.

## Current-commit production evidence

Run: https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/41660697949

- Production build validation: passed.
- Firebase production stack deploy: passed.
- Post-deploy deployment metadata / same-run binding verification: passed.
- Current-commit five-role business E2E evidence: passed.
- Current-commit live launch audit: failed. One Tenant emergency-route test read the global app shell while it still displayed `Authenticating BIN-Groups Identity...`; two later Tenant tests were skipped because the Tenant audit is serial.
- Controlled-pilot eligibility, signed hard-launch decision, and final deployment metadata artifact steps were skipped after the live audit failure.
- The workflow's business-evidence scripts explicitly record `hardLaunchClaim=false`; this does not by itself disprove a separate existing signed approval, but this run did not mint a new signed hard-launch decision.
- The 24-hour pilot is not restarted by this audit or these changes.

## Role-by-role findings

### Owner

Expected lifecycle: verified identity and property ownership; onboarding and inspections; contract and payment gates; portfolio, tenants and units; maintenance authorisation; completion sign-off; financial records, approvals and documents.

Covered by current production E2E: five-page Owner submission, inspection-backed visits, exact 15% mobilisation, Founder-MFA activation; active contract after visit/payment approval; Phase 1 payment controls.

Findings:
- Owner financial history has cursor pagination up to 10,000 rows, completeness state and export restrictions when incomplete (merged previously in PR #1936).
- Owner financial-truth dashboard invoice source has a 100-record cap and emits an explicit incompleteness warning.
- Owner command-strip counts use 100 approval requests and 150 maintenance tickets. Before this PR, reaching either limit silently understated counts.
- Owner Approval Center uses 50 approval requests and 150 tickets. Before this PR, it could display an empty state without explaining that older records might be outside the query.

This PR makes both capped dashboard sources publish an explicit incompleteness warning, prevents a false “nothing needs you” state when counts are capped, and suppresses a potentially incomplete repair KPI. It also adds cursor-based Load Older pages to the Owner Approval Center for quote requests and ticket sign-offs.

Residual: dashboard command-strip counts remain bounded and are marked incomplete at the cap. A server aggregate or cursor-backed count is still needed for complete portfolio-wide totals.

### Tenant

Expected lifecycle: identity bound to the correct property/unit; lease and payment visibility; maintenance request with photo evidence; status tracking; assigned technician workflow; tenant review/dispute; profile corrections; documents and move-in/out.

Covered by current production E2E: a real tenant photo maintenance request; Tenant → Technician → Tenant approval; Admin dispute review after technician completion; correction request and immutable history; protected unit-link recovery without mutating an occupied unit.

Live launch-audit failure: the emergency-route test navigated to `/tenant/emergency`, but after its fixed 1.5-second wait the page was still displaying the global identity-authentication loader. The assertion then searched the loader text for emergency content. The emergency page itself was not shown to have crashed or rejected the tenant. The following two serial Tenant tests were skipped after this failure.

This PR makes Owner, Tenant and Technician route assertions wait up to 30 seconds for the identity loader to clear before evaluating route content. Broker already had a resolved-shell wait. A persistent loader still fails with a timeout; it is not treated as a pass.

Residual: rerun the live Tenant route audit on the new exact SHA, confirm correction-history and AR/EN tests execute (not skipped), and verify wrong-unit reads/writes are denied against production test identities.

### Technician

Expected lifecycle: eligible and active staff identity; duty and dispatch eligibility; assigned tickets only; fresh and accurate GPS; arrival/geofence proof; before/after evidence; server closeout; offline replay; safety and notification delivery.

Covered by current production E2E: assignment, push-state recording, mission completion with network recovery, denied-location and poor-GPS fail-closed behavior, offline EN_ROUTE replay.

Findings:
- Technician history initially reads the latest 50 completed/closed/disputed tickets and computes KPIs from those rows. It previously labelled the count as total missions without indicating the data window.
- This PR adds cursor-based Load Older pages, recalculates KPIs across loaded pages, and explicitly labels the KPI scope.

Residual: physical Android installation binding, Play Integrity, mocked-location rejection, device GPS/geofence accuracy, physical camera upload, offline replay on device, and real FCM delivery/deep-link verification remain separate device gates.

### Broker

Expected lifecycle: verified broker identity and licence; approved listing/referral access; lead attribution; conversion to a contract; deterministic commission; Finance review; OTP-bound payout; privacy of licence and bank details.

Covered by current production E2E: lead submission, referral conversion, deterministic commission, real mailbox OTP, and single-use payout request.

Findings:
- Commission history and payout request listeners were unbounded, increasing read volume and client memory as a broker's history grows.
- This PR adds stable 50-row cursor pages for commission history and limits the payout-status listener to the latest request. Totals and payout requests are blocked until more pages are loaded.

Residual: validate OTP expiry, incorrect/replayed code, changed commission ID set/amount and pending/rejected/hold cases; test private KYC/bank detail reviewer permissions and document leakage against real role accounts.

### Admin / Finance / Operations

Expected lifecycle: MFA-protected authentication; explicit role/module access; staff provisioning and suspension; operational dispatch; proof/contract/payment control; dual-control finance; HR and audit trails.

Covered by current production E2E: real Founder MFA and protected Admin business workflow; role provisioning; payment review/approval lifecycle; current-commit five-role authentication/business evidence. Phase 1 payment controls remain Cash/Cheque only; Stripe and bank-transfer checkout are not enabled.

Findings:
- Payment approvals were queried in two separate 50-row queues; receipt repairs were capped at 30. Before this PR, the page did not disclose reaching a query limit.
- This PR adds cursor-based Load Older pages to both Finance payment queues and the receipt-repair queue.

Residual: a staff-role × module × route allow/deny matrix using real claims and MFA; test stale claims after role changes/suspension; reconcile live transaction, invoice, receipt-hash and ledger totals.

## Shared security and release requirements

- Root portal routes are role-gated. Dedicated Admin access is module/path-gated and MFA-gated.
- Firestore and Storage rules apply authenticated identity, suspended-account and role/resource checks; privileged state changes use callable/server paths with role and evidence checks.
- Source inspection cannot replace production denial tests for every data collection, callable, storage path and user-role pairing.
- Do not activate online card/bank-transfer checkout; retain Phase 1 AED Cash/Cheque.
- A production Firebase deployment does not publish an Android AAB.
- No AAB was attached to run #1265 and no release asset was present. Produce the signed AAB only from the final merged/approved SHA; verify package `ae.bingroups.superapp`, versionCode/versionName, signing certificate, Play App Signing and build provenance before upload.

## Changes proposed in this re-audit PR

1. Make Owner dashboard count limits explicit and prevent false “all clear” / complete KPI readings when the source query reached its cap.
2. Add cursor pagination to Owner Approval Center quote requests and ticket sign-offs.
3. Add cursor pagination to Finance pending payments, paid-awaiting-approval payments and receipt repairs.
4. Add cursor pagination to Technician history and recalculate KPIs across loaded pages.
5. Add cursor pagination to Broker commissions and limit payout status to the latest request; block payout requests while a partial history remains.
6. Make Owner, Tenant and Technician launch assertions wait for identity resolution; Broker already had this guard.
7. Add regression tests for pagination, query caps and authentication loading state.

## Release decision

This PR must pass the repository's protected CI checks and be reviewed before merge. A new production workflow must then run on the post-merge exact SHA. Do not treat run #1265 as a completed launch clearance because its live launch audit failed and the signed decision step was skipped. Do not restart the completed 24-hour pilot.
