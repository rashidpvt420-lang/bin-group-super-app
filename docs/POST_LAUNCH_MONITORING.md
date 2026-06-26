# BIN GROUP Super App — 48–72 Hour Public Launch Monitoring Runbook

**Launch baseline date:** 2026-06-24 Asia/Dubai  
**Production project:** `bin-group-57c60`  
**Unified portal:** https://bin-group-57c60.web.app  
**Primary domain:** https://bin-groups.com  
**Admin portal:** https://bin-group-admin-panel.web.app  
**Status at creation:** Public launch reported complete; live roots spot-checked as reachable; Firebase Rules API had a reported transient `503` during active rule writes and must stay under watch.

---

## 1. Monitoring Objective

For the first 48–72 hours after public launch, the objective is not feature expansion. The objective is production stability:

1. Confirm all public and authenticated entry points remain reachable.
2. Confirm Firebase Auth, Firestore, Storage, Functions, Hosting, and Rules remain stable.
3. Confirm no cross-role access leakage exists across Owner, Tenant, Technician, Broker, and Admin portals.
4. Confirm onboarding, login, contract, payment/deposit, ticket, evidence, notification, verifier, and admin approval paths do not silently fail.
5. Catch real-user issues before they become reputation or compliance damage.

---

## 2. Public URL Watch List

Check these URLs at least 3 times daily during the first 72 hours: morning, afternoon, and evening UAE time.

| Area | URL | Expected Result | Severity If Failing |
|---|---|---|---|
| Primary marketing domain | https://bin-groups.com | Public landing/fallback shell loads | P0 if down |
| Unified Firebase portal | https://bin-group-57c60.web.app | Main SPA shell loads | P0 if down |
| Login route | `/login` on primary/unified portal | Login form renders; no console error | P0 |
| Owner onboarding | `/onboarding` | Multi-step owner onboarding renders | P0 |
| Invoice verification | `/verify` | Public invoice verification screen renders | P1 |
| Certificate verification | `/verify-cert` | Public certificate verification screen renders | P1 |
| Admin portal | https://bin-group-admin-panel.web.app | Admin auth shell loads; no public bypass | P0 |
| Support/contact | `/support`, `/contact` | Public support path works | P2 |

---

## 3. P0 Incident Rules

Treat any of the following as **P0 — immediate rollback or hotfix required**:

- Public site unavailable or returning hosting misconfiguration.
- `/login` unavailable or stuck before rendering credentials/SSO UI.
- Admin portal allows unauthenticated dashboard access.
- Owner, Tenant, Technician, Broker, or Admin can read another role's private data.
- Firestore/Storage rules reject valid production users or allow unauthorized users.
- Contract/payment activation unlocks the wrong dashboard or wrong user account.
- Uploaded documents/evidence are publicly readable without authorization.
- Firebase Functions crash on ticket creation, contract activation, SLA evaluation, or notification dispatch.
- Production deploy succeeds but serves stale or wrong build artifacts.

---

## 4. Firebase Rules API 503 Watch Item

A transient Firebase Rules API `503` during active rule writes was reported during launch. This is not automatically a blocker if production rules are active, but it requires explicit follow-up.

### Required checks

Run locally from the project root:

```bash
firebase projects:list
firebase use bin-group-57c60
firebase deploy --project bin-group-57c60 --only firestore:rules,storage --dry-run
npm run test:stability
```

Then verify in Firebase Console:

- Firestore Rules show the expected latest ruleset.
- Storage Rules show the expected latest ruleset.
- Rules Playground confirms authorized/unauthorized behavior for Owner, Tenant, Technician, Broker, and Admin test accounts.
- No Rules API `503`, `429`, or permission errors appear in the Firebase activity/audit logs after launch.

### Acceptance condition

Mark this item complete only when:

- Rules dry-run succeeds.
- Stability tests pass.
- Firebase Console shows the intended rules as active.
- No repeated Rules API errors appear over the next 24 hours.

---

## 5. Live Smoke Test Script

Use this browser script manually in Chrome/Edge with DevTools console open.

### Public shell

1. Open https://bin-groups.com.
2. Confirm landing/fallback content loads.
3. Confirm no red console errors.
4. Confirm Owners, Tenants, Technicians, Brokers, Security, Support, and Contact links route correctly.

### Unified portal

1. Open https://bin-group-57c60.web.app.
2. Navigate to `/login`.
3. Confirm email, password, and Google SSO controls render.
4. Navigate to `/onboarding`.
5. Confirm property intake flow loads.
6. Navigate to `/verify` and `/verify-cert`.
7. Confirm public verification screens load without authentication.

### Admin portal

1. Open https://bin-group-admin-panel.web.app.
2. Confirm admin auth/loading shell renders.
3. Confirm direct dashboard URLs do not expose data before authentication.
4. Log in with the approved admin test account only.
5. Confirm Admin Dashboard loads Firestore-backed data.
6. Confirm no unauthorized role can access Admin pages.

