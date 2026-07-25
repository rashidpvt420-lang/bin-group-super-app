#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

let exitCode = 1;
let prepared = false;
try {
  const prepareStatus = run('scripts/manage-e2e-admin-mfa-test.mjs', ['--mode', 'prepare']);
  if (prepareStatus !== 0) {
    console.error('[protected-business-evidence] E2E Admin MFA preparation failed; business evidence was not started.');
    exitCode = prepareStatus;
  } else {
    prepared = true;
    exitCode = run('scripts/run-critical-evidence.mjs', ['--suite', 'all-business']);
  }
} finally {
  const cleanupStatus = run('scripts/manage-e2e-admin-mfa-test.mjs', ['--mode', 'cleanup']);
  if (cleanupStatus !== 0) exitCode = cleanupStatus;
  if (!prepared) console.error('[protected-business-evidence] cleanup executed after incomplete preparation.');
}

console.log('[protected-business-evidence] hardLaunchClaim=false');
process.exit(exitCode);
