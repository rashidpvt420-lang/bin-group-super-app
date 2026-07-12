#!/usr/bin/env node
/**
 * Launch status aggregator — never claims hard-launch GO while required automation is failing.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'launch_package');
const statusPath = path.join(outDir, 'launch-status.json');
const gatesPath = path.join(outDir, 'launch-proof-gates.json');
const evidencePath = path.join(outDir, 'launch-evidence-batch.json');
const pilotLockPath = path.join(outDir, 'pilot-start.lock.json');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    command: [cmd, ...args].join(' '),
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function gitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return (result.stdout || '').trim() || 'unknown';
}

const checks = [];
const required = [
  { name: 'functionsLoad', cmd: 'node', args: ['scripts/measure-functions-load.mjs'] },
  { name: 'e2eEnv', cmd: 'node', args: ['scripts/verify-e2e-env.mjs'] },
  { name: 'appCheckEnsure', cmd: 'node', args: ['scripts/ensure-appcheck.mjs'] },
  { name: 'adminFirebase', cmd: 'node', args: ['scripts/verify-admin-firebase-build.mjs'] },
  { name: 'launchClearance', cmd: 'node', args: ['scripts/verify-launch-clearance.mjs'] },
];

for (const item of required) {
  console.log(`\n[launch-status] running ${item.name}...`);
  const result = run(item.cmd, item.args);
  checks.push({
    name: item.name,
    command: result.command,
    exitCode: result.exitCode,
    ok: result.exitCode === 0,
  });
  if (result.exitCode !== 0) {
    console.error(result.stderr || result.stdout || `${item.name} failed`);
  }
}

const gates = readJson(gatesPath, {});
const evidence = readJson(evidencePath, { records: [] });
const failing = checks.filter((c) => !c.ok);
const automationOk = failing.length === 0;

const adminEvidence = (evidence.records || []).find(
  (r) => r.testName === 'adminCredentialLogin' && r.exitCode === 0 && r.commitSha === gitSha(),
);

const pilotEligible =
  automationOk &&
  Boolean(adminEvidence) &&
  String(gates?.deploymentProof?.firebaseHosting?.status || '').toLowerCase() !== 'failed';

if (!pilotEligible && existsSync(pilotLockPath)) {
  const lock = readJson(pilotLockPath, {});
  writeFileSync(
    pilotLockPath,
    JSON.stringify(
      {
        ...lock,
        status: 'invalidated',
        invalidatedAt: new Date().toISOString(),
        reason: 'Required automation failing or adminCredentialLogin evidence missing for current commit',
      },
      null,
      2,
    ) + '\n',
  );
  console.warn('[launch-status] invalidated pilot-start.lock.json');
}

mkdirSync(outDir, { recursive: true });
const status = {
  generatedAt: new Date().toISOString(),
  commitSha: gitSha(),
  automationOk,
  pilotEligible,
  hardLaunchClaim: false,
  checks,
  adminCredentialLoginRecorded: Boolean(adminEvidence),
  failing: failing.map((f) => f.name),
};

writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
console.log(`\n[launch-status] wrote ${statusPath}`);
console.log(`[launch-status] automationOk=${automationOk} pilotEligible=${pilotEligible} hardLaunchClaim=false`);

if (!automationOk) {
  console.error('[launch-status] FAIL — required automation failing; pilot must not start');
  process.exit(1);
}

console.log('[launch-status] PASS (automation green; hard-launch still not claimed)');
process.exit(0);
