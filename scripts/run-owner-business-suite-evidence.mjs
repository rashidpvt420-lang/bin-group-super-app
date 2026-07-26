#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const run = (script) => execFileSync(process.execPath, [script], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  timeout: 12 * 60 * 1000,
});

run('scripts/run-owner-onboarding-production-evidence.mjs');

// The Owner proof intentionally replaces the dedicated Owner Auth account and
// removes its prior role fixtures. Restore the shared tenant/technician launch
// property against the new Owner UID before the remaining profile suites run.
run('scripts/seed-live-role-test-data.mjs');
