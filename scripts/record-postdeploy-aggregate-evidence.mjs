#!/usr/bin/env node
/**
 * Records the two aggregate evidence keys postdeploy-release-gate.mjs requires
 * but nothing else produces: gate11ProductionSmoke and businessWorkflows.
 *
 * Usage:
 *   node scripts/record-postdeploy-aggregate-evidence.mjs --only gate11
 *   node scripts/record-postdeploy-aggregate-evidence.mjs --only business
 *   node scripts/record-postdeploy-aggregate-evidence.mjs            (both)
 *
 * gate11ProductionSmoke: runs tests/e2e/gate11-staging-smoke.spec.ts against the
 *   URLs in E2E_BASE_URL/E2E_ADMIN_BASE_URL (pointed at production by the caller)
 *   and records the real pass/fail count. Intended to REPLACE the workflow's
 *   plain `npm run test:e2e:gate11:staging` step (same underlying spec, same
 *   URLs) rather than run alongside it — running the suite twice would waste
 *   CI time and could produce inconsistent evidence between the two runs.
 *
 * businessWorkflows: reads the six businessX evidence records that
 *   run-critical-evidence.mjs --suite all-business already wrote for this commit
 *   (via `npm run test:e2e:business`, which the workflow already runs as a
 *   separate step) and sums them into one aggregate record. Does not re-run
 *   anything itself.
 *
 * Fail-closed: a missing/malformed Playwright report, or missing prerequisite
 * business evidence, is recorded as a failure rather than silently omitted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  PRODUCTION,
  evidencePath,
  gitSha,
  parsePlaywrightJsonReport,
  readJsonSafe,
  sha256File,
  upsertEvidenceRecord,
} from './lib/launch-honesty.mjs';

const root = process.cwd();
const commitSha = process.env.GITHUB_SHA || gitSha(root);
const artifactsDir = path.join(root, 'launch_package', 'artifacts');
mkdirSync(artifactsDir, { recursive: true });

function argValue(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? '' : String(process.argv[idx + 1] || '').trim();
}

function recordGate11() {
  const mainUrl = String(process.env.E2E_BASE_URL || PRODUCTION.mainUrl).replace(/\/+$/, '');
  const adminUrl = String(process.env.E2E_ADMIN_BASE_URL || PRODUCTION.adminUrl).replace(/\/+$/, '');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const reportPath = path.join(artifactsDir, `gate11-production-smoke-${commitSha.slice(0, 8)}.json`);
  const startedAt = new Date().toISOString();

  const result = spawnSync(
    npmCmd,
    ['exec', '--', 'playwright', 'test', 'tests/e2e/gate11-staging-smoke.spec.ts', '--project=chromium-desktop', '--reporter=json'],
    { encoding: 'utf8', env: { ...process.env, E2E_BASE_URL: mainUrl, E2E_ADMIN_BASE_URL: adminUrl }, maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
  );
  const finishedAt = new Date().toISOString();
  writeFileSync(reportPath, result.stdout || '{"suites":[],"stats":{}}');

  let parsed;
  try {
    parsed = parsePlaywrightJsonReport(JSON.parse(result.stdout || '{}'));
  } catch (err) {
    console.error(`[record-postdeploy-evidence] gate11 report malformed: ${err.message}`);
    parsed = { ok: false, passed: 0, failed: 1, skipped: 0 };
  }

  const artifactHash = sha256File(reportPath);
  upsertEvidenceRecord(root, {
    testName: 'gate11ProductionSmoke',
    suiteName: 'gate11-staging-smoke',
    source: 'record-postdeploy-aggregate-evidence',
    executionGenerated: true,
    exitCode: result.status ?? 1,
    commitSha,
    mainUrl,
    adminUrl,
    startedAt,
    finishedAt,
    passed: parsed.passed || 0,
    failed: parsed.failed || 0,
    skipped: parsed.skipped || 0,
    artifactPath: path.relative(root, reportPath).replace(/\\/g, '/'),
    artifactHash,
    proof: `Gate 11 production smoke: passed=${parsed.passed || 0} failed=${parsed.failed || 0} on ${mainUrl} (commit ${commitSha.slice(0, 8)}).`,
    hardLaunchClaim: false,
  });
  console.log(`[record-postdeploy-evidence] gate11ProductionSmoke passed=${parsed.passed || 0} failed=${parsed.failed || 0}`);
  return (result.status ?? 1) === 0 && (parsed.failed || 0) === 0;
}

function recordBusinessAggregate() {
  const businessKeys = ['businessOwner', 'businessTenant', 'businessTechnician', 'businessBroker', 'businessGlobal', 'adminCredentialLogin'];
  const batch = readJsonSafe(evidencePath(root), { records: [] });
  const records = businessKeys.map((key) => (batch.records || []).find((r) => r.testName === key && r.commitSha === commitSha));

  const missing = businessKeys.filter((_, i) => !records[i]);
  if (missing.length) {
    console.error(`[record-postdeploy-evidence] cannot aggregate businessWorkflows — missing evidence for: ${missing.join(', ')}. Run "npm run test:e2e:business" first.`);
    upsertEvidenceRecord(root, {
      testName: 'businessWorkflows',
      suiteName: 'business-aggregate',
      source: 'record-postdeploy-aggregate-evidence',
      executionGenerated: true,
      exitCode: 1,
      commitSha,
      mainUrl: PRODUCTION.mainUrl,
      adminUrl: PRODUCTION.adminUrl,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      passed: 0,
      failed: businessKeys.length,
      skipped: 0,
      proof: `Aggregation refused — missing prerequisite evidence: ${missing.join(', ')}.`,
      hardLaunchClaim: false,
    });
    return false;
  }

  const passed = records.reduce((sum, r) => sum + Number(r.passed || 0), 0);
  const failed = records.reduce((sum, r) => sum + Number(r.failed || 0), 0);
  const artifactPaths = records.map((r) => r.artifactPath).filter(Boolean);

  upsertEvidenceRecord(root, {
    testName: 'businessWorkflows',
    suiteName: 'business-aggregate',
    source: 'record-postdeploy-aggregate-evidence',
    executionGenerated: true,
    exitCode: failed === 0 ? 0 : 1,
    commitSha,
    mainUrl: PRODUCTION.mainUrl,
    adminUrl: PRODUCTION.adminUrl,
    startedAt: records.map((r) => r.startedAt).sort()[0],
    finishedAt: records.map((r) => r.finishedAt).sort().slice(-1)[0],
    passed,
    failed,
    skipped: 0,
    proof: `Business workflows aggregate: ${businessKeys.length - failed}/${businessKeys.length} role suites clean for commit ${commitSha.slice(0, 8)}. Sources: ${artifactPaths.join(', ')}.`,
    hardLaunchClaim: false,
  });
  console.log(`[record-postdeploy-evidence] businessWorkflows passed=${passed} failed=${failed} (of ${businessKeys.length} role suites)`);
  return failed === 0;
}

const only = argValue('only');
let ok = true;
if (only === 'gate11') {
  ok = recordGate11();
} else if (only === 'business') {
  ok = recordBusinessAggregate();
} else {
  const gate11Ok = recordGate11();
  const businessOk = recordBusinessAggregate();
  ok = gate11Ok && businessOk;
}
process.exit(ok ? 0 : 1);
