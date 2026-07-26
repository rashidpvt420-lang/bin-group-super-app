#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  ['scripts/run-critical-evidence.mjs', '--suite', 'all-business'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
);

const exitCode = result.status ?? 1;
console.log(`[protected-business-evidence] real_firebase_mfa_only=true exit_code=${exitCode} hardLaunchClaim=false`);
process.exit(exitCode);
