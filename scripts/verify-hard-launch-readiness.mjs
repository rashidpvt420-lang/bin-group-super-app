#!/usr/bin/env node
import { gitSha } from './lib/launch-honesty.mjs';
import { evaluateHardLaunchEligibility, readHardLaunchInputs } from './lib/hard-launch-gate.mjs';

const root = process.cwd();
const commitSha = gitSha(root);
const inputs = readHardLaunchInputs(root);
const result = evaluateHardLaunchEligibility({ ...inputs, commitSha, root });

console.log(`[hard-launch] Commit: ${commitSha}`);
console.log(`[hard-launch] Pilot eligible: ${result.pilotEligible}`);
console.log(`[hard-launch] Hard launch eligible: ${result.hardLaunchEligible}`);
console.log(`[hard-launch] hardLaunchClaim=${result.hardLaunchClaim}`);

if (!result.hardLaunchEligible) {
  console.error('[hard-launch] Result: NO-GO for unrestricted commercial launch.');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[hard-launch] Result: verified hard public launch gate passed.');
