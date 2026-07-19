#!/usr/bin/env node
/**
 * Protected decision entrypoint.
 *
 * Bank-pilot mode delegates to the existing signed decision gate unchanged.
 * Public mode first captures the canonical Firestore operational summary,
 * validates all 11 gates, binds its SHA-256 into public-release-status.json,
 * and only then invokes the signed final decision gate.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { sha256File } from './lib/launch-honesty.mjs';
import {
  REQUIRED_OPERATIONAL_GATES,
  operationalReadinessPath,
  validateOperationalReadinessReport,
} from './lib/hard-launch-gate.mjs';

const launchMode = String(process.env.LAUNCH_MODE || '').trim().toLowerCase();
const delegate = () => spawnSync(process.execPath, ['scripts/hard-launch-decision-gate.mjs'], {
  stdio: 'inherit',
  env: process.env,
});

if (launchMode !== 'public') {
  const result = delegate();
  process.exit(result.status ?? 1);
}

const fail = (message) => {
  console.error(`[hard-launch-operational-decision] FAIL — ${message}`);
  process.exit(1);
};

const commitSha = String(process.env.GITHUB_SHA || '').trim();
if (!/^[0-9a-f]{40}$/.test(commitSha)) fail('GITHUB_SHA must be a full lowercase SHA');

const capture = spawnSync(process.execPath, ['scripts/capture-operational-readiness.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
if ((capture.status ?? 1) !== 0) process.exit(capture.status ?? 1);

const operationalPath = operationalReadinessPath();
const releaseStatusPath = path.resolve('launch_package/public-release-status.json');
if (!existsSync(operationalPath)) fail('operational-readiness.json is missing after capture');
if (!existsSync(releaseStatusPath)) fail('public-release-status.json is missing');

let operational;
let releaseStatus;
try { operational = JSON.parse(readFileSync(operationalPath, 'utf8')); }
catch (error) { fail(`operational-readiness.json malformed: ${error.message}`); }
try { releaseStatus = JSON.parse(readFileSync(releaseStatusPath, 'utf8')); }
catch (error) { fail(`public-release-status.json malformed: ${error.message}`); }

const errors = validateOperationalReadinessReport(operational, commitSha);
if (releaseStatus.status !== 'passed' || releaseStatus.publicReleaseCleared !== true) {
  errors.push('public release status is not cleared');
}
if (errors.length) {
  console.error('[hard-launch-operational-decision] FAIL');
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  process.exit(1);
}

const operationalHash = sha256File(operationalPath);
releaseStatus.operationalReadinessVerified = true;
releaseStatus.operationalReadinessHash = operationalHash;
releaseStatus.operationalGateCount = REQUIRED_OPERATIONAL_GATES.length;
releaseStatus.operationalGates = [...REQUIRED_OPERATIONAL_GATES];
releaseStatus.operationalSource = operational.source;
releaseStatus.operationalSourceDocument = operational.sourceDocument;
releaseStatus.operationalSourceUpdatedAt = operational.sourceUpdatedAt;
releaseStatus.operationalEvaluatedAt = new Date().toISOString();
releaseStatus.hardLaunchClaim = false;
writeFileSync(releaseStatusPath, `${JSON.stringify(releaseStatus, null, 2)}\n`, { mode: 0o600 });

console.log(`[hard-launch-operational-decision] bound ${REQUIRED_OPERATIONAL_GATES.length} gates hash=${operationalHash.slice(0, 12)}…`);
const result = delegate();
process.exit(result.status ?? 1);
