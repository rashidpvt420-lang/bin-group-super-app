#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function run(script, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production', ...extraEnv },
    stdio: 'inherit',
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

run('scripts/apply-five-role-business-evidence-fixes.mjs');

const protectedPhase1 = process.env.GITHUB_ACTIONS === 'true'
  && process.env.GITHUB_REF === 'refs/heads/main'
  && process.env.GITHUB_WORKFLOW === 'Firebase Production Deploy'
  && String(process.env.DEPLOYMENT_ENVIRONMENT || '').toLowerCase() === 'production'
  && String(process.env.PAYMENT_POLICY || '').toLowerCase() === 'phase1-manual'
  && String(process.env.E2E_STRICT_LIVE || '').toLowerCase() === 'true';

if (!protectedPhase1) {
  console.error('[protected-business-evidence] Refusing production business evidence outside the protected Phase 1 exact-main workflow.');
  process.exit(1);
}

const releaseId = String(process.env.RELEASE_ID || '').trim()
  || `${process.env.GITHUB_RUN_ID || 'unknown'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
run('scripts/ensure-phase1-manual-payment-config.mjs', [], { RELEASE_ID: releaseId });
run('scripts/prepare-protected-business-fixtures.mjs', [], { RELEASE_ID: releaseId });
run('scripts/verify-phase1-manual-payment-proof.mjs', [], { RELEASE_ID: releaseId });

const result = spawnSync(
  process.execPath,
  ['scripts/run-critical-evidence.mjs', '--suite', 'all-business'],
  {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production', RELEASE_ID: releaseId },
    stdio: 'inherit',
  },
);

const exitCode = result.status ?? 1;
console.log(`[protected-business-evidence] real_firebase_mfa_only=true admin_proof=canonical-founder-totp phase1_config_verified=true founder_geo_verified=true exit_code=${exitCode} hardLaunchClaim=false`);
process.exit(exitCode);
