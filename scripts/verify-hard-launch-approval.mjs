#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gitSha } from './lib/launch-honesty.mjs';
import {
  evaluateHardLaunchEligibility,
  hardLaunchStatusPath,
  readHardLaunchInputs,
  validateProtectedHardLaunchWorkflowContext,
} from './lib/hard-launch-gate.mjs';

const contextErrors = validateProtectedHardLaunchWorkflowContext(process.env);
if (contextErrors.length) {
  console.error('[hard-launch-status] REFUSED');
  for (const error of contextErrors) console.error(`- ${error}`);
  process.exit(1);
}

const root = process.cwd();
const commitSha = gitSha(root);
const expectedSha = String(process.env.HARD_LAUNCH_EXPECTED_SHA || '').trim();
if (!/^[0-9a-f]{40}$/.test(expectedSha) || expectedSha !== commitSha) {
  console.error('[hard-launch-status] REFUSED');
  console.error('- HARD_LAUNCH_EXPECTED_SHA must equal the checked-out release SHA');
  process.exit(1);
}
const inputs = readHardLaunchInputs(root);
const result = evaluateHardLaunchEligibility({ ...inputs, commitSha, root, env: process.env });
const output = hardLaunchStatusPath(root);
const status = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha,
  controlPlaneCommitSha: String(process.env.CLEARANCE_CONTROL_PLANE_SHA || process.env.GITHUB_SHA || '').trim(),
  pilotEligible: result.pilotEligible,
  hardLaunchEligible: result.hardLaunchEligible,
  hardLaunchClaim: result.hardLaunchClaim,
  errors: result.errors,
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(status, null, 2)}\n`);
if (!result.hardLaunchEligible) {
  console.error('[hard-launch-status] NO-GO');
  for (const error of result.errors) console.error(`- ${error}`);
  console.error(`hardLaunchClaim=${result.hardLaunchClaim}`);
  process.exit(1);
}
console.log(`[hard-launch-status] ELIGIBLE — release ${commitSha} prerequisites verified; signed final decision is still required`);
console.log('hardLaunchClaim=false');
