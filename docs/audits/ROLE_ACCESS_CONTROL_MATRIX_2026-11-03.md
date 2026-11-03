# Five-Profile Role and Financial Approval Matrix

**Date:** 3 November 2026  
**Applies to:** BIN GROUP Super App Owner, Tenant, Technician, Broker, and Admin/Finance experiences.  
**Purpose:** Define the intended least-privilege boundary for product journeys and financial decisions. This matrix is a control specification; it does not by itself prove production rules, claims, or deployed code are correct.

## Executive rule

**Only the authenticated Admin/Finance console and its explicitly authorized, MFA-protected server workflows may make financial approval decisions.** Owner, Tenant, Technician, and Broker accounts must never approve payments, receipts, payouts, commissions, refunds, payroll, or financial adjustments. They may submit evidence or request a decision only within their own binding.

The application has separate submission, review, approval, and settlement steps. A UI button is not authorization. Every decision must be enforced by a server callable/transaction and written to an audit trail. Firestore/Storage rules must deny direct client writes that would bypass the canonical workflow.

## Role-by-role matrix

| Capability | Owner | Tenant | Technician / Staff | Broker | Admin / Finance |
|---|---|---|---|---|---|
| Identity and profile | Manage own permitted profile fields; submit protected changes for review | Same, with tenancy-bound fields protected | Own profile and credentials; submit renewal evidence | Own profile/KYC; submit for review | Verify, correct through audited workflows, suspend/revoke as authorized |
| Property and unit data | Own/bound properties and units only | Assigned/current tenancy only | Minimum job-specific property information for assigned work | Only approved listing/lead information | Cross-portfolio access according to staff module and authority |
| Contracts and documents | Own/bound contracts, property passports, invoices and permitted documents | Own lease/tenancy documents and permitted notices | Job evidence and credential records only | Own KYC submission status and permitted broker documents | Review/approve, administer vault and contracts under role/module grants |
| Maintenance | Request, track, approve/reopen/dispute own linked work as allowed | Request, track, approve/reopen/dispute own linked work as allowed | Accept/execute only assigned eligible missions; upload required evidence | No operational mutation unless separately assigned an explicit capability | Authorize, dispatch, supervise and resolve disputes through audited workflows |
| Financial submission | Submit Cash/Cheque proof and view own ledger/status | Submit permitted rent proof and view own ledger/status | Submit expense/parts evidence only when assigned and supported | View own commission status; request payout when eligible | Record/reconcile evidence and review queues according to delegated authority |
| Financial approval | **Never** | **Never** | **Never** | **Never** | **Only authorized Admin/Finance decision-makers**, with verified active account, MFA/App Check where required, evidence validation, dual control and audit trail |
| Commission / payout | No broker payout control | No broker payout control | No broker payout control | Request own eligible payout; cannot approve or mark paid | Validate attribution/eligibility and approve/settle using protected server workflow |
| AI and suggestions | Property context and actions limited to own authority | Tenant context limited to own tenancy | Job context limited to assigned mission | Broker context limited to own leads/listings | Admin-only intelligence only within granted modules; AI must not grant permissions or approve money |
| Other users' private data | No access | No access | No access except minimum assigned-job details | No access | Access only for a defined operational/legal purpose and authorized module; sensitive values masked by default |

## Admin / Finance is not one unlimited permission

- **Full Admin / CEO / Super Admin:** privileged platform administration and final decisions only where the server policy explicitly allows them. MFA, active-account status, App Check, audit logging and dual-control rules remain mandatory.
- **Finance Admin / delegated Finance reviewer:** only explicitly granted finance modules and callable actions. A finance module grant must not automatically grant system settings, user provisioning, launch clearance, HR, unrestricted document access or every payment approval.
- **Operations Admin / Dispatcher / Operations Manager:** dispatch and maintenance operations; no payment approval merely because the role can update a ticket.
- **HR Admin / HR Manager / HR Staff:** staff lifecycle and permitted HR records; payroll/financial approval requires a separate explicit authority, not an HR role alone.
- **Support Admin / Account Manager / Admin Assistant / Manager:** limited support, account, or reporting tasks; no financial approval unless an explicit server-side permission grants it.
- **Finance Manager / Finance Controller:** only the dedicated painting stage-payment review workflow currently designated for these roles, with verified email, MFA, active account, issuer/approver separation, immutable proof checks and server-side audit. This is not global Admin authority and must not grant other payment approval paths.

## Mandatory financial approval controls

1. Enforce authorization in the server callable and again against current trusted account state; never rely only on hidden buttons, route guards, client state, or stale custom claims.
2. Require active, verified accounts and MFA for privileged financial decisions; enforce App Check where the callable contract requires it.
3. Validate the canonical payment ID, payer/owner/tenant binding, exact AED amount, Cash/Cheque method, immutable receipt hash/reference and current workflow state on the server.
4. Use idempotency and transactionally prevent duplicate receipt references, duplicate payouts, replayed decisions, or approval of rejected/changed evidence.
5. Apply four-eyes control where an Admin records evidence: the same person must not both record and approve it.
6. Separate approval from settlement/paid status. A submitted receipt, approved quote, or client-side status is not proof of settlement.
7. Log actor UID, trusted role, target ID, decision, reason, evidence identifiers/hashes and server timestamp. Never log secrets or unmasked bank/passport values.
8. Deny direct browser writes to payment, approval, payout, commission settlement, payroll and contract activation fields in Firestore and Storage.
9. Keep Phase 1 platform payment acceptance limited to AED Cash/Cheque. Stripe/card and bank-transfer checkout remain disabled unless a separate approved change explicitly authorizes them.
10. If authority, evidence, queue completeness, or source-of-truth data is unavailable, fail closed and show a clear pending/error state—not a false zero, success, or all clear.

## Required negative tests

- Owner, Tenant, Technician, and Broker each receive permission-denied when invoking every Admin financial decision callable, even if they forge payload fields or guess IDs.
- Finance/Operations/HR staff without the specific decision permission are denied by the backend even if they can open an Admin route.
- An authorized reviewer with a stale/revoked role, suspended account, disabled Auth record, unverified email, or missing required MFA is denied.
- The evidence recorder cannot approve their own Admin-recorded receipt where dual control applies.
- A duplicate reference/hash, altered amount, wrong payer, wrong property/contract, replayed request, or rejected payment cannot be approved.
- Direct Firestore/Storage client writes cannot set approved, paymentVerified, settled, payoutStatus, dashboardUnlocked, or equivalent privileged fields.
- Each role's guessed-ID reads of another person's properties, leases, tickets, receipts, passport documents, KYC/IBAN and private Storage objects are denied.
- Tests cover both allow and deny cases against the actual emulator/rules/callable test harness; source-text assertions alone are not sufficient.

## Release acceptance

The matrix is accepted only when:
- the role × module × route matrix is tested against real effective claims;
- callable-level allow/deny tests pass for all financial decision handlers;
- Firestore and Storage emulator tests pass;
- stale-claim revocation and account suspension are verified;
- the deployed release SHA and rules/index versions match the tested SHA;
- production five-role smoke tests pass with seeded/authorized test accounts;
- any Android-only GPS, Play Integrity, camera, offline queue and FCM claims are separately tested on a physical Play-distributed build.

This document does not itself authorize a deployment, change the hard-launch decision, restart the completed 24-hour pilot, or authorize an AAB upload.
