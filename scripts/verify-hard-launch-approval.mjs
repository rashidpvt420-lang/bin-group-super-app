#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gitSha } from './lib/launch-honesty.mjs';
import {
  evaluateHardLaunchEligibility,
  hardLaunchStatusPath,
  readHardLaunchInputs,
} from './lib/hard-launch-gate.mjs';

const root = process.cwd();
const commitSha = gitSha(root);
const inputs = readHardLaunchInputs(root);
const result = evaluateHardLaunchEligibility({ ...inputs, commitSha, root });
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
writeFileSync(output, `${JSON.stringify(status, null, 2)}\n`);

if (!result.hardLaunchEligible) {
  console.error('[hard-launch-status] NO-GO');
  for (const error of result.errors) console.error(`- ${error}`);
  console.error(`hardLaunchClaim=${result.hardLaunchClaim}`);
  process.exit(1);
}

console.log('[hard-launch-status] ELIGIBLE — prerequisites verified; signed final decision is still required');
console.log('hardLaunchClaim=false');
