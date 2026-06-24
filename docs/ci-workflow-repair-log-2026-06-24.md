# CI Workflow Repair Log — 2026-06-24

## Scope

Repair the red GitHub Actions shown in the Actions dashboard one by one, starting from newest active failures:

1. PR Validation failure on PR #195 / `ci-root-lint-fix`.
2. Firebase Production Deploy validation failures on `main`.
3. BIN GROUP CI failures tied to the same root lint/build validation chain.
4. Public launch route verification gaps from `/verify`, `/verify-cert`, and `/onboarding`.

---

## Fix 1 — Public verifier launch routes

**Status:** CODE-FIXED / DEPLOY-VERIFY

### Added routes in `src/App.tsx`

- `/verify`
- `/verify/:id`
- `/verify/invoice/:id`
- `/verify-cert`
- `/verify-cert/:id`
- `/verify/cert/:id`
- `/verify/certificate/:id`

### Added test coverage

Created `tests/e2e/launch-audit-public-routes.spec.ts` covering:

- public marketing root
- `/login`
- `/onboarding`
- `/support`
- `/contact`
- `/verify`
- `/verify-cert`
- verifier deep links
- standalone admin portal public auth shell

### Commits

- `9035b425020db5d37dff3be0ddc3cde7c841e8cb` — expose public verifier launch routes
- `fadfe53baed3008411ac6a574262b15e605cb769` — add public launch route audit
- `7061e737416495476c08d8962718e320705a5391` — update launch signoff after route fixes

---

## Fix 2 — PR #195 root lint failure

**Status:** FIX APPLIED / WORKFLOWS RUNNING

### Root cause confirmed

PR #195 latest failed run showed:

- Repository hygiene guard: passed
- Install dependencies: passed
- Production stability guard: passed
- TypeScript check: passed
- Lint root app: failed
- Build steps: skipped because lint failed

This isolated the blocker to ESLint configuration, not app TypeScript, install, Firebase, or build output.

### Fix applied on `ci-root-lint-fix`

The branch now updates `.eslintrc.cjs` with:

- browser/Firebase/Google runtime globals
- `no-undef: off`

Reason: `npx tsc -p tsconfig.app.json --noEmit` is the source of truth for TypeScript symbol safety. ESLint core `no-undef` is not TypeScript-aware enough for TS/TSX ambient types, Google Maps globals, Firebase service-worker globals, and JSX ambient references.

### Current checks watched

- BIN GROUP CI #979: in progress
- PR Validation #273: in progress

---

## Fix 3 — Production deploy root lint failure on `main`

**Status:** CODE-FIXED / WAITING FOR NEW ACTION RESULT

### Fix applied directly to `main`

Updated `.eslintrc.cjs` on `main` with the same lint hardening:

- `globals`: `JSX`, `google`, `self`, `importScripts`, `firebase`
- `no-undef: off`

### Commit

- `ffaa0de2dc2358b4271391e1d37daed7c7bac494` — `fix(ci): harden root lint config for production deploy`

This should unblock Firebase Production Deploy's `Validate production build` job where it runs:

1. Repository hygiene guard
2. Install dependencies
3. Production stability guard
4. TypeScript check
5. Lint root app
6. Build shared package
7. Build unified public app
8. Build dedicated admin panel
9. Build Firebase Functions
10. Firestore rules tests

---

## Important GitHub Actions note

Old red workflow runs will remain red forever in the Actions history. They cannot be converted to green retroactively. The correct success signal is:

- a new green run on the newest commit, or
- a successful re-run after the fix commit is present.

---

## Still left to close

1. Wait for PR #195 fresh PR Validation #273 to complete.
2. Wait for PR #195 fresh BIN GROUP CI #979 to complete.
3. Confirm the new `main` commit `ffaa0de...` triggers and passes Firebase Production Deploy.
4. If Firebase deployment still fails after validation, inspect the deploy job separately for IAM, Workload Identity, or Firebase service availability errors.
5. Run/confirm live route audit after deployment:

```bash
E2E_BASE_URL=https://bin-group-57c60.web.app \
E2E_ADMIN_BASE_URL=https://bin-group-admin-panel.web.app \
npm run test:e2e:launch-audit
```

6. Run authenticated five-role checks once production E2E credentials are configured:

```bash
npm run test:e2e:launch-audit
```

Required credentials:

- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`
- `E2E_OWNER_EMAIL` / `E2E_OWNER_PASSWORD`
- `E2E_TENANT_EMAIL` / `E2E_TENANT_PASSWORD`
- `E2E_TECHNICIAN_EMAIL` / `E2E_TECHNICIAN_PASSWORD`
- `E2E_BROKER_EMAIL` / `E2E_BROKER_PASSWORD`

---

## Current status

**Overall:** ACTIVE REPAIR IN PROGRESS

**Fixed in code:** public verifier routes, public launch route audit, root ESLint production deploy config.

**Waiting on GitHub Actions:** PR #195 checks and the new `main` production deploy result.
