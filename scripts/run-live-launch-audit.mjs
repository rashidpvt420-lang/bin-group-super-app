#!/usr/bin/env node
/**
 * Live launch audit — execution-bound evidence only.
 * Delegates to run-critical-evidence so results and suite fixtures cannot be forged or bypassed.
 * Protected runs rebuild the canonical E2E role state immediately before the
 * audit so earlier business evidence cannot leak mutated role/unit/contract state
 * into launch clearance.
 */
import { spawnSync } from 'node:child_process';

process.env.E2E_BASE_URL = process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app';
process.env.E2E_ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app';

const protectedWorkflow = [
  'Firebase Production Deploy',
  'Live Launch Audit',
].includes(String(process.env.GITHUB_WORKFLOW || '').trim());
const protectedProductionRun = process.env.GITHUB_ACTIONS === 'true' &&
  protectedWorkflow &&
  process.env.GITHUB_REF === 'refs/heads/main' &&
  String(process.env.E2E_ADMIN_EMAIL || '').trim().length > 0;
const lifecycleEnv = protectedProductionRun
  ? { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production' }
  : process.env;

function runProtectedFixture(script, label) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    env: lifecycleEnv,
  });
  const status = result.status ?? 1;
  if (status !== 0) {
    console.error(`[live-launch-audit] ${label} failed with exit code ${status}`);
  }
  return status;
}

let exitCode = 1;
try {
  if (protectedProductionRun) {
    exitCode = runProtectedFixture('scripts/seed-e2e-auth.mjs', 'E2E account seeding');
    if (exitCode === 0) {
      // Business evidence immediately before this audit is allowed to mutate its
      // own E2E fixtures. Rebuild the canonical five-role graph here so launch
      // audit starts from a known active Owner contract + occupied Tenant unit,
      // not from whatever state a previous proof intentionally exercised.
      exitCode = runProtectedFixture('scripts/seed-live-role-test-data.mjs', 'canonical live-role fixture seeding');
    }
  }

  if (!protectedProductionRun || exitCode === 0) {
    const result = spawnSync(process.execPath, ['scripts/run-critical-evidence.mjs', '--suite', 'launchAuditLive'], {
      stdio: 'inherit',
      env: lifecycleEnv,
    });
    exitCode = result.status ?? 1;
  }
} finally {
  if (protectedProductionRun) {
    const cleanup = spawnSync(
      process.execPath,
      ['scripts/e2e-admin-lifecycle.mjs', '--phase=post-launch-audit'],
      { stdio: 'inherit', env: lifecycleEnv },
    );
    const cleanupStatus = cleanup.status ?? 1;
    if (cleanupStatus !== 0) {
      console.error(`[live-launch-audit] E2E Admin retirement failed with exit code ${cleanupStatus}`);
      if (exitCode === 0) exitCode = cleanupStatus;
    }
  }
}

process.exit(exitCode);
