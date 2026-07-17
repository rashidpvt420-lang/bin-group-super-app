#!/usr/bin/env node
/**
 * Live launch audit — execution-bound evidence only.
 * Delegates to run-critical-evidence so results cannot be forged via --exit-code.
 */
import { spawnSync } from 'node:child_process';

process.env.E2E_BASE_URL = process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app';
process.env.E2E_ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app';

console.log('[live-launch-audit] preparing repeatable Tenant correction evidence fixture');
const fixture = spawnSync(process.execPath, ['scripts/prepare-tenant-correction-e2e.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
if ((fixture.status ?? 1) !== 0) {
  console.error('[live-launch-audit] Tenant correction evidence fixture failed — live evidence will not run');
  process.exit(fixture.status ?? 1);
}

const result = spawnSync(process.execPath, ['scripts/run-critical-evidence.mjs', '--suite', 'launchAuditLive'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
