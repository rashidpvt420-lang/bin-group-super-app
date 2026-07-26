#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const PROTECTED_WORKFLOWS = new Map([
  ['Firebase Production Deploy', new Set(['deploy-firebase-production-stack', 'public-release-clearance'])],
  ['Live Role Smoke Tests', new Set(['live-evidence'])],
  ['Live Business Failure Diagnostics', new Set(['diagnose-live-business-failures'])],
]);

function resolveMfaManagerEnvironment(env = process.env) {
  const allowedJobs = PROTECTED_WORKFLOWS.get(String(env.GITHUB_WORKFLOW || ''));
  const exactProtectedJob =
    env.GITHUB_ACTIONS === 'true' &&
    env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY &&
    allowedJobs?.has(String(env.GITHUB_JOB || '')) === true &&
    env.GITHUB_REF === 'refs/heads/main' &&
    /^[0-9a-f]{40}$/.test(String(env.GITHUB_SHA || '').trim());

  if (!exactProtectedJob) return env;
  return { ...env, DEPLOYMENT_ENVIRONMENT: 'production' };
}

function run(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

const mfaManagerEnvironment = resolveMfaManagerEnvironment();
let exitCode = 1;
let prepared = false;
try {
  const prepareStatus = run(
    'scripts/manage-e2e-admin-mfa-test.mjs',
    ['--mode', 'prepare'],
    mfaManagerEnvironment,
  );
  if (prepareStatus !== 0) {
    console.error('[protected-business-evidence] E2E Admin MFA preparation failed; business evidence was not started.');
    exitCode = prepareStatus;
  } else {
    prepared = true;
    exitCode = run(
      'scripts/run-critical-evidence.mjs',
      ['--suite', 'all-business'],
      { ...process.env, E2E_ADMIN_MFA_MANAGED_EXTERNALLY: 'true' },
    );
  }
} finally {
  const cleanupStatus = run(
    'scripts/manage-e2e-admin-mfa-test.mjs',
    ['--mode', 'cleanup'],
    mfaManagerEnvironment,
  );
  if (cleanupStatus !== 0) exitCode = cleanupStatus;

  if (prepared && cleanupStatus === 0) {
    const retirementStatus = run(
      'scripts/e2e-admin-lifecycle.mjs',
      ['--phase=post-business-evidence'],
      mfaManagerEnvironment,
    );
    if (retirementStatus !== 0) exitCode = retirementStatus;
  }
  if (!prepared) console.error('[protected-business-evidence] cleanup executed after incomplete preparation.');
}

console.log(`[protected-business-evidence] real_firebase_mfa_only=true exit_code=${exitCode} hardLaunchClaim=false`);
process.exit(exitCode);

export { resolveMfaManagerEnvironment };
