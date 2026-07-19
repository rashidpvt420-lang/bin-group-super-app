#!/usr/bin/env node
/**
 * Public-decision guard. The signed hard-launch decision may only be created
 * after public-release-status.json is cryptographically bound to the canonical
 * operational-readiness.json snapshot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { sha256File } from './lib/launch-honesty.mjs';
import {
  operationalReadinessPath,
  validateOperationalReadinessReport,
} from './lib/hard-launch-gate.mjs';

const fail = (message) => {
  console.error(`[hard-launch-operational-decision] FAIL — ${message}`);
  process.exit(1);
};

if (String(process.env.LAUNCH_MODE || '').trim().toLowerCase() !== 'public') {
  fail('this guard is only valid for LAUNCH_MODE=public');
}

const commitSha = String(process.env.GITHUB_SHA || '').trim();
if (!/^[0-9a-f]{40}$/.test(commitSha)) fail('GITHUB_SHA must be a full lowercase SHA');

const operationalPath = operationalReadinessPath();
const releaseStatusPath = path.resolve('launch_package/public-release-status.json');
if (!existsSync(operationalPath)) fail('operational-readiness.json is missing');
if (!existsSync(releaseStatusPath)) fail('public-release-status.json is missing');

let operational;
let releaseStatus;
try { operational = JSON.parse(readFileSync(operationalPath, 'utf8')); }
catch (error) { fail(`operational-readiness.json malformed: ${error.message}`); }
try { releaseStatus = JSON.parse(readFileSync(releaseStatusPath, 'utf8')); }
catch (error) { fail(`public-release-status.json malformed: ${error.message}`); }

const errors = validateOperationalReadinessReport(operational, commitSha);
const operationalHash = sha256File(operationalPath);
if (releaseStatus.status !== 'passed' || releaseStatus.publicReleaseCleared !== true) {
  errors.push('public release status is not cleared');
}
if (releaseStatus.operationalReadinessVerified !== true) {
  errors.push('public release status does not verify operational readiness');
}
if (releaseStatus.operationalReadinessHash !== operationalHash) {
  errors.push('public release operational readiness hash mismatch');
}
if (Number(releaseStatus.operationalGateCount || 0) !== Object.keys(operational.gates || {}).length) {
  errors.push('public release operational gate count mismatch');
}

if (errors.length) {
  console.error('[hard-launch-operational-decision] FAIL');
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  process.exit(1);
}

const decision = spawnSync(process.execPath, ['scripts/hard-launch-decision-gate.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(decision.status ?? 1);
