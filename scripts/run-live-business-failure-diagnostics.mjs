#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const outputDir = path.join(root, 'diagnostics', 'live-business');
mkdirSync(outputDir, { recursive: true });

const suites = Object.freeze([
  { key: 'admin', spec: 'tests/e2e/business-admin.spec.ts' },
  { key: 'tenant', spec: 'tests/e2e/business-tenant.spec.ts' },
  { key: 'technician', spec: 'tests/e2e/business-technician.spec.ts' },
]);

const sensitiveKeys = [
  'E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD',
  'E2E_OWNER_EMAIL', 'E2E_OWNER_PASSWORD',
  'E2E_TENANT_EMAIL', 'E2E_TENANT_PASSWORD',
  'E2E_TECHNICIAN_EMAIL', 'E2E_TECHNICIAN_PASSWORD',
  'E2E_BROKER_EMAIL', 'E2E_BROKER_PASSWORD',
  'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN', 'FIREBASE_APPCHECK_DEBUG_TOKEN',
  'VITE_FIREBASE_API_KEY', 'REACT_APP_FIREBASE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redact(value, maxLength = 8_000) {
  let text = String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
  for (const key of sensitiveKeys) {
    const secret = String(process.env[key] || '');
    if (secret.length >= 4) text = text.replace(new RegExp(escapeRegExp(secret), 'g'), `<redacted:${key}>`);
  }
  text = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '<redacted-api-key>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '<redacted-uuid>')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<redacted-jwt>')
    .replace(/\+1650555\d{4}/g, '<redacted-test-phone>')
    .replace(/"verificationCode"\s*:\s*"\d{6}"/g, '"verificationCode":"<redacted-test-code>"');
  return text.slice(0, maxLength);
}

function collectFailures(report) {
  const failures = [];
  function walk(suite, parents = []) {
    const nextParents = suite?.title ? [...parents, String(suite.title)] : parents;
    for (const spec of suite?.specs || []) {
      for (const test of spec?.tests || []) {
        const results = test?.results || [];
        const last = results[results.length - 1] || {};
        const status = String(last.status || test.status || 'unknown');
        if (status === 'passed' || status === 'expected' || status === 'skipped') continue;
        const errors = [last.error, ...(last.errors || [])].filter(Boolean);
        failures.push({
          file: String(spec.file || suite.file || ''),
          title: [...nextParents, String(spec.title || test.title || 'untitled test')].filter(Boolean).join(' › '),
          status,
          durationMs: Number(last.duration || 0),
          errors: errors.slice(0, 3).map((error) => ({
            message: redact(error?.message || error?.value || error, 4_000),
            stack: redact(error?.stack || '', 6_000),
          })),
        });
      }
    }
    for (const child of suite?.suites || []) walk(child, nextParents);
  }
  for (const suite of report?.suites || []) walk(suite);
  return failures;
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, env: process.env, encoding: 'utf8' });
}

function requireInfrastructure(label, result) {
  if ((result.status ?? 1) === 0) return;
  throw new Error(`${label} failed: ${redact(result.stderr || result.stdout || `exit ${result.status}`)}`);
}

const summary = {
  schemaVersion: 2,
  status: 'RUNNING',
  repository: String(process.env.GITHUB_REPOSITORY || ''),
  deployedSha: String(process.env.DIAGNOSTIC_DEPLOYED_SHA || ''),
  productionDeployRunId: String(process.env.DIAGNOSTIC_SOURCE_RUN_ID || ''),
  diagnosticRunId: String(process.env.GITHUB_RUN_ID || ''),
  startedAt: new Date().toISOString(),
  suites: [],
  ephemeralAdminMfaPrepared: false,
  ephemeralAdminRetired: false,
  ephemeralAdminMfaConfigRemoved: false,
  sensitiveValuesExcluded: true,
  hardLaunchClaim: false,
};

let infrastructureFailure = '';
try {
  requireInfrastructure('E2E environment verification', runNode('scripts/verify-e2e-env.mjs'));
  requireInfrastructure('App Check verification', runNode('scripts/ensure-appcheck.mjs'));
  requireInfrastructure('E2E auth seeding', runNode('scripts/seed-e2e-auth.mjs'));
  requireInfrastructure('Live role fixture seeding', runNode('scripts/seed-live-role-test-data.mjs'));
  requireInfrastructure('E2E Admin MFA preparation', runNode('scripts/manage-e2e-admin-mfa-test.mjs', ['--mode', 'prepare']));
  summary.ephemeralAdminMfaPrepared = true;

  for (const suite of suites) {
    const reportPath = path.join(outputDir, `${suite.key}.json`);
    const result = spawnSync(
      'npx',
      ['playwright', 'test', suite.spec, '--project=chromium-desktop', '--reporter=json'],
      {
        cwd: root,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    let report = null;
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {
      // The redacted process output below remains available when JSON is absent.
    }

    summary.suites.push({
      key: suite.key,
      spec: suite.spec,
      exitCode: result.status ?? 1,
      stats: report?.stats || null,
      failures: report ? collectFailures(report) : [],
      stdoutTail: report ? '' : redact(result.stdout || '', 6_000),
      stderrTail: report ? '' : redact(result.stderr || '', 6_000),
    });
    rmSync(reportPath, { force: true });
  }
} catch (error) {
  infrastructureFailure = redact(error instanceof Error ? error.message : error, 8_000);
} finally {
  const accountCleanup = runNode('scripts/e2e-admin-lifecycle.mjs', ['--phase=post-business-diagnostic']);
  summary.ephemeralAdminRetired = (accountCleanup.status ?? 1) === 0;
  const mfaCleanup = runNode('scripts/manage-e2e-admin-mfa-test.mjs', ['--mode', 'cleanup']);
  summary.ephemeralAdminMfaConfigRemoved = (mfaCleanup.status ?? 1) === 0;

  if (!summary.ephemeralAdminRetired && !infrastructureFailure) {
    infrastructureFailure = `E2E Admin cleanup failed: ${redact(accountCleanup.stderr || accountCleanup.stdout || `exit ${accountCleanup.status}`)}`;
  }
  if (!summary.ephemeralAdminMfaConfigRemoved && !infrastructureFailure) {
    infrastructureFailure = `E2E Admin MFA config cleanup failed: ${redact(mfaCleanup.stderr || mfaCleanup.stdout || `exit ${mfaCleanup.status}`)}`;
  }
}

summary.finishedAt = new Date().toISOString();
summary.infrastructureFailure = infrastructureFailure;
summary.failedSuiteCount = summary.suites.filter((suite) => suite.exitCode !== 0).length;
summary.failedTestCount = summary.suites.reduce((total, suite) => total + suite.failures.length, 0);
summary.status = infrastructureFailure
  ? 'INFRASTRUCTURE_FAILURE'
  : summary.failedSuiteCount > 0
    ? 'TEST_FAILURES_CONFIRMED'
    : 'ALL_TARGETED_TESTS_PASSED';

const outputPath = path.join(outputDir, 'summary.json');
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`[live-business-diagnostics] status=${summary.status} failedSuites=${summary.failedSuiteCount} failedTests=${summary.failedTestCount}`);
console.log(`[live-business-diagnostics] summary=${path.relative(root, outputPath)}`);
console.log('[live-business-diagnostics] hardLaunchClaim=false');

if (infrastructureFailure || !summary.ephemeralAdminRetired || !summary.ephemeralAdminMfaConfigRemoved) process.exit(1);
process.exit(0);
