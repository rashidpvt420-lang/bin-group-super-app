#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/firebase-production-deploy.yml', 'utf8');
const verifier = await readFile('scripts/verify-same-run-deployment-artifact.mjs', 'utf8');

test('public deploy artifact upload is not blocked before final postdeploy decision', () => {
  const verifyStep = workflow.indexOf('Verify production deployment metadata and same-run bindings after deploy');
  const uploadStep = workflow.indexOf('Upload production deployment metadata after verification');
  const postdeployJob = workflow.indexOf('public-release-clearance:');

  assert.ok(verifyStep > 0, 'same-run verifier step must exist');
  assert.ok(uploadStep > verifyStep, 'deployment artifact upload must happen after same-run verification');
  assert.ok(postdeployJob > uploadStep, 'postdeploy job must run after production metadata upload');
  assert.match(workflow, /launch_package\/hard-launch-decision\.json/);
});

test('same-run verifier writes only a signed provisional public decision', () => {
  assert.match(verifier, /status: 'public-awaiting-postdeploy-clearance'/);
  assert.match(verifier, /hardLaunchClaim: false/);
  assert.match(verifier, /signDocument\(payload, hmacKey\)/);
  assert.match(verifier, /LAUNCH_MODE/);
  assert.doesNotMatch(verifier, /hardLaunchClaim:\s*true/);
});

test('final public decision remains postdeploy-only', () => {
  const finalDecision = workflow.indexOf('Create signed hard-launch decision after postdeploy clearance');
  const postdeployGate = workflow.indexOf('Postdeploy release gate');
  assert.ok(finalDecision > postdeployGate, 'hardLaunchClaim true-capable decision gate must run after postdeploy gate');
  assert.match(workflow, /POSTDEPLOY_RELEASE_CLEARED:\s*\$\{\{\s*steps\.postdeploy_gate\.outputs\.cleared\s*\}\}/);
});
