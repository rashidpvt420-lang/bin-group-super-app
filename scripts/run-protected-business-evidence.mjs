#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const DEPLOY_WORKFLOW = 'Firebase Production Deploy';
const DEPLOY_JOB = 'deploy-firebase-production-stack';

function protectedProcessEnv(env = process.env) {
  const exactProductionDeployJob =
    env.GITHUB_ACTIONS === 'true' &&
    env.GITHUB_WORKFLOW === DEPLOY_WORKFLOW &&
    env.GITHUB_JOB === DEPLOY_JOB &&
    env.GITHUB_REF === 'refs/heads/main' &&
    /^[0-9a-f]{40}$/.test(String(env.GITHUB_SHA || ''));

  if (env.DEPLOYMENT_ENVIRONMENT === 'production' || !exactProductionDeployJob) return env;

  return {
    ...env,
    DEPLOYMENT_ENVIRONMENT: 'production',
  };
}

const evidenceEnv = protectedProcessEnv();

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: evidenceEnv,
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

export { protectedProcessEnv };
