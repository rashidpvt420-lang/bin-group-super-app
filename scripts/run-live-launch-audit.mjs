#!/usr/bin/env node
/**
 * Live launch audit — execution-bound evidence only.
 * Delegates to run-critical-evidence so results and suite fixtures cannot be forged or bypassed.
 */
import { spawnSync } from 'node:child_process';

process.env.E2E_BASE_URL = process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app';
process.env.E2E_ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app';

const result = spawnSync(process.execPath, ['scripts/run-critical-evidence.mjs', '--suite', 'launchAuditLive'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