---

## 6. Five-Role Production Smoke Test

Use dedicated test accounts. Do not use real customer records for destructive checks.

| Role | Minimum Checks |
|---|---|
| Owner | Login, dashboard unlock, property list, contract/deposit status, invoices, reports, onboarding continuation |
| Tenant | Login, submit ticket, upload photo, view ticket status, approve/dispute completion, language switch |
| Technician | Login, view assigned job, accept job, mark on-site, upload before/after evidence, resolve job |
| Broker | Login, submit lead/offer, view commission state, withdrawal path remains protected |
| Admin | Login, view dashboards, triage queue, re-dispatch, audit log, user/role controls, verifier tools |

Acceptance condition: all five roles complete their smoke path without console errors, unauthorized reads, blank dashboards, or wrong redirects.

---

## 7. Production Logs To Check

Check these during the first 72 hours:

```bash
firebase functions:log --project bin-group-57c60 --only onTicketCreated
firebase functions:log --project bin-group-57c60 --only onContractActivated
firebase functions:log --project bin-group-57c60 --only onTicketEscalation
firebase functions:log --project bin-group-57c60 --only evaluateSLACron
```

Watch for:

- Permission denied errors.
- Missing index errors.
- Undefined Firebase config or missing secret errors.
- Payment webhook failures.
- Notification provider failures.
- SLA cron timeout or schedule failures.
- Unhandled promise rejections.

---

## 8. Firestore / Storage Data Integrity Checks

Confirm the following collections and paths are receiving correct live data:

- `users`
- `properties`
- `contracts`
- `tickets`
- `invoices`
- `notifications`
- `disputes`
- `auditLog` or equivalent audit collection
- Evidence upload paths for ticket before/after photos
- Owner document paths
- Tenant document paths
- Broker documents/commission records

Every production write must include:

- Correct owner/user/role binding.
- Server timestamp where required.
- Audit trace for sensitive actions.
- No client-trusted role elevation.
- No orphan contract or invoice records.

---

## 9. Arabic / RTL Regression Pass

Check the following in Arabic mode:

- Public landing.
- Login.
- Owner onboarding.
- Owner dashboard.
- Tenant dashboard.
- Technician dashboard.
- Broker dashboard.
- Admin dashboard.
- Invoices and public verification pages.
- Error messages, empty states, buttons, modals, form labels, navigation, status chips.

Acceptance condition: no English-only operational text on critical flows and no broken RTL layout on mobile width.

---

## 10. Payment / Contract Activation Watch

Until real payment rails are fully proven in production, monitor every payment/contract activation manually.

Check:

- 15% mobilization deposit logic.
- Monthly/quarterly/annual payment plan selection.
- Contract status progression.
- Dashboard unlock after payment.
- Invoice hash generation.
- Public invoice verification.
- Admin payment approval override path.
- No dashboard unlock before valid payment/admin approval.

---

## 11. Launch Evidence Register

Attach or store the following evidence after each smoke run:

- Landing page screenshot.
- Login page screenshot.
- Onboarding page screenshot.
- Admin auth screenshot.
- Five-role test account results.
- Firebase rules dry-run result.
- `npm run typecheck` result.
- `npm run build` result.
- `npm run build:admin` result.
- `npm run test:stability` result.
- Function logs showing no fatal errors.

Suggested location:

```text
docs/launch-evidence/YYYY-MM-DD/
```

---

## 12. Daily Sign-Off Template

Copy this section for each of the first 3 launch days.

```markdown
## Launch Day Monitoring Sign-Off — YYYY-MM-DD

Time window checked: Morning / Afternoon / Evening UAE
Checked by:

### Public URL Status
- Primary domain:
- Unified portal:
- Admin portal:
- Login:
- Onboarding:
- Verify:
- Verify-cert:

### Firebase Status
- Auth:
- Firestore:
- Storage:
- Functions:
- Hosting:
- Rules:
- Indexes:

### Five-Role Smoke Result
- Owner:
- Tenant:
- Technician:
- Broker:
- Admin:

### Issues Found
- P0:
- P1:
- P2:

### Fixes Applied
-

### Final Sign-Off
Status: GREEN / YELLOW / RED
Reason:
Next action:
```

---

## 13. Current Status

At the time this runbook was created:

- Public launch was reported complete.
- Unified portal production root was reachable.
- Primary domain root was reachable and showed public/SEO fallback content.
- Admin portal root was reachable and showed admin authentication shell.
- The Firebase Rules API `503` item remains a short-term monitoring item until a fresh rules dry-run and 24-hour error-free observation window are confirmed.

**Operational instruction:** freeze non-critical feature changes during the first 48–72 hours. Only production stability, security, payment/contract activation, role isolation, and launch evidence fixes should be merged during this window.
