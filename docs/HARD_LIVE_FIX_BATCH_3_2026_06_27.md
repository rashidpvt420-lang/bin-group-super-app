# HARD LIVE FIX BATCH 3 — 2026-06-27

Branch: `fix/role-service-homepage-hard-live`
Repo: `rashidpvt420-lang/bin-group-super-app`

## Added in this batch

### Launch health smoke documents

Added `scripts/record-launch-smoke-documents.mjs`.

This script seeds Firestore documents for these smoke-test roles:

- public
- owner
- tenant
- technician
- admin
- broker

It writes records into `launch_smoke_tests` and updates `system_health/dashboard` with launch smoke-test status metadata.

Added package script:

```bash
npm run launch:smoke-docs
```

This closes part of the launch-health gap: the admin launch health panel can now be fed by real smoke-test documents instead of only dashboard copy.

## Attempted but blocked by connector safety gate

### PDF export utility/page

A generic one-click PDF export helper and owner export page were attempted, but the GitHub connector safety gate blocked the file writes. No PDF export code was committed in this batch.

### Dependency correction rewrite

A follow-up package rewrite to keep dependency versions exactly stable was attempted after adding the smoke script, but the connector safety gate blocked that update. The current diff shows a package script addition and minor dependency version changes. This must be checked before merge.

## Still left after this batch

### Must fix before merge/public launch

- Branch is diverged from `main` and must be rebuilt or rebased from latest `main`.
- PR #219 is closed and not merged, so this branch is not currently a merge path.
- Run local checks:
  - `npm run typecheck`
  - `npm run build`
  - `npm run build:admin`
  - `npm run test:hard-launch-readiness`
  - Firebase security rules tests
  - 5-profile live smoke test
- Add real one-click PDF exports through a smaller, build-verified PR.
- Verify App Check production key, Stripe live webhook, admin password rotation, branded email sender and backup/restore drill.

## Status truth

This batch improved the launch-health evidence path, but it did not finish every remaining item. The repo is closer, not complete.
