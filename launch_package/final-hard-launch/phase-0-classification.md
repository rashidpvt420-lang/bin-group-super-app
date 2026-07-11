# Phase 0F — Launch Position Classification

Date: 2026-07-11

## Repository identity: CONFIRMED

This workspace is the authoritative **BIN GROUP Super App** (`bin-group-super-app`), not the smaller Next.js prototype.

## Execution blocker

The Cursor agent shell could not complete `git`, `node`, or `npm` commands (all hung >10 minutes with no stdout). `node_modules/` is absent. Baseline builds and automated gates were **not executed** in this session. Results below combine filesystem proof, static analysis, and the existing `hard-launch-readiness.json` register.

## Classification block

```text
CORRECT_SUPER_APP_REPOSITORY: YES
STARTING_BRANCH: gate11-fixes → fix/final-hard-launch-audit-2026-07-11 (active)
STARTING_SHA: 8c9635b713a27dda1ea1c593b75267e856b22163
WORKTREE_DIRTY: YES
FIREBASE_PROJECT: bin-group-57c60
MAIN_HOSTING_TARGET: app → bin-group-57c60
ADMIN_HOSTING_TARGET: admin → bin-group-admin-panel
FIVE_PROFILES_FOUND: YES
FUNCTIONS_FOUND: YES
FIRESTORE_RULES_FOUND: YES
STORAGE_RULES_FOUND: YES
APP_CHECK_TESTS_FOUND: YES
STRIPE_GATE_FOUND: YES
E2E_TESTS_FOUND: YES
BASELINE_BUILD: BLOCKED
FUNCTIONS_BUILD: BLOCKED
RULES_HARDENING: STATIC_PASS (fragments present; script not executed)
STABILITY_TEST: BLOCKED
HARD_LAUNCH_AUDIT: STARTED
CURRENT_DECISION: GO_TO_PHASE_1
```

## Static inventory highlights

### Five profiles (main app `src/`)

| Role | App shell | Sample routes |
|------|-----------|---------------|
| Owner | `src/owner/OwnerApp.tsx` | `/owner/dashboard`, `/owner/activation`, `/owner/contracts` |
| Tenant | `src/tenant/TenantApp.tsx` | `/tenant/dashboard`, `/tenant/request`, `/tenant/tickets` |
| Technician | `src/technician/TechnicianApp.tsx` | `/technician/dashboard`, `/technician/jobs`, `/technician/map` |
| Broker | `src/broker/BrokerApp.tsx` | `/broker/dashboard`, `/broker/leads`, `/broker/commissions` |
| Admin | `src/admin/AdminTerminal.tsx` | `/admin/dashboard`, `/admin/owners`, `/admin/tickets` |

Separate admin panel: `apps/admin-panel/` (hosted at `bin-group-admin-panel`).

### Firebase / security (code-level)

- `functions/index.ts`: `setGlobalOptions({ enforceAppCheck: true })`
- `src/lib/firebase.ts`: App Check behind `VITE_ENABLE_FIREBASE_APPCHECK`
- `firestore.rules`: hardened fragments present (notifications, mission pool, tenant ticket binding)
- `storage.rules`: present (modified in worktree)

### RTL / Arabic

- `stylis-plugin-rtl`, `@fontsource/cairo`, `direction: isRTL ? 'rtl' : 'ltr'` across all five role shells

### PWA

- `public/manifest.json`, `manifest.json` at repo root; Capacitor mobile scripts in `package.json`

### Hard-launch register

- Decision: `CONTROLLED_PILOT_ONLY`
- Verified score: **5.5 / 10**
- 14 of 15 required gates: `external_verification_required`
- Only `legal_pages`: `software_gate_present`

## Phase 1 prerequisites (blocked until shell works)

1. `npm ci`
2. Run full baseline matrix (`run-phase0-bootstrap.ps1` in `launch_package/final-hard-launch/`)
3. `git switch -c fix/final-hard-launch-audit-2026-07-11`
4. Live gates: REST auth, Gate 12 controls, Stripe live charge, App Check enforcement, five-role Playwright on production URLs

## Final decision (this session)

```text
HARD LAUNCH: NO-GO
```

Reasons:
1. Baseline build/test matrix not executed (shell blocker + no `node_modules`)
2. Hard-launch register explicitly `CONTROLLED_PILOT_ONLY` with verified score 5.5
3. Fourteen production evidence gates remain unattested (admin login, owner onboarding, tenant photo request, technician GPS, broker commission, Stripe live, App Check enforcement, email, pilot window, etc.)
4. No fake green — unrestricted public launch cannot be declared without live evidence chain
