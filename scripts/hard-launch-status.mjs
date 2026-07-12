#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  readJsonStrict,
  sha256File,
  validateHardLaunchDecisionDocument,
} from './lib/hard-launch-control.mjs';
import { gitSha } from './lib/launch-honesty.mjs';

const root = process.cwd();
const launchPackage = path.join(root, 'launch_package');
const files = {
  decision: path.join(launchPackage, 'hard-launch-decision.json'),
  authorization: path.join(launchPackage, 'hard-launch-authorization.json'),
  incidents: path.join(launchPackage, 'production-incidents.json'),
  deployment: path.join(launchPackage, 'production-deployment.json'),
  liveEvidence: path.join(launchPackage, 'launch-evidence-batch.json'),
  pilotStatus: path.join(launchPackage, 'launch-status.json'),
  hardStatus: path.join(launchPackage, 'hard-launch-status.json'),
};

const pilotResult = spawnSync(process.execPath, ['scripts/launch-status.mjs'], {
  cwd: root,
  env: process.env,
  encoding: 'utf8',
});
process.stdout.write(pilotResult.stdout || '');
process.stderr.write(pilotResult.stderr || '');

const failures = [];
if ((pilotResult.status ?? 1) !== 0) failures.push('pilot launch-status did not pass');

let pilotStatus;
try {
  pilotStatus = readJsonStrict(files.pilotStatus, 'launch-status.json');
  if (pilotStatus.automationOk !== true) failures.push('launch-status automationOk must equal true');
  if (pilotStatus.pilotEligible !== true) failures.push('launch-status pilotEligible must equal true');
  if (pilotStatus.hardLaunchClaim === true) failures.push('pilot launch-status must not claim hard launch');
} catch (error) {
  failures.push(error.message);
}

const expectedHashes = {};
for (const key of ['authorization', 'incidents', 'deployment', 'liveEvidence']) {
  const filePath = files[key];
  if (!existsSync(filePath)) failures.push(`hard-launch dependency is missing: ${key}`);
  else expectedHashes[key] = sha256File(filePath);
}

let decision;
try {
  decision = readJsonStrict(files.decision, 'hard-launch-decision.json');
  failures.push(
    ...validateHardLaunchDecisionDocument(decision, {
      commitSha: gitSha(root),
      repository: String(process.env.GITHUB_REPOSITORY || ''),
      hmacKey: String(process.env.HARD_LAUNCH_APPROVAL_HMAC_KEY || ''),
      expectedHashes,
    }),
  );
} catch (error) {
  failures.push(error.message);
}

const uniqueFailures = [...new Set(failures)];
const status = {
  generatedAt: new Date().toISOString(),
  commitSha: gitSha(root),
  pilotEligible: pilotStatus?.pilotEligible === true,
  hardLaunchClaim: uniqueFailures.length === 0,
  decisionStatus: decision?.status || 'missing',
  decisionApprovedAt: decision?.approvedAt || null,
  workflowRunId: decision?.workflowRunId || null,
  failures: uniqueFailures,
};

mkdirSync(launchPackage, { recursive: true });
writeFileSync(files.hardStatus, `${JSON.stringify(status, null, 2)}\n`);
console.log(`[hard-launch-status] wrote ${files.hardStatus}`);

if (uniqueFailures.length) {
  console.error('[hard-launch-status] FAIL — hard public launch remains blocked');
  for (const failure of uniqueFailures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[hard-launch-status] PASS — hard public launch approved for this exact production commit');
console.log('[hard-launch-status] hardLaunchClaim=true');
