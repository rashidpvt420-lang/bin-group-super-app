# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single-product monorepo — the "BIN GROUP HOME OS" PropTech super app: a
Vite + React 18 + MUI frontend (all role portals live in `src/`: tenant, owner, technician,
broker, admin bridge) backed by Firebase (Firestore, Auth, Storage, Cloud Functions).
`TESTING.md` is the source of truth for the full list of build/test/lint/e2e commands — refer
to it rather than duplicating commands here.

### Services / how to run (dev)
- **Main web app (primary surface, all role portals):** `npm run dev` → Vite on `http://localhost:5173`.
- **Firestore rules tests:** `npm test` (aka `npm run test:rules`). Boots the Firestore emulator
  (needs Java — already present on the VM) and runs `node --test test/security-rules.test.js`.
- **Local public smoke E2E:** `npm run test:e2e:local` — builds the app and runs Playwright's
  "production public smoke" against a local `vite preview` on port 4173 (public routes only, no login).
- **Lint / typecheck:** `npm run lint`, `npm run typecheck`.
- **Workspaces:** root npm workspaces are `packages/*` and `functions`. `apps/admin-panel` and
  `apps/owner-app` are NOT workspaces — install them separately with
  `npm --prefix apps/<app> install --legacy-peer-deps` and build via `npm run build:admin` / `build:owner`.

### Non-obvious gotchas
- **Node 22** is authoritative (`.nvmrc`, `engines.node`). The older `DEV_SETUP_GUIDE.md`/`README.md`
  describe a fictional `backend/`, `tenant-app/` folder layout that does NOT exist — ignore it and
  trust `package.json`/`TESTING.md`.
- **Do NOT create `.env.local` from `.env.example`.** The example file uses `REPLACE_WITH_...`
  placeholders, which are NOT the `REPLACE_ME` sentinel the code checks for, so they are treated as
  real (invalid) values and break Firebase Auth (`auth/invalid-api-key`). `src/lib/firebase.ts` has
  working hardcoded fallback config for the real `bin-group-57c60` project, so with no env file the
  dev server connects to the live Firebase backend out of the box.
- **The frontend always talks to production Firebase** — it does not wire itself to the local
  emulators, and there is no anonymous auth. Public/marketing routes render without login, but any
  authenticated role flow (owner/tenant/technician/broker/admin dashboards, Firestore writes such as
  `pilotFeedback`) requires a real seeded test account. Full authenticated end-to-end testing is
  blocked without credentials.
- **rollup native binary:** a fresh `npm install` can omit `@rollup/rollup-linux-x64-gnu` (npm
  optional-deps bug #4828), which makes `npm run dev`/`build` crash with
  "Cannot find module @rollup/rollup-linux-x64-gnu". The startup update script installs the matching
  native binary if missing; if you hit this after a manual reinstall, re-run that guard.
