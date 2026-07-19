#!/usr/bin/env node
/**
 * Runs the existing postdeploy gate, then binds the canonical 11-gate
 * operational readiness snapshot into public-release-status.json.
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

const statusPath = path.resolve('launch_package/public-release-status.json');
const operationalPath = operationalReadinessPath();
const commitSha = String(process.env.GITHUB_SHA || '').trim();

const base = spawnSync(process.execPath, ['scripts/postdeploy-release-gate.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
if ((base.status ?? 1) !== 0) process.exit(base.status ?? 1);

const failures = [];
let status = null;
let operational = null;

if (!existsSync(statusPath)) failures.push('public-release-status.json missing after base postdeploy gate');
else {
  try { status = JSON.parse(readFileSync(statusPath, 'utf8')); }
  catch (error) { failures.push(`public-release-status.json malformed: ${error.message}`); }
}

if (!existsSync(operationalPath)) failures.push('operational-readiness.json missing');
else {
  try { operational = JSON.parse(readFileSync(operationalPath, 'utf8')); }
  catch (error) { failures.push(`operational-readiness.json malformed: ${error.message}`); }
}

if (!/^[0-9a-f]{40}$/.test(commitSha)) failures.push('GITHUB_SHA must be a full lowercase SHA');
if (operational) failures.push(...validateOperationalReadinessReport(operational, commitSha));
if (status?.status !== 'passed' || status?.publicReleaseCleared !== true) {
  failures.push('base postdeploy release status is not passed');
}

const uniqueFailures = [...new Set(failures)];
if (!status || typeof status !== 'object') status = {};
status.operationalReadinessVerified = uniqueFailures.length === 0;
status.operationalReadinessHash = uniqueFailures.length === 0 ? sha256File(operationalPath) : null;
status.operationalGateCount = uniqueFailures.length === 0 ? REQUIRED_OPERATIONAL_GATES.length : 0;
status.operationalGates = uniqueFailures.length === 0 ? [...REQUIRED_OPERATIONAL_GATES] : [];
status.failures = [...new Set([...(Array.isArray(status.failures) ? status.failures : []), ...uniqueFailures])];
status.status = status.failures.length === 0 ? 'passed' : 'failed';
status.publicReleaseCleared = status.status === 'passed';
status.hardLaunchClaim = false;
status.operationalEvaluatedAt = new Date().toISOString();
writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });

if (status.status !== 'passed') {
  console.error('[postdeploy-operational] FAIL — public release is not operationally cleared');
  for (const error of status.failures) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[postdeploy-operational] PASS — ${REQUIRED_OPERATIONAL_GATES.length} operational gates bound to public-release-status.json`);
