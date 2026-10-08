#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '..');
const envPath = path.resolve(repositoryRoot, '.env.e2e');
const artifactsDir = path.resolve(repositoryRoot, 'launch_package/artifacts');

// The protected workflow creates .env.e2e immediately before the live role
// suites. Load it here as well so direct runner invocations and nested child
// processes receive the exact same resolved values as Playwright.
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, override: false });
}

function diagnosticFiles() {
  if (!existsSync(artifactsDir)) return [];
  try {
    return readdirSync(artifactsDir)
      .filter((name) => /owner|inspection|business|evidence|diagnostic/i.test(name))
      .sort()
      .map((name) => path.join(artifactsDir, name));
  } catch {
    return [];
  }
}

function run(script, label = path.basename(script)) {
  try {
    execFileSync(process.execPath, [script], {
      cwd: repositoryRoot,
      env: { ...process.env, DEPLOYMENT_ENVIRONMENT: 'production' },
      stdio: 'inherit',
      timeout: 18 * 60 * 1000,
    });
  } catch (error) {
    const files = diagnosticFiles();
    console.error(`[owner-business-suite] ${label} failed.`);
    console.error(`[owner-business-suite] script=${script}`);
    console.error(`[owner-business-suite] exitCode=${error?.status ?? 'unknown'}`);
    console.error(`[owner-business-suite] signal=${error?.signal ?? 'none'}`);
    console.error(`[owner-business-suite] diagnostics=${files.length ? files.join(', ') : 'none found'}`);
    throw error;
  }
}

const mode = String(process.argv[2] || 'lifecycle').trim().toLowerCase();
if (mode === 'lifecycle') {
  run('scripts/run-owner-inspection-first-production-evidence-unique.mjs');
} else if (mode === 'restore-shared-fixtures') {
  // The Owner proof intentionally replaces the dedicated Owner Auth account.
  // Restore the shared live-role fixtures only after the Owner UI has inspected
  // the activation-generated portfolio, contract and financial records. Then
  // reapply the exact Phase 1 policy and Founder-MFA Tenant dispatch geography,
  // because the shared seeder is authoritative for the next role suites.
  run('scripts/seed-live-role-test-data.mjs');
  run('scripts/ensure-phase1-manual-payment-config.mjs');
  run('scripts/prepare-protected-business-fixtures.mjs');
} else {
  throw new Error(`Unsupported Owner business evidence mode: ${mode}`);
}
