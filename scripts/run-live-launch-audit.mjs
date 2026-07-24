#!/usr/bin/env node
/**
 * Live launch audit — execution-bound evidence only.
 * Delegates to run-critical-evidence so results and suite fixtures cannot be forged or bypassed.
 * In the protected production workflow, the E2E Admin exists only for this evidence window.
 */
import { spawnSync } from 'node:child_process';

process.env.E2E_BASE_URL = process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app';
process.env.E2E_ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app';

const protectedProductionRun = process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_WORKFLOW === 'Firebase Production Deploy' &&
  process.env.GITHUB_REF === 'refs/heads/main' &&
  String(process.env.E2E_ADMIN_EMAIL || '').trim().length > 0;
const lifecycleEnv = protectedProductionRun
  ? { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production' }
  : process.env;

let exitCode = 1;
try {
  if (protectedProductionRun) {
    const seed = spawnSync(process.execPath, ['scripts/seed-e2e-auth.mjs'], {
      stdio: 'inherit',
      env: lifecycleEnv,
    });
    exitCode = seed.status ?? 1;
    if (exitCode !== 0) {
      console.error(`[live-launch-audit] E2E account seeding failed with exit code ${exitCode}`);
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
