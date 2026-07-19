#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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
const commitSha = String(process.env.GITHUB_SHA || '').trim();
const inputs = readHardLaunchInputs(root);
const result = evaluateHardLaunchEligibility({ ...inputs, commitSha, root, env: process.env });
const output = hardLaunchStatusPath(root);
const status = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha,
  pilotEligible: result.pilotEligible,
  hardLaunchEligible: result.hardLaunchEligible,
  hardLaunchClaim: result.hardLaunchClaim,
  errors: result.errors,
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(status, null, 2)}
`);
if (!result.hardLaunchEligible) {
  console.error('[hard-launch-status] NO-GO');
  for (const error of result.errors) console.error(`- ${error}`);
  console.error(`hardLaunchClaim=${result.hardLaunchClaim}`);
  process.exit(1);
}
console.log('[hard-launch-status] ELIGIBLE — prerequisites verified; signed final decision is still required');
console.log('hardLaunchClaim=false');
