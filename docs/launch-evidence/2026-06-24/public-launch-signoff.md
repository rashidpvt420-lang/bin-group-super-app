# Public Launch Monitoring Sign-Off — 2026-06-24

**Project:** BIN GROUP Super App  
**Firebase project:** `bin-group-57c60`  
**Timezone:** Asia/Dubai  
**Monitoring window:** Initial post-launch public spot check + route closure fixes  
**Created by:** ChatGPT based on public URL verification, user-provided launch report, and GitHub code updates

---

## 1. Public URL Status

| Check | Status | Evidence / Notes |
|---|---:|---|
| Primary domain root — https://bin-groups.com | GREEN | Public/SEO fallback shell returned content for BIN-GROUPS and UAE Property Operations. |
| Unified Firebase portal root — https://bin-group-57c60.web.app | GREEN | SPA loading shell returned BIN GROUP HOME OS text. |
| Admin portal root — https://bin-group-admin-panel.web.app | GREEN | Admin auth/loading shell returned AUTHENTICATING SOVEREIGN IDENTITY text. |
| `/owners` from primary domain | GREEN | Routed to unified portal loading shell. |
| `/request-demo` from primary domain | GREEN | Routed to unified portal loading shell. |
| `/onboarding` from primary domain | DEPLOY-VERIFY | Route exists and is now covered by automated browser launch-audit test. Needs redeploy/browser test confirmation. |
| `/verify` invoice verification entry | CODE-FIXED | Public route was missing from `App.tsx`; route is now registered and covered by automated launch-audit test. Needs redeploy/browser test confirmation. |
| `/verify-cert` certificate verification entry | CODE-FIXED | Public route was missing from `App.tsx`; route is now registered and covered by automated launch-audit test. Needs redeploy/browser test confirmation. |
| `/support` from primary domain | GREEN | Routed to unified portal loading shell. |
| `/contact` from primary domain | GREEN | Routed to unified portal loading shell. |

---

## 2. Code Fixes Applied

### Public verifier routes

`src/App.tsx` now exposes the launch-required verifier entry points:

- `/verify`
- `/verify/:id`
- `/verify/invoice/:id`
- `/verify-cert`
- `/verify-cert/:id`
- `/verify/cert/:id`
- `/verify/certificate/:id`

This closes the mismatch where the launch checklist expected `/verify` and `/verify-cert`, but the router only handled ID-based nested verifier paths.

### Automated public route audit

Added `tests/e2e/launch-audit-public-routes.spec.ts` covering:

- `/`
- `/login`
- `/onboarding`
- `/support`
- `/contact`
- `/verify`
- `/verify-cert`
- `/verify/invoice/:id`
- `/verify/cert/:id`
- `/verify-cert/:id`
- standalone admin portal public auth shell

Because this file matches `launch-audit-*.spec.ts`, it is included by the existing `npm run test:e2e:launch-audit` command.

---

## 3. Items No Longer Left As Manual-Only

The following items now have executable checks in the launch audit suite:

- JavaScript runtime public route health.
- `/login` form rendering on SPA routes.
- `/onboarding` wizard rendering after JavaScript hydration.
- `/verify` invoice verification page hydration.
- `/verify-cert` certificate verification page hydration.
- Admin portal public authentication-shell exposure.

---

## 4. Firebase Rules API 503 Watch

**Status:** STILL OPERATOR-REQUIRED

Reason: Firebase Console and Firebase CLI access are required to close this safely. Code-only changes cannot prove active production ruleset state.

Close only after:

1. `firebase deploy --project bin-group-57c60 --only firestore:rules,storage --dry-run` succeeds.
2. `npm run test:stability` succeeds.
3. Firebase Console shows the expected latest Firestore and Storage rulesets as active.
4. No repeated Rules API errors appear over a 24-hour post-launch observation window.

---

## 5. Five-Role Smoke Test Status

| Role | Status | Notes |
|---|---:|---|
| Owner | AUTOMATED GATE EXISTS / NEEDS CREDENTIAL RUN | `tests/e2e/hard-launch-routes.spec.ts` requires `E2E_OWNER_EMAIL` and `E2E_OWNER_PASSWORD`. |
| Tenant | AUTOMATED GATE EXISTS / NEEDS CREDENTIAL RUN | Requires `E2E_TENANT_EMAIL` and `E2E_TENANT_PASSWORD`. |
| Technician | AUTOMATED GATE EXISTS / NEEDS CREDENTIAL RUN | Requires `E2E_TECHNICIAN_EMAIL` and `E2E_TECHNICIAN_PASSWORD`. |
| Broker | AUTOMATED GATE EXISTS / NEEDS CREDENTIAL RUN | Requires `E2E_BROKER_EMAIL` and `E2E_BROKER_PASSWORD`. |
| Admin | AUTOMATED GATE EXISTS / NEEDS CREDENTIAL RUN | Requires `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`. |

---

## 6. Required Deploy-And-Verify Commands

Run from the repo root after pulling the latest commits:

```bash
npm install
npm run typecheck
npm run build
npm run build:admin
npm run test:stability
E2E_BASE_URL=https://bin-group-57c60.web.app E2E_ADMIN_BASE_URL=https://bin-group-admin-panel.web.app npm run test:e2e:launch-audit
npx firebase deploy --project bin-group-57c60 --only hosting
```

If rules are being touched, also run:

```bash
firebase deploy --project bin-group-57c60 --only firestore:rules,storage --dry-run
```

---

## 7. Current Launch Color

**Status:** CODE-FIXED / DEPLOY-VERIFY

Reason:

- Public roots were reachable during the spot check.
- Admin root was reachable during the spot check.
- Missing verifier entry routes were fixed in code.
- Public route hydration checks were converted into an automated Playwright gate.
- Authenticated five-role checks already exist as automated gates but need production credentials to execute.
- Firebase Rules API `503` cannot be closed from GitHub code alone; it requires CLI/Console verification.

---

## 8. Final Sign-Off

**Final status:** CODE-FIXED / DEPLOY-VERIFY  
**Decision:** The route-level launch gaps are fixed in the repository. Full operational GREEN requires deployment of these commits plus successful Firebase rules/stability and five-role authenticated E2E runs.  
**Next action owner:** BIN GROUP operator / technical admin with Firebase CLI, deployment rights, and five E2E role credentials.
