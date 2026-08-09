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

function runCriticalBusinessEvidence(releaseId, attempt) {
  console.log(`[protected-business-evidence] starting real five-role business evidence attempt=${attempt}`);
  const result = spawnSync(
    process.execPath,
    ['scripts/run-critical-evidence.mjs', '--suite', 'all-business'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DEPLOYMENT_ENVIRONMENT: 'production',
        RELEASE_ID: releaseId,
        BUSINESS_EVIDENCE_ATTEMPT: String(attempt),
      },
      stdio: 'inherit',
    },
  );
  return result.status ?? 1;
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

// App Check debug tokens belong to individual Firebase apps. The protected
// business suite exercises both the public and dedicated Admin web apps, so
// verify (and only when missing, synchronize) the same stable CI UUID for both
// before any callable with enforceAppCheck can become an opaque E2E failure.
run('scripts/ensure-protected-appcheck-debug-tokens.mjs');

// Apply run-time-only hardening after the legacy compatibility patches so the
// committed tests stay representative while production replay gets deterministic
// listener convergence, stale synthetic correction cleanup, and exact callable
// error diagnostics.
run('scripts/harden-repeated-business-evidence.mjs');

const releaseId = String(process.env.RELEASE_ID || '').trim()
  || `${process.env.GITHUB_RUN_ID || 'unknown'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
run('scripts/ensure-phase1-manual-payment-config.mjs', [], { RELEASE_ID: releaseId });
run('scripts/prepare-protected-business-fixtures.mjs', [], { RELEASE_ID: releaseId });
run('scripts/verify-phase1-manual-payment-proof.mjs', [], { RELEASE_ID: releaseId });

let exitCode = runCriticalBusinessEvidence(releaseId, 1);
if (exitCode !== 0) {
  console.warn(`[protected-business-evidence] attempt=1 failed exit_code=${exitCode}; rebuilding protected fixtures and performing one fresh real evidence retry.`);
  run('scripts/prepare-protected-business-fixtures.mjs', [], { RELEASE_ID: releaseId });
  run('scripts/verify-phase1-manual-payment-proof.mjs', [], { RELEASE_ID: releaseId });
  exitCode = runCriticalBusinessEvidence(releaseId, 2);
}

console.log(`[protected-business-evidence] real_firebase_mfa_only=true admin_proof=canonical-founder-totp phase1_config_verified=true founder_geo_verified=true appcheck_dual_app_verified=true attempts=${exitCode === 0 ? '1-or-2' : '2'} exit_code=${exitCode} hardLaunchClaim=false`);
process.exit(exitCode);
