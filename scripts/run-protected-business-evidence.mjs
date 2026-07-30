#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const run = (script, args = []) => spawnSync(
  process.execPath,
  [script, ...args],
  {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production' },
    stdio: 'inherit',
  },
);

const preparation = run('scripts/prepare-protected-business-fixtures.mjs');
const preparationExitCode = preparation.status ?? 1;
if (preparationExitCode !== 0) {
  console.log(`[protected-business-evidence] fixture_preparation_exit_code=${preparationExitCode} hardLaunchClaim=false`);
  process.exit(preparationExitCode);
}

const result = run('scripts/run-critical-evidence.mjs', ['--suite', 'all-business']);
const exitCode = result.status ?? 1;
console.log(`[protected-business-evidence] real_firebase_mfa_only=true admin_proof=canonical-founder-totp exit_code=${exitCode} hardLaunchClaim=false`);
process.exit(exitCode);
