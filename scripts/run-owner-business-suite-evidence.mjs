#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const run = (script) => execFileSync(process.execPath, [script], {
  cwd: process.cwd(),
  env: { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production' },
  stdio: 'inherit',
  timeout: 12 * 60 * 1000,
});

const mode = String(process.argv[2] || 'lifecycle').trim().toLowerCase();
if (mode === 'lifecycle') {
  run('scripts/run-owner-onboarding-production-evidence-secure.mjs');
} else if (mode === 'restore-shared-fixtures') {
  // The Owner proof intentionally replaces the dedicated Owner Auth account and
  // removes its prior role fixtures. Restore tenant/technician fixtures only
  // after the Owner UI has inspected the acquisition-generated portfolio.
  run('scripts/seed-live-role-test-data.mjs');
  run('scripts/prepare-protected-business-fixtures.mjs');
} else {
  throw new Error(`Unsupported Owner business evidence mode: ${mode}`);
}
