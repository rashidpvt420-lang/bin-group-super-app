#!/usr/bin/env node
/**
 * Execute a critical launch suite and record evidence ONLY from the real run.
 * Critical evidence cannot be manufactured via manual --exit-code / --source flags.
 *
 * Usage:
 *   node scripts/run-critical-evidence.mjs --suite businessOwner
 *   node scripts/run-critical-evidence.mjs --suite launchAuditLive
 *   node scripts/run-critical-evidence.mjs --suite productionDeployment
 *   node scripts/run-critical-evidence.mjs --suite all-business
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  HARD_LAUNCH_CLAIM,
  PRODUCTION,
  SUITE_SPECS,
  gitSha,
  parsePlaywrightJsonReport,
  sha256File,
  sha256Text,
  upsertEvidenceRecord,
  deploymentEvidencePath,
  readJsonSafe,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';

function argValue(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function usage() {
  console.error(`Usage: node scripts/run-critical-evidence.mjs --suite <name>
Suites: ${Object.keys(SUITE_SPECS).join(', ')}, productionDeployment, all-business, all-required`);
  process.exit(1);
}

const suiteArg = argValue('suite');
if (!suiteArg) usage();

const root = process.cwd();
const artifactsDir = path.join(root, 'launch_package', 'artifacts');
mkdirSync(artifactsDir, { recursive: true });
const commitSha = gitSha(root);
const mainUrl = String(process.env.E2E_BASE_URL || PRODUCTION.mainUrl).replace(/\/+$/, '');
const adminUrl = String(process.env.E2E_ADMIN_BASE_URL || PRODUCTION.adminUrl).replace(/\/+$/, '');

if (mainUrl !== PRODUCTION.mainUrl) {
  console.error(`[critical-evidence] E2E_BASE_URL must be production ${PRODUCTION.mainUrl} (got ${mainUrl})`);
  process.exit(1);
}

function runPlaywrightSuite(suiteKey, def) {
  const startedAt = new Date().toISOString();
  const reportPath = path.join(artifactsDir, `${def.suiteName}-${commitSha.slice(0, 8)}.json`);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  // Ensure env + appcheck gates first.
  const envGate = spawnSync(process.execPath, ['scripts/verify-e2e-env.mjs'], { stdio: 'inherit', env: process.env });
  if ((envGate.status ?? 1) !== 0) return { ok: false, exitCode: envGate.status ?? 1, startedAt, finishedAt: new Date().toISOString() };
  const appGate = spawnSync(process.execPath, ['scripts/ensure-appcheck.mjs'], { stdio: 'inherit', env: process.env });
  if ((appGate.status ?? 1) !== 0) return { ok: false, exitCode: appGate.status ?? 1, startedAt, finishedAt: new Date().toISOString() };

  const install = spawnSync(npmCmd, ['exec', '--', 'playwright', 'install', '--with-deps', 'chromium'], {
    stdio: 'inherit',
    env: process.env,
  });
  if ((install.status ?? 1) !== 0) {
    return { ok: false, exitCode: install.status ?? 1, startedAt, finishedAt: new Date().toISOString() };
  }

  const args = [
    'exec',
    '--',
    'playwright',
    'test',
    ...def.specs,
    '--project=chromium-desktop',
    '--reporter=json',
  ];
  const env = {
    ...process.env,
    E2E_BASE_URL: mainUrl,
    E2E_ADMIN_BASE_URL: adminUrl,
    E2E_STRICT_ROLES: def.requiresAdminUrl ? 'true' : process.env.E2E_STRICT_ROLES,
  };

  console.log(`[critical-evidence] running ${suiteKey}: ${def.specs.join(' ')}`);
  const result = spawnSync(npmCmd, args, { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  const finishedAt = new Date().toISOString();
  const exitCode = result.status ?? 1;
  const stdout = result.stdout || '';
  writeFileSync(reportPath, stdout || '{"suites":[],"stats":{}}');

  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    console.error('[critical-evidence] Playwright JSON report malformed or empty');
    return { ok: false, exitCode: exitCode || 1, startedAt, finishedAt, reportPath };
  }

  const parsed = parsePlaywrightJsonReport(report);
  if (!parsed.ok) {
    console.error(`[critical-evidence] report rejected: ${parsed.reason}`);
    return { ok: false, exitCode: exitCode || 1, startedAt, finishedAt, reportPath, parsed };
  }
  if (exitCode !== 0) {
    console.error(`[critical-evidence] process exitCode=${exitCode} — evidence not recorded`);
    return { ok: false, exitCode, startedAt, finishedAt, reportPath, parsed };
  }

  const artifactHash = sha256File(reportPath);
  for (const evidenceKey of def.evidenceKeys) {
    upsertEvidenceRecord(root, {
      testName: evidenceKey,
      suiteName: def.suiteName,
      source: `run-critical-evidence:${suiteKey}`,
      executionGenerated: true,
      exitCode: 0,
      commitSha,
      mainUrl,
      adminUrl: def.requiresAdminUrl || evidenceKey === 'adminCredentialLogin' ? adminUrl : adminUrl,
      startedAt,
      finishedAt,
      passed: parsed.passed,
      failed: parsed.failed,
      skipped: parsed.skipped,
      flaky: parsed.flaky || 0,
      artifactPath: path.relative(root, reportPath),
      artifactHash,
      proof: `Execution-generated ${evidenceKey} from ${def.suiteName} on ${mainUrl} (commit ${commitSha.slice(0, 8)}).`,
      hardLaunchClaim: HARD_LAUNCH_CLAIM,
    });
    console.log(`[critical-evidence] recorded ${evidenceKey} artifact=${artifactHash.slice(0, 12)}…`);
  }
  return { ok: true, exitCode: 0, startedAt, finishedAt, reportPath, parsed };
}

async function runProductionDeployment() {
  const startedAt = new Date().toISOString();
  const verify = spawnSync(process.execPath, ['scripts/verify-production-deployment.mjs', '--write-evidence'], {
    encoding: 'utf8',
    env: process.env,
  });
  process.stdout.write(verify.stdout || '');
  process.stderr.write(verify.stderr || '');
  const finishedAt = new Date().toISOString();
  const exitCode = verify.status ?? 1;
  if (exitCode !== 0) {
    console.error('[critical-evidence] production deployment verification failed — no evidence recorded');
    return { ok: false, exitCode };
  }

  const deployDoc = readJsonSafe(deploymentEvidencePath(root), null);
  const errors = validateDeploymentDocument(deployDoc, commitSha);
  if (errors.length) {
    console.error('[critical-evidence] deployment doc invalid after verify:');
    for (const e of errors) console.error(`- ${e}`);
    return { ok: false, exitCode: 1 };
  }

  const artifactHash = sha256Text(JSON.stringify(deployDoc));
  for (const key of ['productionDeployment', 'productionMainHosting', 'productionAdminHosting']) {
    upsertEvidenceRecord(root, {
      testName: key,
      suiteName: 'production-deployment',
      source: 'run-critical-evidence:productionDeployment',
      executionGenerated: true,
      exitCode: 0,
      commitSha,
      mainUrl: PRODUCTION.mainUrl,
      adminUrl: PRODUCTION.adminUrl,
      startedAt,
      finishedAt,
      passed: 1,
      failed: 0,
      skipped: 0,
      artifactHash,
      deploymentStatus: 'passed',
      projectId: PRODUCTION.projectId,
      deployedCommitSha: commitSha,
      httpChecksOk: true,
      bundleVerified: true,
      proof: `Execution-generated ${key} for ${PRODUCTION.projectId} at ${finishedAt}.`,
      hardLaunchClaim: HARD_LAUNCH_CLAIM,
    });
    console.log(`[critical-evidence] recorded ${key}`);
  }
  return { ok: true, exitCode: 0 };
}

const allBusiness = ['adminCredentialLogin', 'businessOwner', 'businessTenant', 'businessTechnician', 'businessBroker', 'businessGlobal'];

async function main() {
  if (suiteArg === 'productionDeployment') {
    const result = await runProductionDeployment();
    process.exit(result.ok ? 0 : result.exitCode || 1);
  }

  if (suiteArg === 'all-business' || suiteArg === 'all-required') {
    const suites = suiteArg === 'all-required'
      ? [...allBusiness, 'launchAuditLive']
      : allBusiness;
    let failed = 0;
    for (const key of suites) {
      const def = SUITE_SPECS[key];
      const result = runPlaywrightSuite(key, def);
      if (!result.ok) failed += 1;
    }
    if (suiteArg === 'all-required') {
      const deploy = await runProductionDeployment();
      if (!deploy.ok) failed += 1;
    }
    console.log(`[critical-evidence] hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
    process.exit(failed === 0 ? 0 : 1);
  }

  const def = SUITE_SPECS[suiteArg];
  if (!def) usage();
  const result = runPlaywrightSuite(suiteArg, def);
  console.log(`[critical-evidence] hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
  process.exit(result.ok ? 0 : result.exitCode || 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
