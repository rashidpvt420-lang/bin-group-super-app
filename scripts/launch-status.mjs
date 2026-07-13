#!/usr/bin/env node
/**
 * Launch status aggregator — fail closed.
 * Default mode evaluates controlled-pilot eligibility.
 * Pass --hard to require the protected hard-public-launch approval chain.
 */
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  REQUIRED_PILOT_EVIDENCE,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
} from './lib/launch-honesty.mjs';
import {
  evaluateHardLaunchEligibility,
  hardLaunchApprovalPath,
  pilotIncidentReportPath,
} from './lib/hard-launch-gate.mjs';

const root = process.cwd();
const outDir = path.join(root, 'launch_package');
const statusPath = path.join(outDir, 'launch-status.json');
const pilotLockPath = path.join(outDir, 'pilot-start.lock.json');
const hardMode = process.argv.includes('--hard') || process.env.LAUNCH_SCOPE === 'hard';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', cwd: root });
  return {
    command: [cmd, ...args].join(' '),
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const checks = [];

console.log('\n[launch-status] building Firebase Functions for current-commit discovery proof...');
const functionsBuild = run(npmCommand, ['run', 'build:functions']);
checks.push({
  name: 'functionsBuild',
  command: functionsBuild.command,
  exitCode: functionsBuild.exitCode,
  ok: functionsBuild.exitCode === 0,
});
if (functionsBuild.exitCode !== 0) {
  console.error(functionsBuild.stderr || functionsBuild.stdout || 'functionsBuild failed');
}

const required = [
  { name: 'functionsLoad', cmd: 'node', args: ['scripts/measure-functions-load.mjs'] },
  { name: 'e2eEnv', cmd: 'node', args: ['scripts/verify-e2e-env.mjs'] },
  { name: 'appCheckEnsure', cmd: 'node', args: ['scripts/ensure-appcheck.mjs'] },
  { name: 'adminFirebase', cmd: 'node', args: ['scripts/verify-admin-firebase-build.mjs'] },
  { name: 'productionDeployment', cmd: 'node', args: ['scripts/verify-production-deployment.mjs'] },
  { name: 'pilotClearance', cmd: 'node', args: ['scripts/verify-launch-clearance.mjs', '--pilot'] },
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

const sha = gitSha(root);
const evidence = readJsonSafe(evidencePath(root), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(root), null);
const incidentReport = readJsonSafe(pilotIncidentReportPath(root), null);
const approvalDoc = readJsonSafe(hardLaunchApprovalPath(root), null);
const eligibility = evaluatePilotEligibility({
  evidenceBatch: evidence,
  commitSha: sha,
  deploymentDoc,
  root,
});
const hardEligibility = evaluateHardLaunchEligibility({
  evidenceBatch: evidence,
  deploymentDoc,
  incidentReport,
  approvalDoc,
  commitSha: sha,
  root,
});

const failingChecks = checks.filter((check) => !check.ok);
const missingEvidence = eligibility.missing;
const invalidEvidence = eligibility.invalid;
const automationOk =
  failingChecks.length === 0 &&
  missingEvidence.length === 0 &&
  invalidEvidence.length === 0;
const pilotEligible = automationOk && eligibility.pilotEligible === true;
const hardLaunchEligible = pilotEligible && hardEligibility.hardLaunchEligible === true;
const hardLaunchClaim = hardLaunchEligible;

if (!pilotEligible && existsSync(pilotLockPath)) {
  const lock = readJsonSafe(pilotLockPath, {});
  writeFileSync(
    pilotLockPath,
    `${JSON.stringify({
      ...lock,
      status: 'invalidated',
      invalidatedAt: new Date().toISOString(),
      reason: 'Required automation/evidence failing — pilot not eligible',
      commitSha: sha,
      hardLaunchClaim: false,
    }, null, 2)}\n`,
  );
  console.warn('[launch-status] invalidated pilot-start.lock.json');
}

mkdirSync(outDir, { recursive: true });
const status = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  scope: hardMode ? 'hard-public-launch' : 'controlled-pilot',
  commitSha: sha,
  automationOk,
  pilotEligible,
  hardLaunchEligible,
  hardLaunchClaim,
  requiredEvidence: [...REQUIRED_PILOT_EVIDENCE],
  missingEvidence,
  invalidEvidence,
  hardLaunchErrors: hardEligibility.errors,
  checks,
  failing: [
    ...failingChecks.map((failure) => failure.name),
    ...missingEvidence.map((key) => `evidence:${key}`),
    ...invalidEvidence,
    ...(hardMode ? hardEligibility.errors.map((error) => `hard-launch:${error}`) : []),
  ],
};

writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
console.log(`\n[launch-status] wrote ${statusPath}`);
console.log(`[launch-status] automationOk=${automationOk} pilotEligible=${pilotEligible} hardLaunchEligible=${hardLaunchEligible} hardLaunchClaim=${hardLaunchClaim}`);
if (missingEvidence.length) console.error(`[launch-status] missing evidence: ${missingEvidence.join(', ')}`);
if (invalidEvidence.length) console.error(`[launch-status] invalid evidence:\n- ${invalidEvidence.join('\n- ')}`);
if (hardMode && hardEligibility.errors.length) {
  console.error(`[launch-status] hard launch blockers:\n- ${hardEligibility.errors.join('\n- ')}`);
}

if (!automationOk || !pilotEligible) {
  console.error('[launch-status] FAIL — required automation/evidence failing; pilot and hard launch blocked');
  process.exit(1);
}

if (hardMode && !hardLaunchEligible) {
  console.error('[launch-status] HARD PUBLIC LAUNCH: NO-GO');
  process.exit(1);
}

if (hardMode) {
  console.log('[launch-status] HARD PUBLIC LAUNCH: GO — protected approval chain verified');
} else {
  console.log(`[launch-status] CONTROLLED PILOT: GO; hardLaunchClaim=${hardLaunchClaim}`);
}
