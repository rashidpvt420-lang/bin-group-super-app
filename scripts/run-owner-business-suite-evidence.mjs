#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.e2e');
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, override: false });
}

const run = (script) => execFileSync(process.execPath, [script], {
  cwd: process.cwd(),
  env: { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production' },
  stdio: 'inherit',
  timeout: 18 * 60 * 1000,
});

const runWithDiagnostics = (script, label) => {
  try {
    return run(script);
  } catch (error) {
    const artifactsPath = path.resolve(process.cwd(), 'launch_package/artifacts');
    console.error(`[owner-business-suite] ${label} failed.`);
    console.error(`[owner-business-suite] exitCode=${error?.status ?? 'unknown'} signal=${error?.signal ?? 'none'}`);
    console.error(`[owner-business-suite] diagnostics=${artifactsPath}`);
    throw error;
  }
};

const mode = String(process.argv[2] || 'lifecycle').trim().toLowerCase();
if (mode === 'lifecycle') {
  runWithDiagnostics('scripts/run-owner-inspection-first-production-evidence.mjs', 'lifecycle');
} else if (mode === 'restore-shared-fixtures') {
  // The Owner proof intentionally replaces the dedicated Owner Auth account.
  // Restore the shared live-role fixtures only after the Owner UI has inspected
  // the activation-generated portfolio, contract and financial records. Then
  // reapply the exact Phase 1 policy and Founder-MFA Tenant dispatch geography,
  // because the shared seeder is authoritative for the next role suites.
  runWithDiagnostics('scripts/seed-live-role-test-data.mjs', 'restore live-role fixtures');
  runWithDiagnostics('scripts/ensure-phase1-manual-payment-config.mjs', 'restore payment policy');
  runWithDiagnostics('scripts/prepare-protected-business-fixtures.mjs', 'restore protected business fixtures');
} else {
  throw new Error(`Unsupported Owner business evidence mode: ${mode}`);
}
