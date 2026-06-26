# CI Root Lint Fix — 2026-06-24

## Context

Firebase Production Deploy on `main` reached the production validation stage and passed TypeScript, then stopped at `Lint root app`.

## Change

Updated `.eslintrc.cjs` to declare browser/runtime globals used by the root app lint context:

- `JSX`
- `google`
- `self`
- `importScripts`
- `firebase`

This keeps the production validation sequence intact while aligning ESLint with the browser/Firebase runtime names used by the app.

## Next validation

- PR Validation
- BIN GROUP CI
- Firebase Production Deploy after merge
