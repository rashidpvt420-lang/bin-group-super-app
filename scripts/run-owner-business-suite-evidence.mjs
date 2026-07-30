#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const run = (script) => execFileSync(process.execPath, [script], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  timeout: 18 * 60 * 1000,
});

const mode = String(process.argv[2] || 'lifecycle').trim().toLowerCase();
if (mode === 'lifecycle') {
  run('scripts/run-owner-inspection-first-production-evidence.mjs');
} else if (mode === 'restore-shared-fixtures') {
  // The Owner proof intentionally replaces the dedicated Owner Auth account.
  // Restore the shared live-role fixtures only after the Owner UI has inspected
  // the activation-generated portfolio, contract and financial records.
  run('scripts/seed-live-role-test-data.mjs');
} else {
  throw new Error(`Unsupported Owner business evidence mode: ${mode}`);
}
