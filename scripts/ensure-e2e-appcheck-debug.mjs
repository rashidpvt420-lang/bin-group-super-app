#!/usr/bin/env node
/**
 * Validate the E2E App Check debug token from .env.e2e.
 * Does NOT register new debug tokens in Firebase Console — registration is manual.
 * This avoids "Maximum number of debug tokens reached (20)" failures during local runs.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'ensure-appcheck.mjs')], {
  stdio: 'inherit',
  env: process.env,
});

if ((result.status ?? 1) !== 0) {
  console.error(`
[APPCHECK_E2E] App Check debug token validation failed.

If Firebase Console shows "Maximum number of debug tokens reached (20)":
1. Open Firebase Console → App Check → Apps → BIN GROUP Web → Debug tokens
2. Delete unused/old E2E tokens (keep the UUID in VITE_FIREBASE_APPCHECK_DEBUG_TOKEN)
3. Register that SAME UUID once under BIN GROUP Web (main + admin hosting share this app id)
4. Re-run without changing .env.e2e — do not auto-register new tokens each run.
`);
  process.exit(result.status ?? 1);
}

const live = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-appcheck-debug-registration.mjs')], {
  stdio: 'inherit',
  env: process.env,
});

if ((live.status ?? 1) !== 0) {
  process.exit(live.status ?? 1);
}

console.log('[APPCHECK_E2E] ok — debug token format valid and registered in Firebase Console.');
process.exit(0);
