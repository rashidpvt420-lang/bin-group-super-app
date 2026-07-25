#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const DEPLOY_WORKFLOW = 'Firebase Production Deploy';
const DEPLOY_JOB = 'deploy-firebase-production-stack';

function resolveMfaManagerEnvironment(env = process.env) {
  if (env.DEPLOYMENT_ENVIRONMENT === 'production') return env;

  const exactProtectedDeployJob =
    env.GITHUB_ACTIONS === 'true' &&
    env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY &&
    env.GITHUB_WORKFLOW === DEPLOY_WORKFLOW &&
    env.GITHUB_JOB === DEPLOY_JOB &&
    env.GITHUB_REF === 'refs/heads/main' &&
    /^[0-9a-f]{40}$/.test(String(env.GITHUB_SHA || '').trim());

  if (!exactProtectedDeployJob) return env;
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
    exitCode = run('scripts/run-critical-evidence.mjs', ['--suite', 'all-business']);
  }
} finally {
  const cleanupStatus = run(
    'scripts/manage-e2e-admin-mfa-test.mjs',
    ['--mode', 'cleanup'],
    mfaManagerEnvironment,
  );
  if (cleanupStatus !== 0) exitCode = cleanupStatus;
  if (!prepared) console.error('[protected-business-evidence] cleanup executed after incomplete preparation.');
}

console.log('[protected-business-evidence] hardLaunchClaim=false');
process.exit(exitCode);

export { resolveMfaManagerEnvironment };
